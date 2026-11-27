import { createAdapter } from "@socket.io/redis-adapter";
import IORedis from "ioredis";
import { Server } from "socket.io";
import config from "../config/env.config.js";
import { sanitizeUser } from "../models/user.model.js";
import { resolveUserFromToken } from "../middleware/auth.middleware.js";
import { assertWorkspaceAccess, assertWorkspaceEditAccess } from "../services/member.service.js";
import { assertNodeAccess } from "../services/canvas-node.service.js";
import logger from "../utils/logger.util.js";
import { createSocketRateLimiter } from "./rate-limiter.js";
import { nodeDataPatchSchemaFor, socketSchemas } from "../validation/node-data.schema.js";
import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.config.js";
import {
  registerChatHandlers,
  cleanupChatForSocket,
  clearTypingForWorkspace,
} from "./zonesChat.socket.js";
import {
  findZoneAtPoint,
  updateUserZonePresence,
  removeUserFromAllZones,
  clearWorkspaceZoneState,
} from "../services/zone-presence.service.js";

let io;

const socketMetaById = new Map();
const presenceByWorkspace = new Map(); // workspaceId -> Map<userId, userInfo>

const workspaceRoom = (workspaceId) => `workspace:${workspaceId}`;

// Relay guard. Room membership is the source of truth for "may broadcast
// to this workspace": it is set only after an access check on join and is
// revoked (on every instance) when the member is removed or the workspace
// is deleted. Mutating events additionally re-check the role in the DB.
const isInWorkspaceRoom = (socket, workspaceId) =>
  typeof workspaceId === "string" && socket.rooms.has(workspaceRoom(workspaceId));
const userRoom = (userId) => `user:${userId}`;
const channelRoomPrefix = (workspaceId) => `workspace:${workspaceId}:channel:`;

// Inter-node message (via the Redis adapter's serverSideEmit) so every
// backend instance drops its own in-memory state for a workspace.
const LOCAL_CLEANUP_EVENT = "scrybe:workspace-local-cleanup";

// Presence is per user, but a user can have several sockets (tabs/devices)
// in the same workspace. Each entry tracks the user's socket ids and the
// user only goes offline when the last one leaves.
const emitWorkspacePresence = (workspaceId) => {
  const workspacePresence = presenceByWorkspace.get(workspaceId) || new Map();
  const users = Array.from(workspacePresence.values(), ({ socketIds, ...user }) => user);
  io.to(workspaceRoom(workspaceId)).emit("workspace:presence", {
    workspaceId,
    users,
  });
};

const joinWorkspacePresence = (workspaceId, user, socketId) => {
  if (!presenceByWorkspace.has(workspaceId)) {
    presenceByWorkspace.set(workspaceId, new Map());
  }

  const workspacePresence = presenceByWorkspace.get(workspaceId);
  const socketIds = workspacePresence.get(user.id)?.socketIds || new Set();
  socketIds.add(socketId);
  workspacePresence.set(user.id, {
    userId: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl || null,
    online: true,
    lastSeenAt: new Date().toISOString(),
    socketIds,
  });
};

// Returns true when the user has no socket left in the workspace (and was
// removed). socketId = null removes the user outright (access revoked).
const leaveWorkspacePresence = (workspaceId, userId, socketId = null) => {
  const workspacePresence = presenceByWorkspace.get(workspaceId);
  if (!workspacePresence) return true;

  const entry = workspacePresence.get(userId);
  if (entry && socketId) {
    entry.socketIds.delete(socketId);
    if (entry.socketIds.size > 0) return false;
  }

  workspacePresence.delete(userId);

  if (workspacePresence.size === 0) {
    presenceByWorkspace.delete(workspaceId);
  }
  return true;
};

// One socket leaves a workspace: zone presence is only cleared when it was
// the user's last socket there.
const leaveWorkspaceForSocket = (socket, workspaceId) => {
  const lastSocket = leaveWorkspacePresence(workspaceId, socket.user.id, socket.id);
  if (lastSocket) {
    removeUserFromAllZones(io, workspaceId, socket.user.id);
  }
  emitWorkspacePresence(workspaceId);
};

const cleanupSocketRooms = (socket) => {
  const meta = socketMetaById.get(socket.id);
  if (!meta?.joinedWorkspaces?.size) {
    socketMetaById.delete(socket.id);
    return;
  }

  for (const workspaceId of meta.joinedWorkspaces) {
    leaveWorkspaceForSocket(socket, workspaceId);
    socket.leave(workspaceRoom(workspaceId));
  }

  socketMetaById.delete(socket.id);
};

// Makes this instance's sockets leave a workspace (and its channel rooms)
// and forgets the related in-memory state. userId = null → everyone.
const cleanupLocalWorkspaceState = ({ workspaceId, userId = null }) => {
  if (!io || !workspaceId) return;

  for (const [socketId, meta] of socketMetaById.entries()) {
    if (!meta.joinedWorkspaces.has(workspaceId)) continue;
    if (userId && meta.user.id !== userId) continue;

    meta.joinedWorkspaces.delete(workspaceId);
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;

    socket.leave(workspaceRoom(workspaceId));
    for (const room of socket.rooms) {
      if (room.startsWith(channelRoomPrefix(workspaceId))) socket.leave(room);
    }
  }

  if (userId) {
    leaveWorkspacePresence(workspaceId, userId);
    removeUserFromAllZones(io, workspaceId, userId);
    clearTypingForWorkspace(workspaceId, userId);
    emitWorkspacePresence(workspaceId);
  } else {
    presenceByWorkspace.delete(workspaceId);
    clearWorkspaceZoneState(workspaceId);
    clearTypingForWorkspace(workspaceId);
  }
};

const broadcastWorkspaceCleanup = (payload) => {
  cleanupLocalWorkspaceState(payload);
  if (!config.REDIS_ENABLED) return; // single instance: nothing to relay
  try {
    // Reaches the other backend instances through the Redis adapter.
    io.serverSideEmit(LOCAL_CLEANUP_EVENT, payload);
  } catch (error) {
    logger.warn("serverSideEmit failed", { message: error?.message });
  }
};

// Called after a member is removed: their sockets leave the workspace room
// and every channel room (socketsLeave works across instances through the
// Redis adapter), their presence/zone/typing state is dropped, and they are
// told so the client can navigate away.
const revokeWorkspaceAccess = async (workspaceId, userId) => {
  if (!io || !workspaceId || !userId) return;

  let channelRooms = [];
  try {
    const channels = await getCollection("channels")
      .find({ workspaceId: new ObjectId(workspaceId) })
      .project({ _id: 1 })
      .toArray();
    channelRooms = channels.map((channel) => `${channelRoomPrefix(workspaceId)}${channel._id.toString()}`);
  } catch (error) {
    logger.warn("revokeWorkspaceAccess: could not list channels", { message: error?.message });
  }

  io.in(userRoom(userId)).socketsLeave([workspaceRoom(workspaceId), ...channelRooms]);
  broadcastWorkspaceCleanup({ workspaceId, userId });
  io.to(userRoom(userId)).emit("workspace:access-revoked", { workspaceId });
};

const notifyRoleChanged = (workspaceId, userId, role) => {
  if (!io || !workspaceId || !userId) return;
  io.to(userRoom(userId)).emit("workspace:role-changed", { workspaceId, role });
};

// Called after a workspace and all of its data are deleted.
const notifyWorkspaceDeleted = (workspaceId, memberUserIds = [], actorId = null) => {
  if (!io || !workspaceId) return;

  const payload = { workspaceId, actorId };
  const rooms = [workspaceRoom(workspaceId), ...memberUserIds.map(userRoom)];
  io.to(rooms).emit("workspace:deleted", payload);

  // Cross-instance with the Redis adapter.
  io.in(workspaceRoom(workspaceId)).socketsLeave(workspaceRoom(workspaceId));
  broadcastWorkspaceCleanup({ workspaceId, userId: null });
};

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: config.SOCKET_CORS_ORIGIN || config.CLIENT_URL,
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000,
  });
  // Redis adapter: without this, presence/cursor/typing/zone events only
  // reach clients connected to the SAME backend instance. Required for any
  // horizontal scaling (multiple containers/replicas behind a load balancer).
  if (config.REDIS_ENABLED) {
    const pubClient = new IORedis(config.REDIS_URL);
    const subClient = pubClient.duplicate();
    pubClient.on("error", (err) => logger.error(`Socket.IO Redis pub error: ${err.message}`));
    subClient.on("error", (err) => logger.error(`Socket.IO Redis sub error: ${err.message}`));
    io.adapter(createAdapter(pubClient, subClient));
  }

  io.use(async (socket, next) => {
    try {
      const { user } = await resolveUserFromToken(socket.handshake.auth?.token);

      if (!user.emailVerified) {
        return next(new Error("EMAIL_NOT_VERIFIED"));
      }

      socket.user = sanitizeUser(user);
      return next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  io.on(LOCAL_CLEANUP_EVENT, (payload) => cleanupLocalWorkspaceState(payload || {}));

  io.on("connection", async (socket) => {
    socketMetaById.set(socket.id, {
      user: socket.user,
      joinedWorkspaces: new Set(),
    });

    // Token-bucket limits for high-frequency events (drop excess silently,
    // disconnect sustained floods).
    socket.use(
      createSocketRateLimiter(socket, {
        onAbuse: (abusive, eventName) =>
          logger.warn("socket disconnected for flooding", { userId: abusive.user?.id, eventName }),
      }),
    );

    // Per-user room so the server can reach every tab/device of a user
    // (access revoked, role changed, workspace deleted).
    socket.join(userRoom(socket.user.id));

    logger.info(`🔌 Socket connected: ${socket.id}`);

    socket.on("workspace:join", async ({ workspaceId } = {}, ack) => {
      try {
        if (!workspaceId) {
          throw new Error("Workspace ID is required");
        }

        await assertWorkspaceAccess(workspaceId, socket.user.id);
        socket.join(workspaceRoom(workspaceId));

        const meta = socketMetaById.get(socket.id);
        meta?.joinedWorkspaces.add(workspaceId);

        joinWorkspacePresence(workspaceId, socket.user, socket.id);
        emitWorkspacePresence(workspaceId);

        ack?.({ success: true });
      } catch (error) {
        ack?.({ success: false, message: error.message || "Unable to join workspace" });
      }
    });

    socket.on("workspace:leave", ({ workspaceId } = {}, ack) => {
      if (!workspaceId) {
        ack?.({ success: false, message: "Workspace ID is required" });
        return;
      }

      const meta = socketMetaById.get(socket.id);
      meta?.joinedWorkspaces.delete(workspaceId);

      leaveWorkspaceForSocket(socket, workspaceId);

      socket.leave(workspaceRoom(workspaceId));
      ack?.({ success: true });
    });

    // Every relay below: rate limited (socket.use above), payload validated
    // with the shared schemas (invalid → dropped, never broadcast), sender
    // must be in the workspace room, and mutating events re-check node/edit
    // permission in the database.
    socket.on("workspace:cursor", async (payload = {}) => {
      const parsed = socketSchemas.cursor.safeParse(payload);
      if (!parsed.success) return;
      const { workspaceId, x, y } = parsed.data;
      if (!isInWorkspaceRoom(socket, workspaceId)) return;

      socket.to(workspaceRoom(workspaceId)).emit("workspace:cursor", {
        workspaceId,
        userId: socket.user.id,
        name: socket.user.name,
        avatarUrl: socket.user.avatarUrl || null,
        x,
        y,
      });

      // Phase 14: figure out which zone the cursor is sitting INSIDE.
      try {
        const zoneId = await findZoneAtPoint(workspaceId, { x, y });
        updateUserZonePresence(io, { workspaceId, user: socket.user, zoneId });
      } catch {
        // best-effort — presence works even if zones are not yet loaded
      }
    });

    socket.on("canvas:drag", async (payload = {}) => {
      try {
        const parsed = socketSchemas.drag.safeParse(payload);
        if (!parsed.success) return;
        const { workspaceId, nodeId, x, y } = parsed.data;
        if (!isInWorkspaceRoom(socket, workspaceId)) return;

        await assertNodeAccess(workspaceId, socket.user.id, nodeId);

        socket.to(workspaceRoom(workspaceId)).emit("canvas:drag", {
          workspaceId,
          nodeId,
          x,
          y,
          actorId: socket.user.id,
        });
      } catch {
        // silently ignore unauthorized updates
      }
    });

    socket.on("canvas:resize", async (payload = {}) => {
      try {
        const { workspaceId, nodeId, x, y, data } = payload || {};
        const position = socketSchemas.drag.safeParse({ workspaceId, nodeId, x, y });
        if (!position.success || typeof data !== "object" || data === null) return;
        if (!isInWorkspaceRoom(socket, workspaceId)) return;

        const { existing } = await assertNodeAccess(workspaceId, socket.user.id, nodeId);
        const parsedData = nodeDataPatchSchemaFor(existing.type).safeParse(data);
        if (!parsedData.success) return;

        socket.to(workspaceRoom(workspaceId)).emit("canvas:resize", {
          workspaceId,
          nodeId,
          x: position.data.x,
          y: position.data.y,
          data: parsedData.data,
          actorId: socket.user.id,
        });
      } catch {
        // silently ignore unauthorized updates
      }
    });

    socket.on("canvas:data", async ({ workspaceId, nodeId, patch } = {}) => {
      try {
        if (typeof workspaceId !== "string" || typeof nodeId !== "string" || typeof patch !== "object" || patch === null) {
          return;
        }
        if (!isInWorkspaceRoom(socket, workspaceId)) return;

        const { existing } = await assertNodeAccess(workspaceId, socket.user.id, nodeId);
        const parsedPatch = nodeDataPatchSchemaFor(existing.type).safeParse(patch);
        if (!parsedPatch.success) return;

        socket.to(workspaceRoom(workspaceId)).emit("canvas:data", {
          workspaceId,
          nodeId,
          patch: parsedPatch.data,
          actorId: socket.user.id,
        });
      } catch {
        // silently ignore unauthorized updates
      }
    });

    socket.on("canvas:text", async (payload = {}) => {
      try {
        const parsed = socketSchemas.text.safeParse(payload);
        if (!parsed.success) return;
        const { workspaceId, nodeId, value } = parsed.data;
        if (!isInWorkspaceRoom(socket, workspaceId)) return;

        await assertNodeAccess(workspaceId, socket.user.id, nodeId);

        socket.to(workspaceRoom(workspaceId)).emit("canvas:text", {
          workspaceId,
          nodeId,
          value,
          actorId: socket.user.id,
        });
      } catch {
        // silently ignore unauthorized updates
      }
    });

    socket.on("canvas:rotate", async (payload = {}) => {
      try {
        const parsed = socketSchemas.rotate.safeParse(payload);
        if (!parsed.success) return;
        const { workspaceId, nodeId, rotation } = parsed.data;
        if (!isInWorkspaceRoom(socket, workspaceId)) return;

        await assertNodeAccess(workspaceId, socket.user.id, nodeId);

        socket.to(workspaceRoom(workspaceId)).emit("canvas:rotate", {
          workspaceId,
          nodeId,
          rotation,
          actorId: socket.user.id,
        });
      } catch {
        // silently ignore unauthorized updates
      }
    });

    socket.on("canvas:draft", async (payload = {}) => {
      try {
        const parsed = socketSchemas.draft.safeParse(payload);
        if (!parsed.success) return;
        const { workspaceId, draft } = parsed.data;
        if (!isInWorkspaceRoom(socket, workspaceId)) return;

        await assertWorkspaceEditAccess(workspaceId, socket.user.id);

        socket.to(workspaceRoom(workspaceId)).emit("canvas:draft", {
          workspaceId,
          draft,
          actorId: socket.user.id,
        });
      } catch {
        // silently ignore unauthorized updates
      }
    });

    // Phase 14/15 — chat handlers (typing, channel room subscribe, message broadcasts)
    registerChatHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      // Zone/workspace presence is released per socket (last tab wins).
      cleanupChatForSocket(socket);
      cleanupSocketRooms(socket);
      logger.info(`🔌 Socket disconnected: ${socket.id} | Reason: ${reason}`);
    });
  });

  logger.info("⚡ Socket.IO initialized successfully.");
  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO not initialized. Call initSocket(server) first.");
  }
  return io;
};

const emitWorkspaceEvent = (workspaceId, eventName, payload) => {
  if (!io || !workspaceId || !eventName) {
    return;
  }

  io.to(workspaceRoom(workspaceId)).emit(eventName, payload);
};

export {
  initSocket,
  getIO,
  emitWorkspaceEvent,
  notifyWorkspaceDeleted,
  revokeWorkspaceAccess,
  notifyRoleChanged,
  isInWorkspaceRoom,
  workspaceRoom,
  userRoom,
};
