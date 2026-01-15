import jwt from "jsonwebtoken";

const auth = (req, res, next) => {
  try {
    let token;


    const header =
      req.headers.authorization ||
      req.headers.Authorization ||
      req.header("authorization") ||
      req.header("Authorization");

    if (header && header.startsWith("Bearer ")) {
      token = header.split(" ")[1];
    }

    if (!token) {
      token = req.header("x-auth-token");
    }

    if (!token) {
      return res.status(401).json({ message: "Token bulunamadı." });
    }

    const decoded = jwt.verify(token.trim(), process.env.JWT_SECRET);

    req.user = {
      id: decoded.id,
      role: decoded.role || "user",
    };

    next();
  } catch (error) {
    console.log("Auth middleware hatası:", error);
    return res.status(401).json({
      message: "Geçersiz veya süresi dolmuş token.",
      error: { name: error.name, message: error.message },
    });
  }
};

export default auth;
