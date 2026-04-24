import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import auth from "../middleware/authMiddleware.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "..", "data");
const datasetPath = path.join(dataDir, "petHealthDataset.json");
const personalityPath = path.join(dataDir, "vetAssistantPersonality.json");

let cachedDataset = null;
let cachedPersonality = null;

async function loadDataset() {
  if (cachedDataset) return cachedDataset;
  const raw = await fs.readFile(datasetPath, "utf8");
  cachedDataset = JSON.parse(raw);
  return cachedDataset;
}

async function loadPersonality() {
  if (cachedPersonality) return cachedPersonality;
  const raw = await fs.readFile(personalityPath, "utf8");
  cachedPersonality = JSON.parse(raw);
  return cachedPersonality;
}

function normalizeText(value = "") {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value = "") {
  const stopWords = new Set([
    "ve", "veya", "ile", "icin", "ama", "gibi", "cok", "az", "bir", "bu", "su",
    "ben", "sen", "o", "da", "de", "mi", "mu", "mı", "mü", "ki", "var", "yok",
    "hem", "daha", "sonra", "once", "icin", "olarak", "kadar", "çok", "şey",
    "pet", "hayvan", "evcil"
  ]);

  return normalizeText(value)
    .split(" ")
    .filter((word) => word.length >= 3 && !stopWords.has(word));
}

function detectEmergency(message, personality) {
  const normalized = normalizeText(message);
  return (personality.emergency_keywords_tr || []).some((keyword) =>
    normalized.includes(normalizeText(keyword))
  );
}

function inferFollowUpBucket(message, relevantEntries) {
  const normalized = normalizeText(message);
  const conditions = relevantEntries.map((entry) => normalizeText(entry.condition || ""));

  if (conditions.some((item) => item.includes("digestive")) || /kus|ishal|diski|karin|istah/.test(normalized)) {
    return "digestive";
  }

  if (conditions.some((item) => item.includes("skin")) || /kasi|deri|tuy|kizar|yara/.test(normalized)) {
    return "skin";
  }

  if (/nefes|oksur|hiril|solunum/.test(normalized)) {
    return "respiratory";
  }

  return "general";
}

function selectRelevantDatasetEntries(message, dataset, limit = 8) {
  const queryTokens = tokenize(message);
  const querySet = new Set(queryTokens);

  const ranked = dataset
    .map((entry) => {
      const haystack = `${entry.text || ""} ${entry.condition || ""} ${entry.record_type || ""}`;
      const entryTokens = tokenize(haystack);
      let score = 0;

      for (const token of entryTokens) {
        if (querySet.has(token)) score += 2;
      }

      if (normalizeText(entry.condition || "").includes(normalizeText(message))) {
        score += 3;
      }

      if ((entry.record_type || "") === "Owner Observation") {
        score += 1;
      }

      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const results = [];
  const seenTexts = new Set();

  for (const item of ranked) {
    const text = item.entry.text || "";
    if (seenTexts.has(text)) continue;
    seenTexts.add(text);
    results.push(item.entry);
    if (results.length >= limit) break;
  }

  return results;
}

function buildSystemPrompt(personality, emergencyDetected, followUpQuestions) {
  const exampleOpenings = (personality.tone?.example_opening_phrases || []).join(" | ");
  const neverSay = (personality.answer_rules?.never_say || []).join(" | ");

  return [
    `${personality.assistant_name || "Veteriner asistani"} rolundesin.`,
    `Rol: ${personality.role || ""}`,
    `Kimlik: ${personality.core_identity?.description || ""}`,
    `Temel hedef: ${personality.core_identity?.main_goal || ""}`,
    `Ton: ${personality.tone?.style || ""}. Türkçe cevap ver, robotik olma.`,
    "Kesin tani koyma. Tedavi reçetesi veya doz verme. İnsan ilaci önerme.",
    "Gerekirse acil veterinere yönlendir. Panik dili kullanma ama riski net söyle.",
    `Yanit uzunlugu: ${personality.answer_rules?.max_length || "Kisa ve net ol."}`,
    "Cevabi kullanici dostu ve sade dille ver.",
    "Gerekiyorsa maddeler kullan.",
    `Her cevapta su uyariyi aynen en sonda kullan: ${personality.answer_rules?.disclaimer_text || ""}`,
    `Asla soyleme: ${neverSay}`,
    `Giris cumlesi icin ornek tonlar: ${exampleOpenings}`,
    emergencyDetected
      ? "Kullanicinin mesajinda acil risk olabilecek ifadeler var. Cevap daha net ve kisa olsun, vakit kaybetmeden veterinere gidilmesini oner."
      : "Acil degilse sakin ve yonlendirici kal.",
    `Takip sorulari icin bu havuzdan uygun olanlari sec: ${followUpQuestions.join(" | ")}`
  ].join("\n");
}

function buildReferencePrompt(message, relevantEntries) {
  if (!relevantEntries.length) {
    return `Kullanici sorusu: ${message}\n\nReferans dataset'te dogrudan eslesen kayit bulunamadi. Yine de genel ve guvenli bir veteriner on bilgilendirmesi yap.`;
  }

  const references = relevantEntries
    .map(
      (entry, index) =>
        `${index + 1}. [${entry.condition} / ${entry.record_type}] ${entry.text}`
    )
    .join("\n");

  return [
    `Kullanici sorusu: ${message}`,
    "",
    "Asagidaki dataset kayitlari sadece arka plan referansidir. Bunlari birebir kopyalama, daha dogal Türkçe ile kullaniciya acikla:",
    references
  ].join("\n");
}

router.post("/chat", auth, async (req, res) => {
  try {
    const apiKey = (
      process.env.OPENAI_API_KEY ||
      process.env.OPEN_AI_KEY ||
      ""
    ).trim();
    if (!apiKey) {
      return res.status(500).json({ message: "OpenAI API anahtari tanimli degil." });
    }

    const incomingMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const normalizedMessages = incomingMessages
      .filter(
        (message) =>
          message &&
          ["user", "assistant"].includes(message.role) &&
          typeof message.content === "string" &&
          message.content.trim().length > 0
      )
      .slice(-10);

    const latestUserMessage = [...normalizedMessages].reverse().find((message) => message.role === "user");

    if (!latestUserMessage) {
      return res.status(400).json({ message: "Gecerli bir kullanici mesaji gerekli." });
    }

    const [dataset, personality] = await Promise.all([loadDataset(), loadPersonality()]);

    const emergencyDetected = detectEmergency(latestUserMessage.content, personality);
    const relevantEntries = selectRelevantDatasetEntries(latestUserMessage.content, dataset);
    const followUpBucket = inferFollowUpBucket(latestUserMessage.content, relevantEntries);
    const followUpQuestions = personality.follow_up_questions?.[followUpBucket] ||
      personality.follow_up_questions?.general ||
      [];

    const systemPrompt = buildSystemPrompt(personality, emergencyDetected, followUpQuestions);
    const referencePrompt = buildReferencePrompt(latestUserMessage.content, relevantEntries);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: emergencyDetected ? 0.2 : 0.45,
        max_tokens: 500,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "system",
            content: "Dataset kullanim kurali: Dataset sadece referans. Dogrudan satir kopyalama, kullanici dostu yeni bir cevap uret."
          },
          {
            role: "system",
            content: referencePrompt
          },
          ...normalizedMessages.map((message) => ({
            role: message.role,
            content: message.content.trim(),
          })),
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const apiMessage = data?.error?.message || "OpenAI istegi basarisiz oldu.";
      return res.status(500).json({ message: apiMessage });
    }

    const answer = data?.choices?.[0]?.message?.content?.trim();

    if (!answer) {
      return res.status(500).json({ message: "Bos yanit dondu." });
    }

    return res.status(200).json({
      message: "Yanıt oluşturuldu.",
      answer,
      emergencyDetected,
      matchedConditions: [...new Set(relevantEntries.map((entry) => entry.condition).filter(Boolean))].slice(0, 3),
    });
  } catch (error) {
    console.log("Ask vet chat hatasi:", error);
    return res.status(500).json({ message: "Veterinerime Sor yaniti olusturulamadi." });
  }
});

export default router;
