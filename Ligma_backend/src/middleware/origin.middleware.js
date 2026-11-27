import config from "../config/env.config.js";

// CSRF guard for the cookie-authenticated auth endpoints (refresh, logout,
// logout-all). The refresh cookie is SameSite=Lax, which already blocks
// cross-site POSTs in modern browsers; this check also rejects requests from
// any other origin (and requests without an Origin header) explicitly.
const allowedOrigin = () => new URL(config.CLIENT_URL).origin;

const requireTrustedOrigin = (req, res, next) => {
  const origin = req.get("origin");
  let normalized = null;
  try {
    normalized = origin ? new URL(origin).origin : null;
  } catch {
    normalized = null;
  }

  if (!normalized || normalized !== allowedOrigin()) {
    const error = new Error("Request origin is not allowed");
    error.statusCode = 403;
    error.code = "INVALID_ORIGIN";
    return next(error);
  }

  return next();
};

export { requireTrustedOrigin };

export default requireTrustedOrigin;
