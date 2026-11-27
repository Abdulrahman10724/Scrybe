import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import { startHarness, stopHarness } from "./helpers/harness.js";

let ctx;
before(async () => {
  ctx = await startHarness();
});
after(stopHarness);

test("GET / returns only a status", async () => {
  const res = await request(ctx.app).get("/");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: "ok" });
});

test("GET /health stays public and minimal", async () => {
  const res = await request(ctx.app).get("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { success: true, status: "healthy" });
});

test("GET /health/queues and /api/v1/health/ip require X-Health-Token", async () => {
  for (const path of ["/health/queues", "/api/v1/health/ip"]) {
    assert.equal((await request(ctx.app).get(path)).status, 401, path);
    assert.equal((await request(ctx.app).get(path).set("X-Health-Token", "wrong")).status, 401, path);
    const ok = await request(ctx.app).get(path).set("X-Health-Token", process.env.HEALTH_TOKEN);
    assert.equal(ok.status, 200, path);
  }

  const ip = await request(ctx.app)
    .get("/api/v1/health/ip")
    .set("X-Health-Token", process.env.HEALTH_TOKEN)
    .set("X-Forwarded-For", "203.0.113.5");
  assert.equal(ip.body.ip, "203.0.113.5");
  assert.equal(ip.body.trustProxyHops, 2);
});
