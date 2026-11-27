import { ObjectId } from "mongodb";

import { getClient, getCollection } from "../config/db.config.js";
import logger from "../utils/logger.util.js";

// Every collection that stores documents scoped to a workspace via
// `workspaceId`. Keep in sync with src/models/* — tests/workspace-delete
// asserts that nothing referencing a deleted workspace survives.
const WORKSPACE_SCOPED_COLLECTIONS = [
  "canvasNodes",
  "tasks",
  "messages",
  "channels",
  "eventLogs",
  "zones",
  "workspaceMembers",
  "invitations",
];

const workspaceFilter = (workspaceId) => ({
  // Match ObjectId and any legacy string ids.
  workspaceId: { $in: [new ObjectId(workspaceId), String(workspaceId)] },
});

// Errors that mean "this deployment can't run transactions" (standalone
// mongod in local dev) rather than a real failure.
const isTransactionUnsupported = (error) =>
  error?.code === 20 ||
  error?.codeName === "IllegalOperation" ||
  /Transaction numbers are only allowed|replica set|does not support transactions/i.test(error?.message || "");

const deleteWithTransaction = async (workspaceId) => {
  const session = getClient().startSession();
  const counts = {};

  try {
    await session.withTransaction(async () => {
      for (const name of WORKSPACE_SCOPED_COLLECTIONS) {
        const result = await getCollection(name).deleteMany(workspaceFilter(workspaceId), { session });
        counts[name] = result.deletedCount;
      }
      const result = await getCollection("workspaces").deleteOne({ _id: new ObjectId(workspaceId) }, { session });
      counts.workspaces = result.deletedCount;
    });
  } finally {
    await session.endSession();
  }

  return counts;
};

// Fallback without transactions: children first, workspace document last,
// so a partial failure leaves the workspace in place and the delete can be
// retried instead of leaving orphans behind an already-deleted workspace.
const deleteOrdered = async (workspaceId) => {
  const counts = {};
  const failures = [];

  for (const name of WORKSPACE_SCOPED_COLLECTIONS) {
    try {
      const result = await getCollection(name).deleteMany(workspaceFilter(workspaceId));
      counts[name] = result.deletedCount;
    } catch (error) {
      failures.push(name);
      logger.error("workspace purge: delete failed", { workspaceId, collection: name, message: error?.message });
    }
  }

  if (failures.length) {
    const error = new Error("Workspace could not be fully deleted. Please try again.");
    error.statusCode = 500;
    throw error;
  }

  const result = await getCollection("workspaces").deleteOne({ _id: new ObjectId(workspaceId) });
  counts.workspaces = result.deletedCount;
  return counts;
};

const purgeWorkspaceData = async (workspaceId) => {
  try {
    return await deleteWithTransaction(workspaceId);
  } catch (error) {
    if (!isTransactionUnsupported(error)) {
      throw error;
    }

    logger.warn("workspace purge: transactions unavailable, using ordered deletes", { workspaceId });
    return deleteOrdered(workspaceId);
  }
};

export { WORKSPACE_SCOPED_COLLECTIONS, purgeWorkspaceData, deleteOrdered };

export default { WORKSPACE_SCOPED_COLLECTIONS, purgeWorkspaceData, deleteOrdered };
