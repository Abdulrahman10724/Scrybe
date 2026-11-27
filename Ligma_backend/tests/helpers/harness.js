// Shared integration-test harness: boots an in-memory MongoDB replica set
// (so transactions work), the real Express app and Socket.IO on an
// ephemeral port. Redis is disabled; BullMQ enqueue calls reject
// immediately and are already caught by the services.
import http from "node:http";
import crypto from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";

export const CLIENT_URL = "http://localhost:5173";

let replSet;
let server;
let baseUrl;
let modules;

export const startHarness = async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });

  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = replSet.getUri("scrybe_test");
  process.env.JWT_SECRET = "test-secret-" + crypto.randomBytes(8).toString("hex");
  process.env.CLIENT_URL = CLIENT_URL;
  process.env.SOCKET_CORS_ORIGIN = CLIENT_URL;
  process.env.REDIS_ENABLED = "false";
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || "error";
  process.env.HEALTH_TOKEN = "health-test-token";

  const db = await import("../../src/config/db.config.js");
  await db.connectDB();
  const { createApp } = await import("../../src/app.js");
  const socket = await import("../../src/socket/socket.service.js");

  const app = createApp();
  server = http.createServer(app);
  socket.initSocket(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  modules = { db, app, socket };
  return { app, baseUrl, db: db.getDb() };
};

export const stopHarness = async () => {
  try {
    modules?.socket?.getIO()?.close();
  } catch {
    /* not initialised */
  }
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await modules?.db?.closeDB();
  await replSet?.stop();
};

export const getBaseUrl = () => baseUrl;
