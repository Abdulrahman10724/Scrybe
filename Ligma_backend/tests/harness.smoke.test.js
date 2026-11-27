import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import { startHarness, stopHarness } from "./helpers/harness.js";

let ctx;
before(async () => {
  ctx = await startHarness();
});
after(stopHarness);

test("health endpoint responds", async () => {
  const res = await request(ctx.app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "healthy");
});
