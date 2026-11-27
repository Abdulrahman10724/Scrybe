import crypto from "crypto";
import bcrypt from "bcryptjs";

import {
  createUser,
  ensureUserIndexes,
  findUserByEmail,
  findUserById,
  sanitizeUser,
  setEmailVerificationToken,
  clearEmailVerificationToken,
  findUserByVerificationToken,
  markEmailVerified,
} from "../models/user.model.js";
import {
  clearPasswordResetToken,
  consumePasswordResetToken,
  findUserByPasswordResetToken,
  getTokenVersion,
  incrementTokenVersion,
  setPasswordResetToken,
} from "../models/user.model.js";
import {
  claimSessionForRotation,
  createSession,
  findSessionById,
  findSessionByToken,
  linkReplacement,
  revokeAllSessionsForUser,
  revokeSessionByToken,
} from "../models/session.model.js";
import config from "../config/env.config.js";
import { signAccessToken } from "../utils/jwt.util.js";
import { enqueueEmailJob } from "../queues/email.queue.js";
import logger from "../utils/logger.util.js";

// Two tabs restoring the session at the same moment both send the same
// refresh cookie; the loser of that race would otherwise look exactly like
// token theft. Within this window a just-rotated token still yields a new
// access token (but no new refresh token) instead of revoking everything.
const ROTATION_GRACE_MS = 10 * 1000;

const hashForLog = (value) =>
  crypto.createHash("sha256").update(String(value || "").trim().toLowerCase()).digest("hex").slice(0, 12);

const unauthorized = (message = "Session expired. Please sign in again.", code = "SESSION_INVALID") => {
  const error = new Error(message);
  error.statusCode = 401;
  error.code = code;
  return error;
};

const issueAccessToken = (user) =>
  signAccessToken({ id: user._id.toString(), tokenVersion: getTokenVersion(user) });

// Creates a refresh-token session and returns everything the controller
// needs: the public payload ({ user, token }) and the raw refresh token
// for the httpOnly cookie.
const startSession = async (user, { userAgent } = {}) => {
  const { rawToken, session } = await createSession({
    userId: user._id.toString(),
    userAgent,
    ttlDays: config.REFRESH_TOKEN_TTL_DAYS,
  });

  return {
    payload: { user: sanitizeUser(user), token: issueAccessToken(user) },
    refreshToken: rawToken,
    sessionId: session._id,
  };
};

const refreshSession = async ({ refreshToken, userAgent } = {}) => {
  if (!refreshToken) throw unauthorized("No active session");

  const session = await findSessionByToken(refreshToken);
  if (!session) throw unauthorized();

  const user = await findUserById(session.userId.toString());
  if (!user) throw unauthorized();

  if (session.revokedAt) {
    const sinceRevoked = Date.now() - new Date(session.revokedAt).getTime();
    const successor = session.replacedById ? await findSessionById(session.replacedById) : null;
    const benignRace =
      session.revokedReason === "rotated" &&
      sinceRevoked < ROTATION_GRACE_MS &&
      // Successor may not be linked yet in a tight race; if it is, it must
      // still be live (a logout in between ends the grace).
      (!successor || !successor.revokedAt);

    if (benignRace) {
      return { payload: { user: sanitizeUser(user), token: issueAccessToken(user) }, refreshToken: null };
    }

    if (session.revokedReason === "rotated") {
      // A refresh token that was already exchanged is being replayed: assume
      // it leaked. Kill every session and every outstanding access token.
      await revokeAllSessionsForUser(user._id.toString(), "reuse-detected");
      await incrementTokenVersion(user._id.toString());
      logger.warn("refresh token reuse detected; all sessions revoked", { userId: user._id.toString() });
      throw unauthorized("Session expired. Please sign in again.", "REFRESH_TOKEN_REUSED");
    }

    throw unauthorized();
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) throw unauthorized();

  const claimed = await claimSessionForRotation(session._id);
  if (!claimed) {
    // Lost a race with a concurrent refresh of the same token; take the
    // revoked-token path (grace window or reuse detection) after a beat so
    // the winner has linked its replacement session.
    await new Promise((resolve) => setTimeout(resolve, 50));
    return refreshSession({ refreshToken, userAgent });
  }

  const next = await startSession(user, { userAgent: userAgent || session.userAgent });
  await linkReplacement(session._id, next.sessionId);
  return next;
};

const logout = async ({ refreshToken } = {}) => {
  if (refreshToken) {
    await revokeSessionByToken(refreshToken, "logout");
  }
  return { success: true };
};

const logoutAll = async (userId) => {
  await revokeAllSessionsForUser(userId, "logout-all");
  await incrementTokenVersion(userId);
  return { success: true };
};

const register = async ({ name, email, password }, { userAgent } = {}) => {
  await ensureUserIndexes();

  const existingUser = await findUserByEmail(email);

  if (existingUser) {
    const error = new Error("A user with this email already exists");
    error.statusCode = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await createUser({ name, email, password: hashedPassword });
  const verificationToken = crypto.randomBytes(32).toString("hex");
  await setEmailVerificationToken(user._id, verificationToken);

  try {
    await enqueueEmailJob({
      type: "verification",
      to: user.email,
      name: user.name,
      token: verificationToken,
      userId: user._id.toString(),
    });
  } catch (error) {
    logger.warn("verification email job enqueue failed", { message: error?.message, userId: user._id.toString() });
  }

  return startSession(user, { userAgent });
};

const login = async ({ email, password }, { userAgent } = {}) => {
  await ensureUserIndexes();

  const user = await findUserByEmail(email);

  if (!user) {
    // No raw email in logs: a short one-way hash still lets operators
    // correlate repeated failures for the same address.
    logger.warn("login: unknown account", { emailHash: hashForLog(email) });
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  const passwordMatches = await bcrypt.compare(password, user.password);

  if (!passwordMatches) {
    logger.warn("login: password mismatch", { userId: user._id.toString() });
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  // Unverified users still receive a session: it only unlocks /auth/me,
  // resend/verify and logout (enforced server-side in auth.middleware.js and
  // the Socket.IO handshake), which the verify-required screen needs.
  return startSession(user, { userAgent });
};

const verifyEmail = async ({ token }) => {
  if (!token) {
    const error = new Error("Verification token is required");
    error.statusCode = 400;
    throw error;
  }

  const user = await findUserByVerificationToken(token);

  if (!user) {
    const error = new Error("This verification link is invalid or has already been used");
    error.statusCode = 400;
    throw error;
  }

  if (user.emailVerified) {
    return { alreadyVerified: true, user: sanitizeUser(user) };
  }

  const expiresAt = user.emailVerificationExpiresAt ? new Date(user.emailVerificationExpiresAt) : null;

  if (!expiresAt || expiresAt.getTime() < Date.now()) {
    await clearEmailVerificationToken(user._id);
    const error = new Error("This verification link has expired");
    error.statusCode = 410;
    throw error;
  }

  await markEmailVerified(user._id);
  return { alreadyVerified: false, user: sanitizeUser({ ...user, emailVerified: true }) };
};

const resendVerificationEmail = async ({ email }) => {
  if (!email || typeof email !== "string") {
    const error = new Error("Email is required");
    error.statusCode = 400;
    throw error;
  }

  const user = await findUserByEmail(email);

  if (!user || user.emailVerified) {
    return { success: true };
  }

  const verificationToken = crypto.randomBytes(32).toString("hex");
  await setEmailVerificationToken(user._id, verificationToken);

  try {
    await enqueueEmailJob({
      type: "verification",
      to: user.email,
      name: user.name,
      token: verificationToken,
      userId: user._id.toString(),
    });
  } catch (error) {
    logger.warn("verification email job enqueue failed", { message: error?.message, userId: user._id.toString() });
  }

  return { success: true };
};

// Always resolves the same way whether or not the account exists (no
// account enumeration). The email is queued fire-and-forget so response
// time doesn't depend on Redis either.
const forgotPassword = async ({ email }) => {
  await ensureUserIndexes();
  const user = await findUserByEmail(email);

  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    await setPasswordResetToken(user._id, token);
    enqueueEmailJob({
      type: "password-reset",
      to: user.email,
      name: user.name,
      token,
      userId: user._id.toString(),
    }).catch((error) => {
      logger.warn("password reset email job enqueue failed", { message: error?.message, userId: user._id.toString() });
    });
  }

  return { success: true };
};

const resetPassword = async ({ token, password }) => {
  const resetError = (statusCode, message, code) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
  };

  const user = await findUserByPasswordResetToken(token);
  if (!user) {
    throw resetError(400, "This reset link is invalid or has already been used.", "RESET_TOKEN_INVALID");
  }

  if (!user.passwordResetExpiresAt || new Date(user.passwordResetExpiresAt).getTime() <= Date.now()) {
    await clearPasswordResetToken(user._id);
    throw resetError(410, "This reset link has expired. Please request a new one.", "RESET_TOKEN_EXPIRED");
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const updated = await consumePasswordResetToken(token, hashedPassword);
  if (!updated) {
    // Used (or expired) between the lookup and the atomic update.
    throw resetError(400, "This reset link is invalid or has already been used.", "RESET_TOKEN_INVALID");
  }

  // tokenVersion was bumped in the same update; also end every session.
  await revokeAllSessionsForUser(updated._id.toString(), "password-reset");
  logger.info("password reset completed", { userId: updated._id.toString() });
  return { success: true };
};

export {
  register,
  login,
  verifyEmail,
  resendVerificationEmail,
  refreshSession,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
};

export default {
  register,
  login,
  verifyEmail,
  resendVerificationEmail,
  refreshSession,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
};