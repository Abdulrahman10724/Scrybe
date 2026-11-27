import {
  register,
  login,
  verifyEmail,
  resendVerificationEmail,
  refreshSession,
  logout,
  logoutAll,
} from "../services/auth.service.js";
import { sendSuccess } from "../utils/api-response.util.js";
import { verifyAccessToken } from "../utils/jwt.util.js";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "../utils/auth-cookie.util.js";

const requestContext = (req) => ({ userAgent: req.get("user-agent") || "" });

const respondWithSession = (res, statusCode, message, session) => {
  if (session.refreshToken) {
    setRefreshCookie(res, session.refreshToken);
  }
  return sendSuccess(res, statusCode, message, session.payload);
};

const registerUser = async (req, res, next) => {
  try {
    const session = await register(req.body, requestContext(req));
    return respondWithSession(res, 201, "Registration successful", session);
  } catch (error) {
    return next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const session = await login(req.body, requestContext(req));
    return respondWithSession(res, 200, "Login successful", session);
  } catch (error) {
    return next(error);
  }
};

// Exchanges the refresh cookie for a new access token and rotates the
// cookie (single use).
const refreshUser = async (req, res, next) => {
  try {
    const session = await refreshSession({ refreshToken: readRefreshCookie(req), ...requestContext(req) });
    return respondWithSession(res, 200, "Session refreshed", session);
  } catch (error) {
    if (error.statusCode === 401) clearRefreshCookie(res);
    return next(error);
  }
};

const getMe = async (req, res) => sendSuccess(res, 200, "Authenticated user retrieved successfully", { user: req.user });

const verifyEmailUser = async (req, res, next) => {
  try {
    const result = await verifyEmail({ token: req.body?.token || req.query?.token });
    return sendSuccess(res, 200, result.alreadyVerified ? "Email was already verified" : "Email verified successfully", result);
  } catch (error) {
    return next(error);
  }
};

const resendVerificationEmailUser = async (req, res, next) => {
  try {
    let email = req.body?.email;

    // Fallback: body me email na ho to valid token se le lo
    if (!email) {
      const header = req.headers.authorization;
      if (header?.startsWith("Bearer ")) {
        try {
          const decoded = verifyAccessToken(header.split(" ")[1]);
          if (decoded?.id) {
            const { findUserById } = await import("../models/user.model.js");
            email = (await findUserById(decoded.id))?.email;
          }
        } catch {
          /* invalid token: neeche "Email is required" aayega */
        }
      }
    }

    const result = await resendVerificationEmail({ email });
    return sendSuccess(res, 200, "If the account exists, a verification email has been sent", result);
  } catch (error) {
    return next(error);
  }
};

// Revokes the current refresh-token session (this device) and clears the
// cookie. Outstanding access tokens expire within ACCESS_TOKEN_TTL.
const logoutUser = async (req, res, next) => {
  try {
    await logout({ refreshToken: readRefreshCookie(req) });
    clearRefreshCookie(res);
    return sendSuccess(res, 200, "Logout successful");
  } catch (error) {
    return next(error);
  }
};

// Revokes every session and bumps tokenVersion, so all access tokens on
// every device stop working immediately.
const logoutAllUser = async (req, res, next) => {
  try {
    await logoutAll(req.user.id);
    clearRefreshCookie(res);
    return sendSuccess(res, 200, "Logged out of all devices");
  } catch (error) {
    return next(error);
  }
};

export {
  registerUser,
  loginUser,
  refreshUser,
  getMe,
  verifyEmailUser,
  resendVerificationEmailUser,
  logoutUser,
  logoutAllUser,
};

export default {
  registerUser,
  loginUser,
  refreshUser,
  getMe,
  verifyEmailUser,
  resendVerificationEmailUser,
  logoutUser,
  logoutAllUser,
};
