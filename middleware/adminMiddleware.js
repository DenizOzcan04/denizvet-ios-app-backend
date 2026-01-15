export default function adminMiddleware(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Bu işlem için yetkiniz yok." });
  }
  next();
}
