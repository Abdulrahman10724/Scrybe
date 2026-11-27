import http from "http";
import dns from "node:dns";

import { closeBullMQInfrastructure, ensureBullMQConnection } from "./src/config/bullmq.config.js";
import config from "./src/config/env.config.js";
import connectDB, { closeDB } from "./src/config/db.config.js";
import { createApp } from "./src/app.js";
import { initSocket } from "./src/socket/socket.service.js";
import logger from "./src/utils/logger.util.js";
import { enqueueInfrastructureCheckJob } from "./src/queues/infrastructure.queue.js";

dns.setDefaultResultOrder("ipv4first");

// Tracks whether background job processing (BullMQ/Redis) is available.
// The API still serves requests without it — only async side-effects
// (classification, task upsert, email, infra check) are skipped.
let backgroundJobsEnabled = false;

const app = createApp({ isBackgroundJobsEnabled: () => backgroundJobsEnabled });
const server = http.createServer(app);
let isShuttingDown = false;

const startBackgroundJobs = async () => {
  if (!config.REDIS_ENABLED) {
    logger.warn("REDIS_ENABLED=false — background jobs disabled.");
    return false;
  }

  try {
    await ensureBullMQConnection("producer");
    await ensureBullMQConnection("worker");

    await import("./src/workers/classification.worker.js");
    await import("./src/workers/task.worker.js");
    await import("./src/workers/email.worker.js");
    await import("./src/workers/infrastructure.worker.js");

    backgroundJobsEnabled = true;
    logger.info("✅ Background job workers started.");
    return true;
  } catch (error) {
    backgroundJobsEnabled = false;
    logger.error(`❌ BullMQ/Redis unavailable — background jobs disabled: ${error.message}`);
    return false;
  }
};

const startServer = async () => {
  await connectDB();
  logger.info(`✅ Connected to MongoDB at ${config.MONGODB_URI.replace(/:[^:@]+@/, ":***@")} `);

  const started = await startBackgroundJobs();

  // If Redis wasn't ready at boot, keep retrying in the background every
  // 15s until it comes up — instead of permanently disabling job
  // processing for the process lifetime.
  if (!started && config.REDIS_ENABLED) {
    const retryTimer = setInterval(async () => {
      if (backgroundJobsEnabled) {
        clearInterval(retryTimer);
        return;
      }
      const ok = await startBackgroundJobs();
      if (ok) clearInterval(retryTimer);
    }, 15000);
    retryTimer.unref(); // don't block process exit
  }

  // Initialize Socket.IO
  initSocket(server);

  server.listen(config.PORT, () => {
    logger.info(`🚀 Scrybe backend running on port ${config.PORT} (${config.NODE_ENV})`);
  });

  if (backgroundJobsEnabled) {
    await enqueueInfrastructureCheckJob({ source: "startup" }).catch((error) => {
      logger.warn("infrastructure check job enqueue failed", { message: error?.message });
    });
  }
};

const shutdown = async (signal) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info(`🛑 Received ${signal}; starting graceful shutdown.`);

  await new Promise((resolve) => server.close(resolve));

  await Promise.allSettled([
    closeBullMQInfrastructure(),
    closeDB(),
  ]);

  logger.info("✅ Graceful shutdown complete.");
  process.exit(0);
};

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

startServer().catch((error) => {
  logger.error("Failed to start server", { message: error?.message });
  process.exit(1);
});

export default app;
