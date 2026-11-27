import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";

import { CLIENT_URL, startHarness, stopHarness } from "./helpers/harness.js";
import {
  PASSWORD,
  bearer,
  connectSocket,
  refreshCookieFrom,
  refreshRequest,
  registerUser,
} from "./helpers/fixtures.js";

let ctx;
before(async () => {
  ctx = await startHarness();
});
after(stopHarness);

const login = async (email) => {
  const res = await request(ctx.app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { token: res.body.data.token, refresh: refreshCookieFrom(res.headers["set-cookie"]), res };
};

test("login sets a hardened refresh cookie and a short-lived access token with tv", async () => {
  const { email } = await registerUser(ctx.app, ctx.db);
  const { token, refresh, res } = await login(email);

  const cookie = res.headers["set-cookie"].find((c) => c.startsWith("scrybe_rt="));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Path=\/api\/v1\/auth/);

  const decoded = jwt.decode(token);
  assert.equal(decoded.tv, 0);
  assert.ok(decoded.exp - decoded.iat <= 15 * 60, "access token lives at most 15 minutes");

  const sessions = await ctx.db.collection("sessions").find({ userId: new ObjectId(decoded.id) }).toArray();
  assert.ok(sessions.length >= 1);
  for (const session of sessions) {
    assert.equal(session.tokenHash.length, 64, "only a sha256 hash is stored");
    assert.notEqual(session.tokenHash, refresh);
  }
});

test("refresh rotates the token, and replaying a rotated token revokes everything", async () => {
  const { email, user } = await registerUser(ctx.app, ctx.db);
  const first = await login(email);
  const otherDevice = await login(email);

  const rotated = await refreshRequest(ctx.app, first.refresh);
  assert.equal(rotated.status, 200, JSON.stringify(rotated.body));
  const second = refreshCookieFrom(rotated.headers["set-cookie"]);
  assert.ok(second && second !== first.refresh, "a new refresh token is issued");
  assert.ok(rotated.body.data.token);

  // Push the rotation outside the concurrent-tab grace window, then replay.
  await ctx.db
    .collection("sessions")
    .updateMany(
      { userId: new ObjectId(user.id), revokedReason: "rotated" },
      { $set: { revokedAt: new Date(Date.now() - 60_000) } },
    );
  const replay = await refreshRequest(ctx.app, first.refresh);
  assert.equal(replay.status, 401);
  assert.equal(replay.body.code, "REFRESH_TOKEN_REUSED");

  // Every session of the user is dead, and so are outstanding access tokens.
  assert.equal((await refreshRequest(ctx.app, second)).status, 401);
  assert.equal((await refreshRequest(ctx.app, otherDevice.refresh)).status, 401);
  const api = await request(ctx.app).get("/api/v1/workspaces").set(bearer(rotated.body.data.token));
  assert.equal(api.status, 401);
});

test("two tabs refreshing with the same cookie at once both succeed", async () => {
  const { email } = await registerUser(ctx.app, ctx.db);
  const { refresh } = await login(email);

  const [a, b] = await Promise.all([refreshRequest(ctx.app, refresh), refreshRequest(ctx.app, refresh)]);
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(b.status, 200, JSON.stringify(b.body));
});

test("refresh, logout and logout-all reject foreign or missing Origin", async () => {
  const { email, token } = await registerUser(ctx.app, ctx.db);
  const { refresh } = await login(email);

  const evil = await refreshRequest(ctx.app, refresh, "https://evil.example");
  assert.equal(evil.status, 403);
  assert.equal(evil.body.code, "INVALID_ORIGIN");
  assert.equal((await refreshRequest(ctx.app, refresh, null)).status, 403);

  const logout = await request(ctx.app)
    .post("/api/v1/auth/logout")
    .set("Origin", "https://evil.example")
    .set("Cookie", `scrybe_rt=${refresh}`);
  assert.equal(logout.status, 403);
  const logoutAll = await request(ctx.app)
    .post("/api/v1/auth/logout-all")
    .set(bearer(token))
    .set("Origin", "https://evil.example");
  assert.equal(logoutAll.status, 403);

  // The cookie is still valid after the rejected attempts.
  assert.equal((await refreshRequest(ctx.app, refresh)).status, 200);
});

test("logout revokes the current session and clears the cookie", async () => {
  const { email } = await registerUser(ctx.app, ctx.db);
  const { refresh } = await login(email);

  const res = await request(ctx.app)
    .post("/api/v1/auth/logout")
    .set("Origin", CLIENT_URL)
    .set("Cookie", `scrybe_rt=${refresh}`);
  assert.equal(res.status, 200);
  assert.ok(res.headers["set-cookie"].some((c) => c.startsWith("scrybe_rt=;")), "cookie cleared");

  assert.equal((await refreshRequest(ctx.app, refresh)).status, 401);
});

test("logout-all kills every device, every access token and new socket handshakes", async () => {
  const { email } = await registerUser(ctx.app, ctx.db);
  const laptop = await login(email);
  const phone = await login(email);

  const res = await request(ctx.app).post("/api/v1/auth/logout-all").set("Origin", CLIENT_URL).set(bearer(laptop.token));
  assert.equal(res.status, 200, JSON.stringify(res.body));

  for (const device of [laptop, phone]) {
    assert.equal((await refreshRequest(ctx.app, device.refresh)).status, 401);
    assert.equal((await request(ctx.app).get("/api/v1/workspaces").set(bearer(device.token))).status, 401);
  }
  await assert.rejects(connectSocket(phone.token), (error) => error.message === "Unauthorized");

  // Logging in again works and carries the new token version.
  const again = await login(email);
  assert.equal(jwt.decode(again.token).tv, 1);
  assert.equal((await request(ctx.app).get("/api/v1/workspaces").set(bearer(again.token))).status, 200);
});

test("access tokens without a matching tv (e.g. pre-deploy tokens) are rejected", async () => {
  const { user } = await registerUser(ctx.app, ctx.db);
  const legacy = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1d" });
  assert.equal((await request(ctx.app).get("/api/v1/auth/me").set(bearer(legacy))).status, 401);
  await assert.rejects(connectSocket(legacy), (error) => error.message === "Unauthorized");
});

test("auth responses never expose token hashes or tokenVersion", async () => {
  const { token } = await registerUser(ctx.app, ctx.db, { verified: false });
  const me = await request(ctx.app).get("/api/v1/auth/me").set(bearer(token));
  assert.equal(me.status, 200);
  for (const key of ["password", "tokenVersion", "emailVerificationTokenHash", "passwordResetTokenHash"]) {
    assert.equal(key in me.body.data.user, false, `${key} must not be exposed`);
  }
});

test("behind Vercel + Render (TRUST_PROXY_HOPS=2) req.ip is the browser and the peer is unforgeable", async () => {
  const { peerAddress } = await import("../src/utils/client-ip.util.js");
  const probe = express();
  probe.set("trust proxy", 2);
  probe.get("/ip", (req, res) => res.json({ ip: req.ip, peer: peerAddress(req) }));

  // Proxied: Vercel sets XFF to the browser, Render appends Vercel's egress.
  const proxied = await request(probe).get("/ip").set("X-Forwarded-For", "203.0.113.7, 198.51.100.20");
  assert.deepEqual(proxied.body, { ip: "203.0.113.7", peer: "198.51.100.20" });

  // Direct to Render, honest client.
  const direct = await request(probe).get("/ip").set("X-Forwarded-For", "203.0.113.9");
  assert.equal(direct.body.ip, "203.0.113.9");

  // Direct to Render with a forged entry: req.ip is spoofable, the peer is not.
  const forged = await request(probe).get("/ip").set("X-Forwarded-For", "6.6.6.6, 203.0.113.9");
  assert.equal(forged.body.peer, "203.0.113.9");
});
