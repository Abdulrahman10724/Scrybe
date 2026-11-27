import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import config from "./config/env.config.js";
import { getBullMQHealth } from "./config/bullmq.config.js";
import errorHandler from "./middleware/error.middleware.js";
import { forwardedChain, peerAddress } from "./utils/client-ip.util.js";
import { requireHealthToken } from "./middleware/health-token.middleware.js";

import authRoutes from "./routes/auth.routes.js";
import invitationRoutes from "./routes/invitation.routes.js";
import workspaceRoutes from "./routes/workspace.routes.js";
import memberRoutes from "./routes/member.routes.js";
import canvasNodeRoutes from "./routes/canvas-node.routes.js";
import taskRoutes from "./routes/task.routes.js";
import zoneRoutes from "./routes/zone.routes.js";
import chatRoutes from "./routes/chat.routes.js";

// Builds the Express application without opening a port, connecting to the
// database or starting background workers. index.js wires those up for the
// real server; tests mount the same app on an ephemeral port.
const createApp = ({ isBackgroundJobsEnabled = () => false } = {}) => {
  const app = express();
  // See src/utils/client-ip.util.js for why this is configurable.
  app.set("trust proxy", config.TRUST_PROXY_HOPS);

  // Security & core middleware
  app.use(helmet());
  app.use(
    cors({
      origin: config.CLIENT_URL,
      credentials: true,
    })
  );
  // Largest legitimate body is a canvas node (data capped at 32KB by
  // node-data.schema.js); chat messages are 4,000 chars. 256kb leaves room.
  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: true, limit: "256kb" }));
  app.use(cookieParser());
  if (config.NODE_ENV !== "test") {
    app.use(morgan(config.NODE_ENV === "development" ? "dev" : "combined"));
  }

  // Global rate limiter
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5000,
    message: { success: false, message: "Too many requests, please try again later." },
    statusCode: 429,
  });
  app.use(globalLimiter);

  // Coarse limiter keyed on the address that connected to Render's edge,
  // which a client can't forge with its own X-Forwarded-For header.
  const peerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: config.PEER_RATE_LIMIT_MAX,
    keyGenerator: (req) => ipKeyGenerator(peerAddress(req)),
    message: { success: false, message: "Too many requests, please try again later." },
    statusCode: 429,
  });
  app.use(peerLimiter);

  // Public health checks: status only, no environment or internals.
  app.get("/", (req, res) => res.json({ status: "ok" }));
  app.get("/health", (req, res) => res.json({ success: true, status: "healthy" }));

  // Internal diagnostics (X-Health-Token).
  app.get("/health/queues", requireHealthToken, (req, res) => {
    const backgroundJobsEnabled = isBackgroundJobsEnabled();
    res.json({
      success: true,
      status: backgroundJobsEnabled ? "healthy" : "degraded",
      backgroundJobsEnabled,
      bullmq: getBullMQHealth(),
    });
  });
  // Shows how the proxy chain resolves, to calibrate TRUST_PROXY_HOPS.
  // Under /api/v1 so it can be reached through the Vercel rewrite too.
  app.get("/api/v1/health/ip", requireHealthToken, (req, res) => {
    res.json({
      success: true,
      trustProxyHops: config.TRUST_PROXY_HOPS,
      ip: req.ip,
      peer: peerAddress(req),
      chain: forwardedChain(req),
    });
  });

  // Versioned API
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/invitations", invitationRoutes);
  app.use("/api/v1/workspaces", workspaceRoutes);
  app.use("/api/v1/workspaces/:workspaceId/members", memberRoutes);
  app.use("/api/v1/workspaces/:workspaceId/canvas", canvasNodeRoutes);
  app.use("/api/v1/workspaces/:workspaceId/tasks", taskRoutes);
  app.use("/api/v1/workspaces/:workspaceId/zones", zoneRoutes);
  app.use("/api/v1/workspaces/:workspaceId/chat", chatRoutes);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: `Route ${req.method} ${req.path} not found`,
    });
  });

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
};

export { createApp };

export default createApp;
