import { ObjectId } from "mongodb";

import { findUserById, sanitizeUser } from "../models/user.model.js";
import { verifyAccessToken } from "../utils/jwt.util.js";

const httpError = (statusCode, message, code) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
};

const emailNotVerifiedError = () =>
  httpError(403, "Please verify your email before continuing.", "EMAIL_NOT_VERIFIED");

// Resolves the bearer token on a request (or a socket handshake) to a user
// document. Throws 401 for any token problem.
const resolveUserFromToken = async (token) => {
  if (!token) {
    throw httpError(401, "Unauthorized");
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    throw httpError(401, "Invalid or expired token");
  }

  if (!decoded?.id || !ObjectId.isValid(decoded.id)) {
    throw httpError(401, "Invalid or expired token");
  }

  const user = await findUserById(decoded.id);

  if (!user) {
    throw httpError(401, "User not found");
  }

  return { user, decoded };
};

// requireVerified (default true): unverified accounts get 403 EMAIL_NOT_VERIFIED.
// Only the handful of auth routes an unverified user needs (/auth/me,
// resend/verify, logout) opt out with { requireVerified: false }.
const authenticate = ({ requireVerified = true } = {}) =>
  async (req, res, next) => {
    try {
      const header = req.headers.authorization;

      if (!header || !header.startsWith("Bearer ")) {
        throw httpError(401, "Unauthorized");
      }

      const { user } = await resolveUserFromToken(header.split(" ")[1]);

      if (requireVerified && !user.emailVerified) {
        throw emailNotVerifiedError();
      }

      req.user = sanitizeUser(user);
      req.auth = {
        userId: req.user.id,
        email: req.user.email,
      };

      return next();
    } catch (error) {
      error.statusCode = error.statusCode || 401;
      error.message = error.message || "Unauthorized";
      return next(error);
    }
  };

const authMiddleware = authenticate();
const authAllowUnverified = authenticate({ requireVerified: false });

export { authenticate, authMiddleware, authAllowUnverified, resolveUserFromToken, emailNotVerifiedError };

export default authMiddleware;
