import bcrypt from "bcrypt";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import express from "express";
import auth from "../middleware/authMiddleware.js";

const router = express.Router();

function buildAuthPayload(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    surname: user.surname,
    phone: user.phone,
    username: user.username || null,
    role: user.role,
    clinic: user.clinic ? user.clinic.toString() : null,
  };
}

function signTokenForUser(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      role: user.role || "user",
      clinic: user.clinic ? user.clinic.toString() : null,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

router.post("/signup", async (req, res) => {
  const { name, surname, phone, password } = req.body;

  if (!name || !surname || !phone || !password) {
    return res.status(400).json({ message: "Tüm alanlar zorunludur." });
  }

  try {
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Bu telefon numarasıyla kayıtlı bir hesap mevcut." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = new User({ name, surname, phone, passwordHash });
    await newUser.save();

    res.status(201).json({ message: "Kullanıcı başarıyla kaydedildi" });
  } catch (error) {
    console.log("Signup error:", error);
    res
      .status(500)
      .json({ message: "Kayıt işlemi sırasında sunucu hatası oluştu" });
  }
});


router.post("/login", async (req, res) => {
  console.log("login endpointine post isteğinde bulunuldu");

  const phone = req.body.phone?.trim();
  const password = req.body.password;

  if (!phone || !password) {
    return res
      .status(400)
      .json({ message: "Telefon numarası veya şifre gerekli." });
  }

  try {
    const user = await User.findOne({ phone: phone });

    if (!user) {
      return res
        .status(401)
        .json({ message: "Telefon numarası veya şifre hatalı." });
    }

    if ((user.role || "user") === "vet") {
      return res.status(403).json({
        message: "Veteriner klinik hesabı için klinik giriş ekranını kullanın.",
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res
        .status(401)
        .json({ message: "Telefon numarası veya şifre hatalı." });
    }

    const token = signTokenForUser(user);

    console.log("Login başarılı, user id:", user._id.toString());

    res.status(200).json({
      message: "Giriş başarılı.",
      token,
      user: buildAuthPayload(user),
    });
  } catch (error) {
    console.log("Giriş yapılırken hata oluştu:", error);
    res.status(500).json({ message: "Sunucu hatası", error });
  }
});

router.post("/vet/login", async (req, res) => {
  const username = req.body.username?.trim().toLowerCase();
  const password = req.body.password;

  if (!username || !password) {
    return res.status(400).json({ message: "Kullanıcı adı ve şifre gerekli." });
  }

  try {
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(401).json({ message: "Kullanıcı adı veya şifre hatalı." });
    }

    if ((user.role || "user") !== "vet") {
      return res.status(403).json({
        message: "Bu hesap veteriner klinik girişi için yetkili değil.",
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Kullanıcı adı veya şifre hatalı." });
    }

    const token = signTokenForUser(user);

    return res.status(200).json({
      message: "Veteriner klinik girişi başarılı.",
      token,
      user: buildAuthPayload(user),
    });
  } catch (error) {
    console.log("Vet login error:", error);
    return res.status(500).json({ message: "Sunucu hatası" });
  }
});

router.get("/protected", auth, (req, res) => {
  res.json({ message: `Hoş geldin ${req.user.id}` });
});


router.get("/profile", auth, async (req, res) => {
  try {
    console.log("Profile route, req.user:", req.user);

    const user = await User.findById(req.user.id);

    console.log("Profile route, bulunan user:", user);

    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    }

    return res.status(200).json(buildAuthPayload(user));
  } catch (error) {
    console.error("Profile route error:", error);
    return res.status(500).json({
      message: "Sunucu hatası.",
      error: { name: error.name, message: error.message },
    });
  }
});


router.put("/profile", auth, async (req, res) => {
  try {
    const { name, surname, phone } = req.body;

    if (!name || !surname || !phone) {
      return res.status(400).json({ message: "Tüm alanlar zorunludur." });
    }

    const existingWithPhone = await User.findOne({
      phone,
      _id: { $ne: req.user.id },
    });

    if (existingWithPhone) {
      return res
        .status(400)
        .json({ message: "Bu telefon numarası başka bir kullanıcıya ait." });
    }

    const updated = await User.findByIdAndUpdate(
      req.user.id,
      { name, surname, phone },
      { new: true } 
    );

    if (!updated) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    }

    return res.status(200).json({
      message: "Profil başarıyla güncellendi.",
      user: buildAuthPayload(updated),
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return res.status(500).json({
      message: "Profil güncellenirken sunucu hatası oluştu.",
      error: { name: error.name, message: error.message },
    });
  }
});

router.post("/admin/login", async (req, res) => {
  const phone = req.body.phone?.trim();
  const password = req.body.password;

  if (!phone || !password) {
    return res.status(400).json({ message: "Telefon numarası veya şifre gerekli." });
  }

  try {
    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(401).json({ message: "Telefon numarası veya şifre hatalı." });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Telefon numarası veya şifre hatalı." });
    }

    if ((user.role || "user") !== "admin") {
      return res.status(403).json({ message: "Bu panele erişim yetkiniz yok." });
    }

    const token = signTokenForUser(user);

    return res.status(200).json({
      message: "Admin giriş başarılı.",
      token,
      user: buildAuthPayload(user),
    });
  } catch (error) {
    console.log("Admin login error:", error);
    return res.status(500).json({ message: "Sunucu hatası" });
  }
});

//mobilde şifre değişikliği 
router.put("/change-password", auth, async (req, res) => {
  const currentPassword = req.body.currentPassword;
  const newPassword = req.body.newPassword;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Mevcut şifre ve yeni şifre gerekli." });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: "Şifre en az 6 karakter olmalı." });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Mevcut şifre hatalı." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = passwordHash;
    await user.save();

    return res.status(200).json({ message: "Şifre başarıyla güncellendi." });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ message: "Sunucu hatası." });
  }
});



export default router;
