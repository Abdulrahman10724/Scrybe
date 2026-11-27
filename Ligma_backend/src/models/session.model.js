import crypto from "crypto";
import { ObjectId } from "mongodb";

import { getCollection } from "../config/db.config.js";

// Refresh-token sessions. Only a sha256 hash of the 256-bit refresh token is
// stored; the raw value lives in the httpOnly "scrybe_rt" cookie.
const COLLECTION_NAME = "sessions";

const getSessionsCollection = () => getCollection(COLLECTION_NAME);

let sessionIndexesReady = false;

const ensureSessionIndexes = async () => {
  if (sessionIndexesReady) return;
  const collection = getSessionsCollection();
  await collection.createIndex({ tokenHash: 1 }, { unique: true });
  await collection.createIndex({ userId: 1, revokedAt: 1 });
  // MongoDB drops sessions once they expire.
  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  sessionIndexesReady = true;
};

const hashRefreshToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

const generateRefreshToken = () => crypto.randomBytes(32).toString("base64url"); // 256 bits

const createSession = async ({ userId, userAgent = "", ttlDays }) => {
  await ensureSessionIndexes();

  const rawToken = generateRefreshToken();
  const now = new Date();
  const document = {
    userId: new ObjectId(userId),
    tokenHash: hashRefreshToken(rawToken),
    createdAt: now,
    expiresAt: new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000),
    userAgent: String(userAgent || "").slice(0, 512),
    revokedAt: null,
    revokedReason: null,
    replacedById: null,
  };

  const result = await getSessionsCollection().insertOne(document);
  return { rawToken, session: { ...document, _id: result.insertedId } };
};

const findSessionByToken = async (rawToken) => {
  if (!rawToken) return null;
  return getSessionsCollection().findOne({ tokenHash: hashRefreshToken(rawToken) });
};

const findSessionById = async (sessionId) => getSessionsCollection().findOne({ _id: new ObjectId(sessionId) });

// Atomically marks an active session as used. Returns null if another
// request already consumed or revoked it (refresh tokens are single use).
const claimSessionForRotation = async (sessionId) =>
  getSessionsCollection().findOneAndUpdate(
    { _id: new ObjectId(sessionId), revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: "rotated" } },
    { returnDocument: "after", includeResultMetadata: false },
  );

const linkReplacement = async (sessionId, replacedById) =>
  getSessionsCollection().updateOne({ _id: new ObjectId(sessionId) }, { $set: { replacedById } });

const revokeSessionByToken = async (rawToken, reason = "logout") => {
  if (!rawToken) return null;
  return getSessionsCollection().findOneAndUpdate(
    { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
    { returnDocument: "after", includeResultMetadata: false },
  );
};

const revokeAllSessionsForUser = async (userId, reason) =>
  getSessionsCollection().updateMany(
    { userId: new ObjectId(userId), revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );

export {
  COLLECTION_NAME,
  ensureSessionIndexes,
  hashRefreshToken,
  createSession,
  findSessionByToken,
  findSessionById,
  claimSessionForRotation,
  linkReplacement,
  revokeSessionByToken,
  revokeAllSessionsForUser,
};
