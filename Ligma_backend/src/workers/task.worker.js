import config from "../config/env.config.js";
import { Worker } from "bullmq";

import { buildBullMQWorkerOptions, registerBullMQWorker } from "../config/bullmq.config.js";
import { taskJobSchema } from "../jobs/task.job.js";
import { TASK_QUEUE_NAME } from "../queues/task.queue.js";
import { findNodeById } from "../models/canvas-node.model.js";
import { findWorkspaceById } from "../models/workspace.model.js";
import * as taskService from "../services/task.service.js";
import logger from "../utils/logger.util.js";

const TASK_WORKER_NAME = "task-worker";

let taskWorker;

const processTaskJob = async (job) => {
  const payload = taskJobSchema.parse(job.data);

  // A workspace deleted after the job was queued: nothing left to do, and
  // retrying would only fail 5 times on "Workspace not found".
  if (!(await findWorkspaceById(payload.workspaceId))) {
    logger.info("task.worker: workspace deleted, job skipped", { jobId: job.id, workspaceId: payload.workspaceId });
    return { skipped: "workspace-deleted" };
  }

  if (payload.action === "delete") {
    await taskService.removeTaskForNode(payload.workspaceId, payload.nodeId, payload.actorId || null);
    logger.info("task.worker: deleted task for node", { jobId: job.id, nodeId: payload.nodeId });
    return { action: "delete" };
  }

  const node = await findNodeById(payload.nodeId);
  if (!node) {
    logger.warn("task.worker: node missing before upsert", { jobId: job.id, nodeId: payload.nodeId });
    return { skipped: "missing-node" };
  }

  if (node.workspaceId.toString() !== payload.workspaceId) {
    throw new Error("Node does not belong to the target workspace");
  }

  if (payload.nodeUpdatedAt && node.updatedAt && new Date(node.updatedAt).toISOString() !== payload.nodeUpdatedAt) {
    logger.info("task.worker: stale job skipped", { jobId: job.id, nodeId: payload.nodeId });
    return { skipped: "stale-node-revision" };
  }

  const taskData = payload.taskData || {};
  const task = await taskService.updateTaskForNode(payload.workspaceId, payload.nodeId, taskData, payload.actorId || null);

  logger.info("task.worker: upserted task", { jobId: job.id, nodeId: payload.nodeId, taskId: task?.id || null });
  return { taskId: task?.id || null };
};

const createTaskWorker = () => {
  if (taskWorker) {
    return taskWorker;
  }

taskWorker = registerBullMQWorker(new Worker(TASK_QUEUE_NAME, processTaskJob, buildBullMQWorkerOptions("task")));
  taskWorker.on("active", (job) => logger.info("task.worker: started", { jobId: job.id, action: job.data?.action }));
  taskWorker.on("completed", (job) => logger.info("task.worker: completed", { jobId: job.id }));
  taskWorker.on("failed", (job, error) => logger.error("task.worker: failed", { jobId: job?.id, message: error?.message }));
  taskWorker.on("error", (error) => logger.error(`task.worker: error ${error.message}`));

  return taskWorker;
};

// Workers need Redis; the processor itself is exported for tests.
if (config.REDIS_ENABLED) {
  createTaskWorker();
}

export { processTaskJob, createTaskWorker, TASK_WORKER_NAME };

export default createTaskWorker;