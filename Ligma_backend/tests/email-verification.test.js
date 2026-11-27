import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { ObjectId } from "mongodb";

import { startHarness, stopHarness } from "./helpers/harness.js";
import { bearer, connectSocket, createWorkspace, registerUser } from "./helpers/fixtures.js";

let ctx;
before(async () => {
  ctx = await startHarness();
});
after(stopHarness);

test("unverified user is blocked from every protected REST route", async () => {
  const owner = await registerUser(ctx.app, ctx.db, { verified: true });
  const workspace = await createWorkspace(ctx.app, owner.token);
  const { token } = await registerUser(ctx.app, ctx.db, { verified: false });

  const routes = [
    ["get", "/api/v1/workspaces"],
    ["post", "/api/v1/workspaces"],
    ["get", `/api/v1/workspaces/${workspace.id}/canvas/nodes`],
    ["get", `/api/v1/workspaces/${workspace.id}/tasks`],
    ["get", `/api/v1/workspaces/${workspace.id}/chat/channels`],
    ["get", `/api/v1/workspaces/${workspace.id}/zones`],
    ["get", `/api/v1/workspaces/${workspace.id}/members`],
    ["get", "/api/v1/invitations/inbox"],
  ];

  for (const [method, path] of routes) {
    const res = await request(ctx.app)[method](path).set(bearer(token)).send({});
    assert.equal(res.status, 403, `${method.toUpperCase()} ${path} should be 403`);
    assert.equal(res.body.code, "EMAIL_NOT_VERIFIED", `${path} should carry the code`);
  }
});

test("unverified user can still reach /auth/me", async () => {
  const { token } = await registerUser(ctx.app, ctx.db, { verified: false });
  const res = await request(ctx.app).get("/api/v1/auth/me").set(bearer(token));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.emailVerified, false);
});

test("socket handshake rejects unverified users", async () => {
  const { token } = await registerUser(ctx.app, ctx.db, { verified: false });
  await assert.rejects(connectSocket(token), (error) => error.message === "EMAIL_NOT_VERIFIED");
});

test("after verifying, the same token works for REST and socket without re-login", async () => {
  const { token, user } = await registerUser(ctx.app, ctx.db, { verified: false });

  const tokenDoc = await ctx.db.collection("users").findOne({ _id: new ObjectId(user.id) });
  assert.ok(tokenDoc.emailVerificationTokenHash, "verification token stored");

  // Simulate clicking the link: we can't read the raw token, so swap in a known one.
  const { hashVerificationToken } = await import("../src/models/user.model.js");
  await ctx.db
    .collection("users")
    .updateOne({ _id: tokenDoc._id }, { $set: { emailVerificationTokenHash: hashVerificationToken("known-token") } });

  const verify = await request(ctx.app).post("/api/v1/auth/verify-email").send({ token: "known-token" });
  assert.equal(verify.status, 200);

  const res = await request(ctx.app).get("/api/v1/workspaces").set(bearer(token));
  assert.equal(res.status, 200);

  const socket = await connectSocket(token);
  assert.equal(socket.connected, true);
  socket.close();
});

test("unverified user cannot accept an invitation", async () => {
  const owner = await registerUser(ctx.app, ctx.db, { verified: true });
  const workspace = await createWorkspace(ctx.app, owner.token);
  const invitee = await registerUser(ctx.app, ctx.db, { verified: false });

  const invite = await request(ctx.app)
    .post(`/api/v1/workspaces/${workspace.id}/invitations`)
    .set(bearer(owner.token))
    .send({ email: invitee.email, role: "Contributor" });
  assert.equal(invite.status, 201, JSON.stringify(invite.body));
  const inviteToken = invite.body.data.inviteLink.split("/invite/")[1];

  const res = await request(ctx.app).post(`/api/v1/invitations/${inviteToken}/accept`).set(bearer(invitee.token));
  assert.equal(res.status, 403);
  assert.equal(res.body.code, "EMAIL_NOT_VERIFIED");

  const members = await ctx.db.collection("workspaceMembers").countDocuments({ workspaceId: new ObjectId(workspace.id) });
  assert.equal(members, 0);
});
