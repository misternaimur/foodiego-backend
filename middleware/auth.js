const jwt = require("jsonwebtoken");

// ============================================================
// AUTH MIDDLEWARE
// ------------------------------------------------------------
// Verifies the "Authorization: Bearer <token>" header issued by
// POST /api/users/login and attaches the decoded payload
// (userId, role) to req.user for routes that need to know who
// is calling them.
// ============================================================
function protect(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

module.exports = { protect };
