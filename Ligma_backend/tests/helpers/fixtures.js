import crypto from "node:crypto";
import request from "supertest";
import { io as ioClient } from "socket.io-client";
import { ObjectId } from "mongodb";

import { CLIENT_URL, getBaseUrl } from "./harness.js";

export const PASSWORD = "correct-horse-battery";

export const uniqueEmail = (prefix = "user") =>
  `${prefix}-${crypto.randomBytes(5).toString("hex")}@example.com`;

// Registers a user through the real API and optionally marks it verified
// directly in the database (the email link itself is covered elsewhere).
export const registerUser = async (app, db, { verified = true, name = "Test User", email } = {}) => {
  const address = email || uniqueEmail();
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ name, email: address, password: PASSWORD });

  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  const user = res.body.data.user;
  if (verified) {
    await db.collection("users").updateOne({ _id: new ObjectId(user.id) }, { $set: { emailVerified: true } });
  }

  return {
    user,
    email: address,
    token: res.body.data.token,
    cookies: res.headers["set-cookie"] || [],
  };
};

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });

export const createWorkspace = async (app, token, title = "Test Workspace") => {
  const res = await request(app).post("/api/v1/workspaces").set(bearer(token)).send({ title, description: "" });
  if (res.status !== 201) throw new Error(`create workspace failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.workspace;
};

export const addMember = async (db, workspaceId, userId, role = "Contributor") => {
  const now = new Date();
  await db.collection("workspaceMembers").insertOne({
    workspaceId: new ObjectId(workspaceId),
    userId: new ObjectId(userId),
    role,
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  });
};

export const connectSocket = (token) =>
  new Promise((resolve, reject) => {
    const socket = ioClient(getBaseUrl(), {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
      extraHeaders: { Origin: CLIENT_URL },
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (error) => {
      socket.close();
      reject(error);
    });
  });

export const emitAck = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

// Resolves with the first payload of `event`, or `null` after `ms`.
export const waitForEvent = (socket, event, ms = 500) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(null);
    }, ms);
    const handler = (payload) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler);
  });

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
