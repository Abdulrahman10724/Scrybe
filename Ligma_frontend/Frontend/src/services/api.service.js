import axios from "axios";

import { getAccessToken, setAccessToken } from "./token.store";

// Relative by default: in production Vercel rewrites /api/v1/* to the Render
// backend (vercel.json) and in development Vite proxies /api to
// localhost:5000 (vite.config.js). Same-origin requests keep the httpOnly
// refresh cookie first-party, which Safari/Chrome require.
const baseURL = import.meta.env.VITE_API_URL || "/api/v1";

const clientDefaults = {
  baseURL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
};

const apiClient = axios.create(clientDefaults);

// Bare client for the refresh call itself: no interceptors, so a failing
// refresh can never recurse into another refresh.
const refreshClient = axios.create(clientDefaults);

// ── Session refresh (single-flight) ───────────────────────────────────────
// Concurrent 401s share one in-flight refresh; each waits for it and then
// replays its own request with the new token.
let refreshPromise = null;
let onSessionExpired = null;

export const setSessionExpiredHandler = (handler) => {
  onSessionExpired = handler;
};

export const refreshSession = () => {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post("/auth/refresh")
      .then((response) => {
        const payload = response.data;
        setAccessToken(payload?.data?.token || null);
        return payload;
      })
      .catch((error) => {
        setAccessToken(null);
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

// Request Interceptor: attach the in-memory access token.
apiClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Routes whose 401 means "bad credentials/token", not "access token expired".
const AUTH_ROUTES_SKIP_REFRESH = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
  "/auth/resend-verification",
  "/auth/verify-email",
  "/auth/forgot-password",
  "/auth/reset-password",
];

const toApiError = (error) => ({
  data: error.response?.data || error,
  status: error.response?.status,
  message: error.response?.data?.message || error.message,
  code: error.response?.data?.code,
});

apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;
    const isAuthRoute = AUTH_ROUTES_SKIP_REFRESH.some((route) => originalRequest?.url?.includes(route));

    // Access token expired/revoked: refresh once, then replay the request.
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthRoute) {
      originalRequest._retry = true;
      try {
        await refreshSession();
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${getAccessToken()}`;
        return apiClient(originalRequest);
      } catch {
        onSessionExpired?.();
        return Promise.reject(toApiError(error));
      }
    }

    // Server-side email verification gate: any protected call made by an
    // unverified account comes back 403 EMAIL_NOT_VERIFIED. Send the user to
    // the verify screen (not /login — their session is still valid).
    if (
      error.response?.status === 403 &&
      error.response?.data?.code === "EMAIL_NOT_VERIFIED" &&
      typeof window !== "undefined" &&
      window.location.pathname !== "/verify-required"
    ) {
      window.location.assign("/verify-required");
    }

    return Promise.reject(toApiError(error));
  }
);

export default apiClient;
