import { Router } from "express";
import rateLimit from "express-rate-limit";

import { authAllowUnverified } from "../middleware/auth.middleware.js";
import validate from "../middleware/validate.middleware.js";
import authLimiter from "../middleware/rate-limit.middleware.js";
import crypto from "crypto";
import { ipKeyGenerator } from "express-rate-limit";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "../validation/auth.validation.js";
import requireTrustedOrigin from "../middleware/origin.middleware.js";
import {
  forgotPasswordUser,
  resetPasswordUser,
  getMe,
  loginUser,
  logoutAllUser,
  logoutUser,
  refreshUser,
  registerUser,
  verifyEmailUser,
  resendVerificationEmailUser,
} from "../controllers/auth.controller.js";

const router = Router();
const verificationResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many verification emails requested. Please try again later.",
  },
  statusCode: 429,
});

// Password reset: limited per IP and, separately, per target email so a
// single address can't be mail-bombed from many IPs. The limit applies
// whether or not the account exists, so it reveals nothing.
const forgotPasswordIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many password reset requests. Please try again later." },
  statusCode: 429,
});
const forgotPasswordEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    return email
      ? `forgot:${crypto.createHash("sha256").update(email).digest("hex")}`
      : `forgot-ip:${ipKeyGenerator(req.ip)}`;
  },
  message: { success: false, message: "Too many password reset requests. Please try again later." },
  statusCode: 429,
});
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Please try again later." },
  statusCode: 429,
});

router.post(
  "/forgot-password",
  forgotPasswordIpLimiter,
  validate(forgotPasswordSchema),
  forgotPasswordEmailLimiter,
  forgotPasswordUser,
);
router.post("/reset-password", resetPasswordLimiter, validate(resetPasswordSchema), resetPasswordUser);
router.post("/register", authLimiter, validate(registerSchema), registerUser);
router.post("/login", authLimiter, validate(loginSchema), loginUser);
router.post("/verify-email", verifyEmailUser);
router.post("/resend-verification", verificationResendLimiter, resendVerificationEmailUser);
// /me stays reachable for unverified users so the verify-required screen
// can poll for the verified flag; every other protected route rejects them.
router.get("/me", authAllowUnverified, getMe);
// Cookie-authenticated endpoints: Origin must be CLIENT_URL (CSRF guard).
router.post("/refresh", requireTrustedOrigin, refreshUser);
router.post("/logout", requireTrustedOrigin, logoutUser);
router.post("/logout-all", requireTrustedOrigin, authAllowUnverified, logoutAllUser);

export default router;