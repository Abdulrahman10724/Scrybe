import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { ObjectId } from "mongodb";

import { startHarness, stopHarness } from "./helpers/harness.js";
import {
  addMember,
  bearer,
  connectSocket,
  createWorkspace,
  emitAck,
  registerUser,
  waitForEvent,
} from "./helpers/fixtures.js";

let ctx;
before(async () => {
  ctx = await startHarness();
});
after(stopHarness);

const setup = async () => {
  const owner = await registerUser(ctx.app, ctx.db);
  const member = await registerUser(ctx.app, ctx.db);
  const workspace = await createWorkspace(ctx.app, owner.token);
  await addMember(ctx.db, workspace.id, member.user.id, "Contributor");

  const channels = await request(ctx.app).get(`/api/v1/workspaces/${workspace.id}/chat/channels`).set(bearer(owner.token));
  const channelId = channels.body.data.channels[0].id;

  const ownerSocket = await connectSocket(owner.token);
  const memberSocket = await connectSocket(member.token);
  for (const socket of [ownerSocket, memberSocket]) {
    assert.equal((await emitAck(socket, "workspace:join", { workspaceId: workspace.id })).success, true);
    assert.equal((await emitAck(socket, "chat:join-channel", { workspaceId: workspace.id, channelId })).success, true);
  }

  return { owner, member, workspace, channelId, ownerSocket, memberSocket };
};

test("removed member is kicked from rooms, cannot emit, and is detached from content", async () => {
  const { owner, member, workspace, channelId, ownerSocket, memberSocket } = await setup();
  const base = `/api/v1/workspaces/${workspace.id}`;

  // Content tied to the member: a node restricted to them and a task assigned to them.
  const node = await request(ctx.app)
    .post(`${base}/canvas/nodes`)
    .set(bearer(owner.token))
    .send({ type: "rectangle", x: 0, y: 0, data: { width: 100, height: 80, label: "" } });
  const nodeId = node.body.data.node.id;
  const perms = await request(ctx.app)
    .patch(`${base}/canvas/nodes/${nodeId}/permissions`)
    .set(bearer(owner.token))
    .send({ allowedUserIds: [member.user.id] });
  assert.equal(perms.status, 200, JSON.stringify(perms.body));
  const task = await request(ctx.app)
    .post(`${base}/tasks`)
    .set(bearer(owner.token))
    .send({ title: "Theirs", assigneeId: member.user.id });
  assert.equal(task.status, 201);

  // Sanity: before removal the member's cursor reaches the owner.
  const cursorBefore = waitForEvent(ownerSocket, "workspace:cursor");
  memberSocket.emit("workspace:cursor", { workspaceId: workspace.id, x: 1, y: 1 });
  assert.ok(await cursorBefore, "cursor relayed before removal");

  const revoked = waitForEvent(memberSocket, "workspace:access-revoked", 2000);
  const res = await request(ctx.app).delete(`${base}/members/${member.user.id}`).set(bearer(owner.token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(await revoked, { workspaceId: workspace.id });

  // Stops receiving: workspace broadcasts and channel typing.
  const strayBroadcast = waitForEvent(memberSocket, "canvas:node-created", 300);
  const strayTyping = waitForEvent(memberSocket, "chat:typing", 300);
  const { emitWorkspaceEvent } = await import("../src/socket/socket.service.js");
  emitWorkspaceEvent(workspace.id, "canvas:node-created", { workspaceId: workspace.id });
  ownerSocket.emit("chat:typing", { workspaceId: workspace.id, channelId });
  assert.equal(await strayBroadcast, null, "no workspace broadcast after removal");
  assert.equal(await strayTyping, null, "no channel typing after removal");

  // Stops sending: cursor, drag and typing from the removed user are dropped.
  const strayCursor = waitForEvent(ownerSocket, "workspace:cursor", 300);
  const strayDrag = waitForEvent(ownerSocket, "canvas:drag", 300);
  const strayMemberTyping = waitForEvent(ownerSocket, "chat:typing", 300);
  memberSocket.emit("workspace:cursor", { workspaceId: workspace.id, x: 2, y: 2 });
  memberSocket.emit("canvas:drag", { workspaceId: workspace.id, nodeId, x: 5, y: 5 });
  memberSocket.emit("chat:typing", { workspaceId: workspace.id, channelId });
  assert.equal(await strayCursor, null);
  assert.equal(await strayDrag, null);
  assert.equal(await strayMemberTyping, null);

  // Rejoining is refused.
  const rejoin = await emitAck(memberSocket, "workspace:join", { workspaceId: workspace.id });
  assert.equal(rejoin.success, false);

  const nodeDoc = await ctx.db.collection("canvasNodes").findOne({ _id: new ObjectId(nodeId) });
  assert.deepEqual(nodeDoc.allowedUserIds, []);
  const taskDoc = await ctx.db.collection("tasks").findOne({ _id: new ObjectId(task.body.data.id) });
  assert.equal(taskDoc.assigneeId, null);

  ownerSocket.close();
  memberSocket.close();
});

test("role change is pushed live and a demoted Viewer can no longer edit", async () => {
  const { owner, member, workspace, ownerSocket, memberSocket } = await setup();
  const base = `/api/v1/workspaces/${workspace.id}`;

  const node = await request(ctx.app)
    .post(`${base}/canvas/nodes`)
    .set(bearer(owner.token))
    .send({ type: "sticky", x: 0, y: 0, data: { text: "x", width: 200, height: 160 } });
  const nodeId = node.body.data.node.id;

  const dragBefore = waitForEvent(ownerSocket, "canvas:drag");
  memberSocket.emit("canvas:drag", { workspaceId: workspace.id, nodeId, x: 3, y: 3 });
  assert.ok(await dragBefore, "contributor drag relayed");

  const changed = waitForEvent(memberSocket, "workspace:role-changed", 2000);
  const res = await request(ctx.app)
    .patch(`${base}/members/${member.user.id}/role`)
    .set(bearer(owner.token))
    .send({ role: "Viewer" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(await changed, { workspaceId: workspace.id, role: "Viewer" });

  const dragAfter = waitForEvent(ownerSocket, "canvas:drag", 400);
  memberSocket.emit("canvas:drag", { workspaceId: workspace.id, nodeId, x: 4, y: 4 });
  assert.equal(await dragAfter, null, "viewer drag dropped");

  const rest = await request(ctx.app)
    .patch(`${base}/canvas/nodes/${nodeId}`)
    .set(bearer(member.token))
    .send({ x: 9 });
  assert.equal(rest.status, 403);

  ownerSocket.close();
  memberSocket.close();
});
