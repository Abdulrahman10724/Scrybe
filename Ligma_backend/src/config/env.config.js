import dotenv from "dotenv";
import { z } from "zod";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root
dotenv.config({ path: path.join(__dirname, "../../.env") });

const isProd = process.env.NODE_ENV === "production";

const envSchema = z.object({
  PORT: z.string().transform((val) => parseInt(val, 10)).default("5000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  // Short-lived access token (kept in memory by the frontend) + long-lived
  // rotating refresh token in an httpOnly cookie (see auth.service.js).
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z
    .string()
    .optional()
    .default("30")
    .transform((v) => {
      const days = Number.parseInt(v, 10);
      return Number.isFinite(days) && days > 0 ? days : 30;
    }),
  // Number of reverse proxies in front of the app whose X-Forwarded-For
  // entries are trusted (see src/utils/client-ip.util.js). 1 = Render only,
  // 2 = Vercel rewrite + Render (production).
  TRUST_PROXY_HOPS: z
    .string()
    .optional()
    .default("1")
    .transform((v) => {
      const hops = Number.parseInt(v, 10);
      return Number.isInteger(hops) && hops >= 0 ? hops : 1;
    }),
  // Per-peer cap (address that connected to Render). Shared by every user
  // behind one Vercel egress IP, so keep it generous.
  PEER_RATE_LIMIT_MAX: z
    .string()
    .optional()
    .default("20000")
    .transform((v) => Number.parseInt(v, 10) || 20000),
  // Shared secret for GET /health/queues and /api/v1/health/ip (X-Health-Token
  // header). Leave empty to disable those endpoints.
  HEALTH_TOKEN: z.string().optional().default(""),
  // Secure flag on the refresh cookie. Defaults to true in production.
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? isProd : v.toLowerCase() === "true")),
  // In production OPENROUTER_API_KEY must be provided. In development/test it's optional so server can start without a key.
  OPENROUTER_API_KEY: isProd ? z.string().min(1, "OPENROUTER_API_KEY is required") : z.string().optional().default("") ,
  OPENROUTER_MODEL: z.string().default("qwen/qwen3-next-80b-a3b-instruct:free"),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  OPENROUTER_CHAT_ENDPOINT: z.string().default("/chat/completions"),
  SOCKET_CORS_ORIGIN: z.string().default("http://localhost:5173"),
  AUTH_RATE_LIMIT_WINDOW_MS: z.string().transform((v) => parseInt(v, 10)).default("900000"), // 15 min
AUTH_RATE_LIMIT_MAX: z.string().transform((v) => parseInt(v, 10)).default("20"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  // Email delivery — Brevo transactional email API over HTTPS
  // (src/services/email.service.js). GMAIL_USER is the verified Brevo
  // *sender address* (the name is historical); no Gmail/SMTP is used.
  BREVO_API_KEY: z.string().optional().default(""),
  GMAIL_USER: z.string().optional().default(""),
  // Redis — BullMQ job queues and the Socket.IO Redis adapter.
  // Defaults to localhost; Docker Compose overrides it with the "redis"
  // service name.
  REDIS_URL: z.string().default("redis://localhost:6379"),
  // Set to "false" to run without Redis (tests / minimal local dev): BullMQ
  // queues reject immediately instead of buffering, and Socket.IO uses the
  // in-memory adapter (single instance only).
  REDIS_ENABLED: z
    .string()
    .optional()
    .default("true")
    .transform((v) => v.toLowerCase() !== "false"),
});
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export default parsed.data;
