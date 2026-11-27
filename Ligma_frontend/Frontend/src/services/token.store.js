// In-memory access-token store. The access token is short-lived (15 min)
// and deliberately never written to localStorage/sessionStorage, so an XSS
// payload can't lift a long-lived credential from storage. The session
// survives reloads through the httpOnly refresh cookie (POST /auth/refresh).

const LEGACY_TOKEN_KEY = "Scrybe_token";

let accessToken = null;
const listeners = new Set();

export const getAccessToken = () => accessToken;

export const setAccessToken = (token) => {
  const next = token || null;
  if (next === accessToken) return;
  accessToken = next;
  for (const listener of listeners) {
    try {
      listener(accessToken);
    } catch {
      /* a broken listener must not block the others */
    }
  }
};

export const subscribeAccessToken = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// Older builds kept a 1-day JWT in localStorage. Remove it on start-up.
export const clearLegacyStoredToken = () => {
  try {
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) — nothing to clean */
  }
};
