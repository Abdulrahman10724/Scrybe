import config from "../config/env.config.js";

// How req.ip is derived
// ─────────────────────
// Production traffic arrives in two ways:
//   REST:      browser → Vercel (vercel.json rewrite) → Render edge → app
//   Socket.IO: browser → Render edge → app            (not rate-limited here)
// Each proxy appends the address it received the request from to
// X-Forwarded-For. Express' "trust proxy" = N trusts the N right-most hops,
// so req.ip is the first address left of them. With only Render trusted
// (N=1) every proxied request would get Vercel's egress IP and all users
// would share one rate-limit bucket; TRUST_PROXY_HOPS=2 (Render + Vercel)
// makes req.ip the real browser IP again. A request sent straight to Render
// still resolves correctly when it carries no X-Forwarded-For of its own.
//
// Caveat: a client calling Render directly can prepend a fake
// X-Forwarded-For entry and pick its own req.ip. peerAddress() below is the
// address that actually connected to Render's edge (Vercel or that client)
// and cannot be forged; app.js applies a coarse limiter keyed on it.
// GET /api/v1/health/ip (HEALTH_TOKEN) shows the observed chain for calibration.

const forwardedChain = (req) => {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [req.socket?.remoteAddress || "", ...forwarded.reverse()];
};

const peerAddress = (req) => {
  const chain = forwardedChain(req);
  const index = Math.min(Math.max(config.TRUST_PROXY_HOPS - 1, 1), chain.length - 1);
  return chain[Math.max(index, 0)] || req.ip;
};

export { forwardedChain, peerAddress };
