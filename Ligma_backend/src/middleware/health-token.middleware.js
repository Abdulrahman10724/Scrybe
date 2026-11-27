import crypto from "crypto";

import config from "../config/env.config.js";

// Guards internal diagnostics (/health/queues, /api/v1/health/ip). Send the token in the X-Health-Token header.
// With HEALTH_TOKEN unset the endpoints are disabled (404), never open.
const requireHealthToken = (req, res, next) => {
  const expected = config.HEALTH_TOKEN;
  if (!expected) {
    return res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
  }

  const provided = String(req.get("x-health-token") || "");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  return next();
};

export { requireHealthToken };

export default requireHealthToken;
