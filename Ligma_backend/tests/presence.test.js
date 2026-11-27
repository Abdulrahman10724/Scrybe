import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { startHarness, stopHarness } from "./helpers/harness.js";
import { addMember, connectSocket, createWorkspace, emitAck, registerUser, waitForEvent } from "./helpers/fixtures.js";

let ctx;
before(async () => {
  ctx = await startHarness();
});
after(stopHarness);

const onlineIds = (payload) => (payload?.users || []).map((user) => user.userId).sort();

test("closing one of two tabs keeps the user online; closing the last removes them", async () => {
  const owner = await registerUser(ctx.app, ctx.db);
  const member = await registerUser(ctx.app, ctx.db);
  const workspace = await createWorkspace(ctx.app, owner.token);
  await addMember(ctx.db, workspace.id, member.user.id, "Contributor");

  const watcher = await connectSocket(owner.token);
  await emitAck(watcher, "workspace:join", { workspaceId: workspace.id });

  const tabA = await connectSocket(member.token);
  const tabB = await connectSocket(member.token);
  await emitAck(tabA, "workspace:join", { workspaceId: workspace.id });
  const joined = waitForEvent(watcher, "workspace:presence", 1000);
  await emitAck(tabB, "workspace:join", { workspaceId: workspace.id });
  assert.deepEqual(onlineIds(await joined), [owner.user.id, member.user.id].sort());

  const afterFirstClose = waitForEvent(watcher, "workspace:presence", 1000);
  tabA.close();
  const payload = await afterFirstClose;
  assert.ok(onlineIds(payload).includes(member.user.id), "still online with one tab open");
  assert.equal(JSON.stringify(payload).includes("socketIds"), false, "internal socket ids are not broadcast");

  const afterLastClose = waitForEvent(watcher, "workspace:presence", 1000);
  tabB.close();
  assert.deepEqual(onlineIds(await afterLastClose), [owner.user.id]);

  watcher.close();
});
