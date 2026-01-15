export default function vetMiddleware(req, res, next) { 
    if(req.user && req.user.role === "vet") {   
        return next();
    }
    return res.status(403).json({message: "Yetkisiz erişim"})
}