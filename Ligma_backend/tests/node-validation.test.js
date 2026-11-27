import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import request from "supertest";

import { startHarness, stopHarness } from "./helpers/harness.js";
import { bearer, connectSocket, createWorkspace, emitAck, registerUser, waitForEvent } from "./helpers/fixtures.js";
import { createSocketRateLimiter } from "../src/socket/rate-limiter.js";

let ctx;
let owner;
let workspace;
let base;

before(async () => {
  ctx = await startHarness();
  owner = await registerUser(ctx.app, ctx.db);
  workspace = await createWorkspace(ctx.app, owner.token);
  base = `/api/v1/workspaces/${workspace.id}/canvas/nodes`;
});
after(stopHarness);

// Exactly what CanvasPage.jsx sends today (DEFAULT_NODE_DATA + buildPresetData
// with the default tool style), plus an inspector edit per type.
const FRONTEND_PAYLOADS = {
  sticky: { color: "yellow", fill: "#FEF3C7", text: "New note", textColor: "#18181B", width: 200, height: 160 },
  text: { text: "Text block", fontSize: 16, color: "#18181B", width: 180, height: 48 },
  rectangle: {
    width: 160,
    height: 100,
    fill: "rgba(0,0,0,0)",
    stroke: "#000000",
    label: "",
    strokeWidth: 2,
    cornerRadius: 8,
    opacity: 1,
  },
  circle: { radius: 60, fill: "rgba(0,0,0,0)", stroke: "#000000", label: "", strokeWidth: 2, opacity: 0.8 },
  arrow: { dx: 150, dy: 0, color: "#0F766E", label: "" },
  diamond: { width: 160, height: 160, fill: "rgba(0,0,0,0)", stroke: "#000000", label: "", strokeWidth: 2, opacity: 1 },
  triangle: { width: 160, height: 160, fill: "transparent", stroke: "#000", label: "", strokeWidth: 1, opacity: 0.5 },
  line: { dx: -40.5, dy: 120, color: "#0F766E", label: "" },
};

const create = (body) => request(ctx.app).post(base).set(bearer(owner.token)).send(body);
const update = (nodeId, body) => request(ctx.app).patch(`${base}/${nodeId}`).set(bearer(owner.token)).send(body);

test("every real node type round-trips exactly as the frontend sends it", async () => {
  for (const [type, data] of Object.entries(FRONTEND_PAYLOADS)) {
    const created = await create({ type, x: 120, y: -80, data });
    assert.equal(created.status, 201, `${type}: ${JSON.stringify(created.body)}`);
    assert.deepEqual(created.body.data.node.data, data);

    // The inspector persists the whole data object after a change.
    const updated = await update(created.body.data.node.id, { data: { ...data, label: data.label ?? undefined, rotation: 45 } });
    assert.equal(updated.status, 200, `${type} update: ${JSON.stringify(updated.body)}`);

    const moved = await update(created.body.data.node.id, { x: 10, y: 20 });
    assert.equal(moved.status, 200);
  }
});

test("invalid node payloads are rejected with 400", async () => {
  const sticky = FRONTEND_PAYLOADS.sticky;
  const cases = [
    ["unknown key", { type: "sticky", x: 0, y: 0, data: { ...sticky, evil: "x" } }],
    ["key from another type", { type: "sticky", x: 0, y: 0, data: { ...sticky, fontSize: 20 } }],
    ["text too long", { type: "sticky", x: 0, y: 0, data: { text: "a".repeat(10001) } }],
    ["bad color", { type: "sticky", x: 0, y: 0, data: { fill: "url(javascript:alert(1))" } }],
    ["zero width", { type: "rectangle", x: 0, y: 0, data: { width: 0, height: 10 } }],
    ["huge width", { type: "rectangle", x: 0, y: 0, data: { width: 20001, height: 10 } }],
    ["font too big", { type: "text", x: 0, y: 0, data: { fontSize: 401 } }],
    ["rotation out of range", { type: "text", x: 0, y: 0, data: { rotation: 720 } }],
    ["x out of range", { type: "sticky", x: 1e7, y: 0, data: {} }],
    ["x not a number", { type: "sticky", x: "10", y: 0, data: {} }],
    ["unknown type", { type: "hexagon", x: 0, y: 0, data: {} }],
    ["nested object value", { type: "sticky", x: 0, y: 0, data: { text: { $gt: "" } } }],
    // 10,000 four-byte characters: within the char limit, over the 32KB cap.
    ["data over 32KB", { type: "sticky", x: 0, y: 0, data: { text: "😀".repeat(5000) + "😀".repeat(4000) } }],
  ];

  for (const [label, body] of cases) {
    const res = await create(body);
    assert.equal(res.status, 400, `${label} should be rejected, got ${res.status}`);
  }

  const node = await create({ type: "sticky", x: 0, y: 0, data: sticky });
  const nodeId = node.body.data.node.id;
  assert.equal((await update(nodeId, { data: { fontSize: 20 } })).status, 400, "patch validated against the node's own type");
  assert.equal((await update(nodeId, { y: -1e7 })).status, 400);
  assert.equal((await update(nodeId, { somethingElse: 1 })).status, 400);
});

test("request bodies over 256kb are refused", async () => {
  const res = await request(ctx.app)
    .post(base)
    .set(bearer(owner.token))
    .set("Content-Type", "application/json")
    .send(JSON.stringify({ type: "sticky", x: 0, y: 0, data: { text: "a".repeat(300 * 1024) } }));
  assert.equal(res.status, 413);
});

test("invalid socket payloads are dropped and never broadcast", async () => {
  const node = await create({ type: "sticky", x: 0, y: 0, data: FRONTEND_PAYLOADS.sticky });
  const nodeId = node.body.data.node.id;
  const peer = await registerUser(ctx.app, ctx.db);
  const { addMember } = await import("./helpers/fixtures.js");
  await addMember(ctx.db, workspace.id, peer.user.id, "Contributor");

  const sender = await connectSocket(owner.token);
  const receiver = await connectSocket(peer.token);
  for (const socket of [sender, receiver]) {
    assert.equal((await emitAck(socket, "workspace:join", { workspaceId: workspace.id })).success, true);
  }

  const dropped = [
    ["canvas:data", { workspaceId: workspace.id, nodeId, patch: { evil: true } }],
    ["canvas:data", { workspaceId: workspace.id, nodeId, patch: { fill: "url(x)" } }],
    ["canvas:text", { workspaceId: workspace.id, nodeId, value: "a".repeat(10001) }],
    ["canvas:resize", { workspaceId: workspace.id, nodeId, x: 0, y: 0, data: { width: -5 } }],
    ["canvas:drag", { workspaceId: workspace.id, nodeId, x: Number.MAX_VALUE, y: 0 }],
    ["canvas:draft", { workspaceId: workspace.id, draft: { tool: "sticky", start: { x: 0, y: 0 }, blob: "x" } }],
    ["workspace:cursor", { workspaceId: workspace.id, x: 1e9, y: 0 }],
    ["canvas:rotate", { workspaceId: workspace.id, nodeId, rotation: 9999 }],
  ];
  for (const [event, payload] of dropped) {
    const received = waitForEvent(receiver, event, 250);
    sender.emit(event, payload);
    assert.equal(await received, null, `${event} with ${JSON.stringify(payload).slice(0, 60)} must be dropped`);
  }

  const allowed = [
    ["canvas:data", { workspaceId: workspace.id, nodeId, patch: { fill: "#FFFFFF" } }],
    ["canvas:text", { workspaceId: workspace.id, nodeId, value: "Hello" }],
    ["canvas:resize", { workspaceId: workspace.id, nodeId, x: 5, y: 5, data: { width: 300, height: 200 } }],
    ["canvas:drag", { workspaceId: workspace.id, nodeId, x: 5, y: 6 }],
    ["canvas:draft", { workspaceId: workspace.id, draft: { tool: "rectangle", start: { x: 0, y: 0 }, current: { x: 9, y: 9 } } }],
    ["canvas:draft", { workspaceId: workspace.id, draft: { type: "arrow", start: { x: 0, y: 0 }, end: { x: 9, y: 9 } } }],
    ["canvas:draft", { workspaceId: workspace.id, draft: null }],
    ["workspace:cursor", { workspaceId: workspace.id, x: 12, y: 34 }],
  ];
  for (const [event, payload] of allowed) {
    const received = waitForEvent(receiver, event, 1000);
    sender.emit(event, payload);
    assert.ok(await received, `${event} should be relayed`);
  }

  sender.close();
  receiver.close();
});

test("token bucket: bursts pass, excess is dropped, sustained floods disconnect", () => {
  let clock = 0;
  let disconnected = false;
  const fakeSocket = { disconnect: () => (disconnected = true) };
  const limiter = createSocketRateLimiter(fakeSocket, { now: () => clock });
  const fire = (event) => {
    let passed = false;
    limiter([event, {}], () => (passed = true));
    return passed;
  };

  let passed = 0;
  for (let i = 0; i < 200; i += 1) passed += fire("workspace:cursor") ? 1 : 0;
  assert.equal(passed, 120, "burst of 120 then dropped");

  clock += 1000; // one second refills ~60
  passed = 0;
  for (let i = 0; i < 100; i += 1) passed += fire("canvas:drag") ? 1 : 0;
  assert.equal(passed, 60);

  // Typing has its own, smaller bucket.
  passed = 0;
  for (let i = 0; i < 50; i += 1) passed += fire("chat:typing") ? 1 : 0;
  assert.equal(passed, 20);

  // Unlisted events are never limited.
  assert.equal(fire("workspace:join"), true);

  assert.equal(disconnected, false);
  for (let i = 0; i < 700; i += 1) fire("workspace:cursor");
  assert.equal(disconnected, true, "persistent abuse disconnects the socket");
});

test("read-only key sampler accepts every node the frontend creates", async () => {
  const exec = promisify(execFile);
  const { stdout } = await exec(process.execPath, ["tools/sampleCanvasNodeKeys.js"], {
    env: { ...process.env, MONGODB_URI: process.env.MONGODB_URI },
  });
  assert.match(stdout, /All sampled nodes pass/);
  for (const key of ["textColor", "cornerRadius", "fontSize", "radius", "dx"]) {
    assert.match(stdout, new RegExp(key), `sampler reports ${key}`);
  }
});
