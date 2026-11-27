// READ-ONLY: lists every `data` key stored on canvas nodes, per node type,
// and flags keys or values the strict node schema
// (src/validation/node-data.schema.js) would reject. Run it against a copy
// of production (or production itself — it only reads) before deploying:
//
//   MONGODB_URI="mongodb+srv://..." node tools/sampleCanvasNodeKeys.js
//
// It performs aggregation/find queries only; nothing is written.
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is required");
  process.exit(1);
}

const { nodeDataSchemas } = await import("../src/validation/node-data.schema.js");

const SAMPLE_LIMIT = Number(process.env.SAMPLE_LIMIT || 5000);

const client = new MongoClient(uri, { readPreference: "secondaryPreferred" });
await client.connect();

try {
  const nodes = client.db().collection("canvasNodes");

  const keyStats = await nodes
    .aggregate([
      { $limit: SAMPLE_LIMIT },
      { $project: { type: 1, kv: { $objectToArray: { $ifNull: ["$data", {}] } } } },
      { $unwind: "$kv" },
      { $group: { _id: { type: "$type", key: "$kv.k" }, count: { $sum: 1 }, sampleType: { $first: { $type: "$kv.v" } } } },
      { $sort: { "_id.type": 1, "_id.key": 1 } },
    ])
    .toArray();

  console.log("Stored data keys by node type (sample of up to %d nodes):", SAMPLE_LIMIT);
  for (const { _id, count, sampleType } of keyStats) {
    console.log(`  ${_id.type.padEnd(10)} ${_id.key.padEnd(16)} ${String(count).padStart(6)}  (${sampleType})`);
  }

  // Validate each sampled node's data against the strict schema.
  const failures = new Map(); // "type: message" -> count
  let checked = 0;
  for await (const node of nodes.find({}, { projection: { type: 1, data: 1 } }).limit(SAMPLE_LIMIT)) {
    checked += 1;
    const schema = nodeDataSchemas[node.type];
    if (!schema) {
      const key = `unknown node type "${node.type}"`;
      failures.set(key, (failures.get(key) || 0) + 1);
      continue;
    }
    const result = schema.safeParse(node.data || {});
    if (!result.success) {
      for (const issue of result.error.issues) {
        const where = issue.path.join(".") || (issue.keys ? issue.keys.join(",") : "(root)");
        const key = `${node.type}: ${where} — ${issue.message}`;
        failures.set(key, (failures.get(key) || 0) + 1);
      }
    }
  }

  console.log(`\nChecked ${checked} node(s) against the strict schema.`);
  if (!failures.size) {
    console.log("All sampled nodes pass. No stored field would be rejected.");
  } else {
    console.log("Would be REJECTED on the next full-data update — add these keys/limits to node-data.schema.js first:");
    for (const [message, count] of [...failures.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(6)} × ${message}`);
    }
    process.exitCode = 2;
  }
} finally {
  await client.close();
}
