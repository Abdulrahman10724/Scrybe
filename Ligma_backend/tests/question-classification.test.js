import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import request from "supertest";

import { startHarness, stopHarness } from "./helpers/harness.js";
import { bearer, createWorkspace, registerUser } from "./helpers/fixtures.js";

let ctx;
let ai;
let classification;

before(async () => {
  // A key must be configured for the classifier to call OpenRouter at all;
  // the HTTP call itself is mocked below, nothing leaves the machine.
  process.env.OPENROUTER_API_KEY = "test-key";
  ctx = await startHarness();
  ai = await import("../src/services/ai.service.js");
  classification = await import("../src/services/classification.service.js");
});
after(async () => {
  mock.restoreAll();
  await stopHarness();
});

const mockOpenRouterReply = (content) =>
  mock.method(axios, "post", async () => ({ data: { choices: [{ message: { content } }] } }));

test("parser: first recognised word, any casing or decoration", () => {
  const cases = {
    Question: "Question",
    question: "Question",
    "QUESTION.": "Question",
    "**Question**": "Question",
    "Question - this asks which database to use": "Question",
    "Category: Question": "Question",
    "action": "Action",
    "Decision!": "Decision",
    "information": "Information",
    "Info": "Information",
    // first word wins even if another category word appears later
    "Decision, not an Action": "Decision",
  };
  for (const [reply, expected] of Object.entries(cases)) {
    assert.equal(ai.parseClassification(reply), expected, reply);
  }
  assert.equal(ai.parseClassification(""), null);
  assert.equal(ai.parseClassification("I am not sure"), null);
});

test("'Which database should we use for sessions?' is classified as Question", async () => {
  const post = mockOpenRouterReply("Question");
  try {
    const result = await classification.classifyNodeContent("Which database should we use for sessions?", { strict: true });
    assert.equal(result.classification, "Question");

    const [, body] = post.mock.calls[0].arguments;
    assert.equal(body.temperature, 0, "deterministic");
    const prompt = body.messages.map((m) => m.content).join("\n");
    for (const category of ["Action", "Decision", "Question", "Information"]) {
      assert.match(prompt, new RegExp(category), `prompt offers ${category}`);
    }
  } finally {
    post.mock.restore();
  }
});

test("strict mode still rejects replies that name no category", async () => {
  const post = mockOpenRouterReply("Maybe?");
  try {
    await assert.rejects(ai.classifyWithOpenRouter("Something", { strict: true }));
  } finally {
    post.mock.restore();
  }
});

test("Question tasks are stored and listed; legacy Information tasks still render", async () => {
  const { taskJobSchema } = await import("../src/jobs/task.job.js");
  const { processTaskJob } = await import("../src/workers/task.worker.js");
  const owner = await registerUser(ctx.app, ctx.db);
  const workspace = await createWorkspace(ctx.app, owner.token);
  const base = `/api/v1/workspaces/${workspace.id}`;

  const node = await request(ctx.app)
    .post(`${base}/canvas/nodes`)
    .set(bearer(owner.token))
    .send({ type: "sticky", x: 0, y: 0, data: { text: "Which database should we use for sessions?" } });
  const nodeId = node.body.data.node.id;

  // What the classification worker enqueues for a Question.
  const jobData = taskJobSchema.parse({
    workspaceId: workspace.id,
    nodeId,
    actorId: owner.user.id,
    action: "upsert",
    classification: "Question",
    taskData: { title: "Which database should we use for sessions?", type: "Question" },
  });
  const outcome = await processTaskJob({ id: "q-1", data: jobData });
  assert.ok(outcome.taskId);

  // A pre-existing task from before this change.
  const legacy = await request(ctx.app).post(`${base}/tasks`).set(bearer(owner.token)).send({ title: "Old note", type: "Information" });
  assert.equal(legacy.status, 201);
  // Manual re-categorisation to Question goes through REST validation.
  const recat = await request(ctx.app)
    .put(`${base}/tasks/${legacy.body.data.id}`)
    .set(bearer(owner.token))
    .send({ type: "Question" });
  assert.equal(recat.status, 200, JSON.stringify(recat.body));
  await request(ctx.app).put(`${base}/tasks/${legacy.body.data.id}`).set(bearer(owner.token)).send({ type: "Information" });

  const list = await request(ctx.app).get(`${base}/tasks`).set(bearer(owner.token));
  const byTitle = Object.fromEntries(list.body.data.map((task) => [task.title, task.type]));
  assert.equal(byTitle["Which database should we use for sessions?"], "Question");
  assert.equal(byTitle["Old note"], "Information");
});
