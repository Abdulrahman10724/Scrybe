import apiClient, { refreshSession } from "./api.service";

export const authService = {
  register: (payload) => apiClient.post("/auth/register", payload),
  login: (payload) => apiClient.post("/auth/login", payload),
  verifyEmail: (token) => apiClient.post("/auth/verify-email", { token }),
  resendVerification: () => apiClient.post("/auth/resend-verification"),
  me: () => apiClient.get("/auth/me"),
  refresh: () => refreshSession(),
  logout: () => apiClient.post("/auth/logout"),
  logoutAll: () => apiClient.post("/auth/logout-all"),
};

export default authService;
