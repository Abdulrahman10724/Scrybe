import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { ObjectId } from "mongodb";

import { startHarness, stopHarness } from "./helpers/harness.js";
import { PASSWORD, bearer, refreshCookieFrom, refreshRequest, registerUser, uniqueEmail } from "./helpers/fixtures.js";

let ctx;
before(async () => {
  ctx = await startHarness();
});
after(stopHarness);

// Each test uses its own client IP so the per-IP limiter doesn't interfere.
let ipCounter = 10;
const nextIp = () => `198.51.100.${ipCounter++}`;

const forgot = (email, ip) =>
  request(ctx.app).post("/api/v1/auth/forgot-password").set("X-Forwarded-For", ip).send({ email });
const reset = (token, password, ip = nextIp()) =>
  request(ctx.app).post("/api/v1/auth/reset-password").set("X-Forwarded-For", ip).send({ token, password });

// The raw token only travels by email; plant a known one the way the
// service would.
const plantResetToken = async (userId, token = "known-reset-token") => {
  const { setPasswordResetToken } = await import("../src/models/user.model.js");
  await setPasswordResetToken(userId, token);
  return token;
};

test("forgot-password answers identically for known and unknown emails", async () => {
  const { email, user } = await registerUser(ctx.app, ctx.db);
  const ip = nextIp();

  const known = await forgot(email, ip);
  const unknown = await forgot(uniqueEmail("nobody"), ip);

  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(known.body, unknown.body);

  const doc = await ctx.db.collection("users").findOne({ _id: new ObjectId(user.id) });
  assert.equal(doc.passwordResetTokenHash.length, 64, "only the sha256 hash is stored");
  const ttl = new Date(doc.passwordResetExpiresAt).getTime() - Date.now();
  assert.ok(ttl > 55 * 60 * 1000 && ttl <= 60 * 60 * 1000, "expires in about an hour");
});

test("forgot-password is rate limited per email across IPs", async () => {
  const { email } = await registerUser(ctx.app, ctx.db);
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await forgot(email, nextIp())).status, 200);
  }
  assert.equal((await forgot(email, nextIp())).status, 429);
});

test("reset email uses the branded template and links to /reset-password", async () => {
  const { buildPasswordResetEmail } = await import("../src/services/email.service.js");
  const { html, text, resetUrl } = buildPasswordResetEmail({ name: "<Ada>", token: "abc123" });
  assert.equal(resetUrl, "http://localhost:5173/reset-password?token=abc123");
  assert.ok(html.includes(resetUrl) && text.includes(resetUrl));
  assert.ok(html.includes("&lt;Ada&gt;"), "name is escaped");
  assert.ok(html.includes("Brainstorm. Collaborate. Ship."), "same layout as the verification email");
});

test("reset changes the password, kills old sessions, and the link works only once", async () => {
  const { email, user } = await registerUser(ctx.app, ctx.db);
  const login = await request(ctx.app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  const oldAccess = login.body.data.token;
  const oldRefresh = refreshCookieFrom(login.headers["set-cookie"]);
  const token = await plantResetToken(user.id);

  const res = await reset(token, "a-brand-new-password");
  assert.equal(res.status, 200, JSON.stringify(res.body));

  assert.equal((await request(ctx.app).get("/api/v1/workspaces").set(bearer(oldAccess))).status, 401);
  assert.equal((await refreshRequest(ctx.app, oldRefresh)).status, 401);

  const oldPassword = await request(ctx.app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  assert.equal(oldPassword.status, 401);
  const newPassword = await request(ctx.app).post("/api/v1/auth/login").send({ email, password: "a-brand-new-password" });
  assert.equal(newPassword.status, 200);

  const again = await reset(token, "yet-another-password");
  assert.equal(again.status, 400);
  assert.equal(again.body.code, "RESET_TOKEN_INVALID");
});

test("expired reset links are rejected with 410", async () => {
  const { user } = await registerUser(ctx.app, ctx.db);
  const token = await plantResetToken(user.id, "expired-token");
  await ctx.db
    .collection("users")
    .updateOne({ _id: new ObjectId(user.id) }, { $set: { passwordResetExpiresAt: new Date(Date.now() - 1000) } });

  const res = await reset(token, "a-brand-new-password");
  assert.equal(res.status, 410);
  assert.equal(res.body.code, "RESET_TOKEN_EXPIRED");
});

test("reset enforces the registration password rules", async () => {
  const { user } = await registerUser(ctx.app, ctx.db);
  const token = await plantResetToken(user.id, "rules-token");
  assert.equal((await reset(token, "short")).status, 400);
  assert.equal((await reset(token, "x".repeat(129))).status, 400);
  // Still usable after the rejected attempts.
  assert.equal((await reset(token, "long-enough-password")).status, 200);
});

test("concurrent resets with the same link: exactly one succeeds", async () => {
  const { user } = await registerUser(ctx.app, ctx.db);
  const token = await plantResetToken(user.id, "race-token");
  const results = await Promise.all([reset(token, "first-new-password"), reset(token, "second-new-password")]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
});
