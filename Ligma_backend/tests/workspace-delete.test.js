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
  sleep,
  waitForEvent,
} from "./helpers/fixtures.js";

let ctx;
before(async () => {
  ctx = await startHarness();
});
after(stopHarness);

// Seeds one document of every workspace-scoped kind through the real API.
const seedWorkspace = async (owner, member) => {
  const workspace = await createWorkspace(ctx.app, owner.token, "Doomed");
  await addMember(ctx.db, workspace.id, member.user.id, "Contributor");
  const auth = bearer(owner.token);
  const base = `/api/v1/workspaces/${workspace.id}`;

  const node = await request(ctx.app)
    .post(`${base}/canvas/nodes`)
    .set(auth)
    .send({ type: "sticky", x: 10, y: 20, data: { text: "Hello", width: 200, height: 160 } });
  assert.equal(node.status, 201, JSON.stringify(node.body));

  const task = await request(ctx.app).post(`${base}/tasks`).set(auth).send({ title: "Ship it" });
  assert.equal(task.status, 201, JSON.stringify(task.body));

  const channels = await request(ctx.app).get(`${base}/chat/channels`).set(auth);
  const channelId = channels.body.data.channels[0].id;
  const message = await request(ctx.app)
    .post(`${base}/chat/channels/${channelId}/messages`)
    .set(auth)
    .send({ content: "hi" });
  assert.equal(message.status, 201, JSON.stringify(message.body));

  const zone = await request(ctx.app).post(`${base}/zones`).set(auth).send({ name: "Zone A", x: 0, y: 0, width: 100, height: 100 });
  assert.equal(zone.status, 201, JSON.stringify(zone.body));

  const invite = await request(ctx.app)
    .post(`${base}/invitations`)
    .set(auth)
    .send({ email: "someone-else@example.com", role: "Viewer" });
  assert.equal(invite.status, 201, JSON.stringify(invite.body));

  // Event logs are written fire-and-forget; give them a moment.
  await sleep(200);
  return { workspace, channelId };
};

const countReferences = async (workspaceId) => {
  const ids = [new ObjectId(workspaceId), workspaceId];
  const collections = await ctx.db.listCollections().toArray();
  const counts = {};
  for (const { name } of collections) {
    const n = await ctx.db.collection(name).countDocuments({ workspaceId: { $in: ids } });
    if (n) counts[name] = n;
  }
  const workspaceDoc = await ctx.db.collection("workspaces").countDocuments({ _id: ids[0] });
  if (workspaceDoc) counts.workspaces = workspaceDoc;
  return counts;
};

test("deleting a workspace leaves zero documents referencing it", async () => {
  const owner = await registerUser(ctx.app, ctx.db);
  const member = await registerUser(ctx.app, ctx.db);
  const { workspace } = await seedWorkspace(owner, member);

  const before = await countReferences(workspace.id);
  for (const name of ["canvasNodes", "tasks", "messages", "channels", "eventLogs", "zones", "workspaceMembers", "invitations"]) {
    assert.ok(before[name] > 0, `seed should create ${name} (got ${JSON.stringify(before)})`);
  }

  const res = await request(ctx.app)
    .delete(`/api/v1/workspaces/${workspace.id}`)
    .set(bearer(owner.token))
    .send({ confirmTitle: "Doomed" });
  assert.equal(res.status, 200, JSON.stringify(res.body));

  assert.deepEqual(await countReferences(workspace.id), {});
});

test("ordered-delete fallback also removes everything", async () => {
  const owner = await registerUser(ctx.app, ctx.db);
  const member = await registerUser(ctx.app, ctx.db);
  const { workspace } = await seedWorkspace(owner, member);

  const { deleteOrdered } = await import("../src/services/workspace-purge.service.js");
  const counts = await deleteOrdered(workspace.id);
  assert.equal(counts.workspaces, 1);
  assert.deepEqual(await countReferences(workspace.id), {});
});

test("connected members get workspace:deleted and are removed from the room", async () => {
  const owner = await registerUser(ctx.app, ctx.db);
  const member = await registerUser(ctx.app, ctx.db);
  const { workspace } = await seedWorkspace(owner, member);

  const memberSocket = await connectSocket(member.token);
  const joined = await emitAck(memberSocket, "workspace:join", { workspaceId: workspace.id });
  assert.equal(joined.success, true);

  const deleted = waitForEvent(memberSocket, "workspace:deleted", 2000);
  const res = await request(ctx.app)
    .delete(`/api/v1/workspaces/${workspace.id}`)
    .set(bearer(owner.token))
    .send({ confirmTitle: "Doomed" });
  assert.equal(res.status, 200);
  assert.deepEqual(await deleted, { workspaceId: workspace.id, actorId: owner.user.id });

  // Nothing broadcast to the old room reaches the member any more.
  const { emitWorkspaceEvent } = await import("../src/socket/socket.service.js");
  const stray = waitForEvent(memberSocket, "canvas:node-created", 300);
  emitWorkspaceEvent(workspace.id, "canvas:node-created", { workspaceId: workspace.id });
  assert.equal(await stray, null);

  memberSocket.close();
});

test("background jobs for a deleted workspace no-op instead of failing", async () => {
  const { processTaskJob } = await import("../src/workers/task.worker.js");
  const { processClassificationJob } = await import("../src/workers/classification.worker.js");
  const { processEmailJob } = await import("../src/workers/email.worker.js");
  const ghost = new ObjectId().toString();
  const job = (data) => ({ id: "job-1", data });

  assert.deepEqual(
    await processTaskJob(job({ workspaceId: ghost, nodeId: ghost, actorId: ghost, action: "delete" })),
    { skipped: "workspace-deleted" },
  );
  assert.deepEqual(
    await processClassificationJob(job({ workspaceId: ghost, nodeId: ghost, actorId: ghost })),
    { skipped: "workspace-deleted" },
  );
  assert.deepEqual(
    await processEmailJob(
      job({
        type: "invitation",
        to: "x@example.com",
        workspaceTitle: "Gone",
        role: "Viewer",
        inviteLink: "http://localhost:5173/invite/abc",
        invitationId: ghost,
      }),
    ),
    { skipped: "invitation-inactive" },
  );
});
