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
  forgotPassword: (email) => apiClient.post("/auth/forgot-password", { email }),
  resetPassword: ({ token, password }) => apiClient.post("/auth/reset-password", { token, password }),
};

export default authService;
