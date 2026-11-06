
const jwt = require("jsonwebtoken");

// Verify JWT authentication
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  // Check Authorization header
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Authentication token required.",
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is missing",
    });
  }

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not configured");

    return res.status(500).json({
      success: false,
      message: "Authentication service is not configured",
    });
  }

  // Verify token signature and expiration
  jwt.verify(
    token,
    process.env.JWT_SECRET,
    {
      issuer: "dispatchflow-api",
    },
    (error, decoded) => {
      if (error) {
        return res.status(401).json({
          success: false,
          message:
            error.name === "TokenExpiredError"
              ? "Authentication token has expired"
              : "Invalid authentication token",
        });
      }

      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
      };

      next();
    }
  );
}

// Restrict access based on user role
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource",
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles,
};

