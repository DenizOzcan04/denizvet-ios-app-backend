import express from "express";
import Blog from "../models/Blog.js";
import auth from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

const makeExcerpt = (content = "", max = 180) => {
  const s = String(content).replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + "…" : s;
};

const calcReadTime = (content = "") => {
  const words = String(content).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
};

router.get("/", async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: -1 });
    res.json(blogs);
  } catch (err) {
    console.error("Blog list error:", err);
    res.status(500).json({ message: "Bloglar yüklenirken bir hata oluştu" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog bulunamadı" });
    res.json(blog);
  } catch (err) {
    console.error("Blog detail error:", err);
    res.status(500).json({ message: "Blog detay alınırken bir hata oluştu" });
  }
});

router.post("/", auth, adminMiddleware, async (req, res) => {
  try {
    const { title, content, imageUrl } = req.body;

    const cleanTitle = title?.trim();
    const cleanContent = content?.trim();

    if (!cleanTitle || !cleanContent) {
      return res.status(400).json({ message: "Başlık ve içerik zorunludur." });
    }

    const excerpt = makeExcerpt(cleanContent);
    const readTime = calcReadTime(cleanContent);

    const blog = await Blog.create({
      title: cleanTitle,
      content: cleanContent,
      excerpt,
      readTime,
      imageUrl: imageUrl?.trim() || "",
      publishedAt: new Date(),
    });

    return res.status(201).json({ message: "Blog oluşturuldu.", blog });
  } catch (err) {
    console.error("Blog create error:", err);
    return res.status(500).json({
      message: "Blog oluşturulurken hata oluştu.",
      error: err?.message,
    });
  }
});

router.put("/:id", auth, adminMiddleware, async (req, res) => {
  try {
    const { title, content, imageUrl } = req.body;

    const cleanTitle = title?.trim();
    const cleanContent = content?.trim();

    if (!cleanTitle || !cleanContent) {
      return res.status(400).json({ message: "Başlık ve içerik zorunludur." });
    }

    const excerpt = makeExcerpt(cleanContent);
    const readTime = calcReadTime(cleanContent);

    const updated = await Blog.findByIdAndUpdate(
      req.params.id,
      {
        title: cleanTitle,
        content: cleanContent,
        excerpt,
        readTime,
        imageUrl: imageUrl?.trim() || "",
        updatedAt: new Date(),
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Blog bulunamadı." });
    }

    return res.status(200).json({ message: "Blog güncellendi.", blog: updated });
  } catch (err) {
    console.error("Blog update error:", err);
    return res.status(500).json({
      message: "Blog güncellenirken hata oluştu.",
      error: err?.message,
    });
  }
});

router.delete("/:id", auth, adminMiddleware, async (req, res) => {
  try {
    const deleted = await Blog.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Blog bulunamadı." });
    }
    return res.status(200).json({ message: "Blog silindi." });
  } catch (err) {
    console.error("Blog delete error:", err);
    return res.status(500).json({ message: "Blog silinirken hata oluştu." });
  }
});

export default router;
