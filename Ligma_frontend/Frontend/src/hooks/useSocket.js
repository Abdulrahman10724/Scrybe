import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

import { refreshSession } from "../services/api.service";
import { getAccessToken, subscribeAccessToken } from "../services/token.store";

// Socket.IO connects straight to the backend (not through the Vercel
// rewrite) and authenticates with the in-memory access token.
const socketUrl = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

let socketInstance = null;
let unauthorizedRetryInFlight = false;
const joinedWorkspaces = new Set();
const workspaceRefCounts = new Map(); // workspaceId -> number of active consumers

// Keep socket.auth in step with the token: refreshed tokens are used on the
// next (re)connect; logout disconnects; a new login reconnects.
subscribeAccessToken((token) => {
  if (!socketInstance) return;
  socketInstance.auth.token = token;
  if (!token) {
    socketInstance.disconnect();
  } else if (!socketInstance.connected) {
    socketInstance.connect();
  }
});

const ensureSocket = () => {
  const token = getAccessToken();

  if (socketInstance) {
    if (socketInstance.auth.token !== token) {
      socketInstance.auth.token = token;
    }
    // Middleware rejections (e.g. expired token) don't auto-reconnect.
    if (token && !socketInstance.connected && !socketInstance.active) {
      socketInstance.connect();
    }
    return socketInstance;
  }

  socketInstance = io(socketUrl, {
    auth: { token },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socketInstance.on("connect", () => {
    const workspaceIds = Array.from(joinedWorkspaces);
    for (const workspaceId of workspaceIds) {
      socketInstance.emit("workspace:join", { workspaceId });
    }
  });

  // The handshake rejected our access token (expired after 15 min, or
  // revoked): refresh once and reconnect with the new token. The token
  // subscription above performs the reconnect.
  socketInstance.on("connect_error", async (error) => {
    if (error?.message !== "Unauthorized" || unauthorizedRetryInFlight) return;
    unauthorizedRetryInFlight = true;
    try {
      await refreshSession();
      if (socketInstance && !socketInstance.connected) {
        socketInstance.auth.token = getAccessToken();
        socketInstance.connect();
      }
    } catch {
      /* refresh failed — the API layer logs the user out */
    } finally {
      unauthorizedRetryInFlight = false;
    }
  });

  return socketInstance;
};

export const useSocket = ({ workspaceId, autoJoin = true } = {}) => {
  const socketRef = useRef(null);
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    socketRef.current = ensureSocket();

    const socket = socketRef.current;

    const handleConnect = () => setStatus("connected");
    const handleReconnectAttempt = () => setStatus("reconnecting");
    const handleConnectError = () => setStatus("offline");
    const handleDisconnect = () => setStatus("offline");

    if (socket.connected) {
      setStatus("connected");
    }

    socket.on("connect", handleConnect);
    socket.io.on("reconnect_attempt", handleReconnectAttempt);
    socket.on("connect_error", handleConnectError);
    socket.on("disconnect", handleDisconnect);

   if (workspaceId && autoJoin) {
  const nextCount = (workspaceRefCounts.get(workspaceId) || 0) + 1;
  workspaceRefCounts.set(workspaceId, nextCount);
  if (nextCount === 1) {
    joinedWorkspaces.add(workspaceId);
    socket.emit("workspace:join", { workspaceId });
  }
}

return () => {
  socket.off("connect", handleConnect);
  socket.io.off("reconnect_attempt", handleReconnectAttempt);
  socket.off("connect_error", handleConnectError);
  socket.off("disconnect", handleDisconnect);

  if (workspaceId && autoJoin) {
    const nextCount = (workspaceRefCounts.get(workspaceId) || 1) - 1;
    if (nextCount <= 0) {
      workspaceRefCounts.delete(workspaceId);
      joinedWorkspaces.delete(workspaceId);
      socket.emit("workspace:leave", { workspaceId });
    } else {
      workspaceRefCounts.set(workspaceId, nextCount);
    }
  }
};
  }, [workspaceId, autoJoin]);

  const emit = (event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  };

  const on = (event, callback) => {
    socketRef.current?.on(event, callback);
  };

  const off = (event, callback) => {
    socketRef.current?.off(event, callback);
  };

  const api = useMemo(
    () => ({
      socket: socketRef.current,
      emit,
      on,
      off,
      status,
      isConnected: status === "connected",
    }),
    [status]
  );

  return api;
};

export default useSocket;
