import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import authService from "../services/auth.service";
import { setAccessToken } from "../services/token.store";

// The access token lives in memory only (token.store + this slice); the
// session is restored on boot from the httpOnly refresh cookie.
const initialState = {
  user: null,
  token: null,
  isAuthenticated: false,
  loading: false,
  bootstrapping: true,
  error: null,
  verificationState: null,
  verificationLoading: false,
  verificationMessage: null,
};

const persistSession = (token) => {
  setAccessToken(token || null);
};

export const bootstrapAuth = createAsyncThunk("auth/bootstrap", async (_, { rejectWithValue }) => {
  try {
    // POST /auth/refresh rotates the refresh cookie and returns a fresh
    // access token plus the user.
    return await authService.refresh();
  } catch (error) {
    persistSession(null);
    return rejectWithValue(error?.response?.data?.message || error?.message || "Unable to restore session");
  }
});

// Re-reads the current user without touching the refresh token (used by the
// verify-required screen to poll for emailVerified).
export const fetchCurrentUser = createAsyncThunk("auth/fetchCurrentUser", async (_, { rejectWithValue }) => {
  try {
    return await authService.me();
  } catch (error) {
    return rejectWithValue(error?.message || "Unable to load the current user");
  }
});

export const logoutAllDevices = createAsyncThunk("auth/logoutAll", async (_, { rejectWithValue }) => {
  try {
    await authService.logoutAll();
    persistSession(null);
    return null;
  } catch (error) {
    persistSession(null);
    return rejectWithValue(error?.message || "Logout failed");
  }
});

export const loginUser = createAsyncThunk("auth/login", async (credentials, { rejectWithValue }) => {
  try {
    const result = await authService.login(credentials);
    persistSession(result?.data?.token);
    return result;
  } catch (error) {
    return rejectWithValue({
      message: error?.message || error?.data?.message || "Login failed",
      status: error?.status || error?.data?.status || 400,
    });
  }
});

export const registerUser = createAsyncThunk("auth/register", async (payload, { rejectWithValue }) => {
  try {
    const result = await authService.register(payload);
    persistSession(result?.data?.token);
    return result;
  } catch (error) {
    return rejectWithValue(error?.message || "Registration failed");
  }
});

export const verifyEmailUser = createAsyncThunk("auth/verifyEmail", async (token, { rejectWithValue }) => {
  try {
    return await authService.verifyEmail(token);
  } catch (error) {
    return rejectWithValue({
      message: error?.message || error?.data?.message || "Verification failed",
      status: error?.status || error?.data?.status || 400,
    });
  }
});

export const resendVerificationEmail = createAsyncThunk("auth/resendVerification", async (_, { rejectWithValue }) => {
  try {
    return await authService.resendVerification();
  } catch (error) {
    return rejectWithValue({
      message: error?.message || error?.data?.message || "Unable to resend verification email",
      status: error?.status || error?.data?.status || 400,
    });
  }
});

export const logoutUser = createAsyncThunk("auth/logout", async (_, { rejectWithValue }) => {
  try {
    await authService.logout();
    persistSession(null);
    return null;
  } catch (error) {
    persistSession(null);
    return rejectWithValue(error?.message || "Logout failed");
  }
});

const setAuthenticatedUser = (state, payload) => {
  state.user = payload?.data?.user || null;
  state.token = payload?.data?.token || null;
  state.isAuthenticated = Boolean(state.user && state.token);
};

const resetSession = (state) => {
  state.user = null;
  state.token = null;
  state.isAuthenticated = false;
  state.loading = false;
  state.error = null;
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearAuthState(state) {
      resetSession(state);
      persistSession(null);
    },
    // Called when the refresh token is rejected mid-session.
    sessionExpired(state) {
      resetSession(state);
      persistSession(null);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapAuth.pending, (state) => {
        state.bootstrapping = true;
      })
      .addCase(bootstrapAuth.fulfilled, (state, action) => {
        state.bootstrapping = false;

        if (action.payload?.data?.user && action.payload?.data?.token) {
          setAuthenticatedUser(state, action.payload);
        } else {
          resetSession(state);
        }
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        if (action.payload?.data?.user) {
          state.user = action.payload.data.user;
        }
      })
      .addCase(logoutAllDevices.fulfilled, (state) => {
        resetSession(state);
      })
      .addCase(logoutAllDevices.rejected, (state) => {
        resetSession(state);
      })
      .addCase(bootstrapAuth.rejected, (state) => {
        state.bootstrapping = false;
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
      })
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(verifyEmailUser.pending, (state) => {
        state.verificationLoading = true;
        state.verificationMessage = null;
        state.verificationState = "loading";
      })
      .addCase(resendVerificationEmail.pending, (state) => {
        state.verificationLoading = true;
        state.verificationMessage = null;
      })
      .addCase(registerUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        setAuthenticatedUser(state, action.payload);
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.loading = false;
        setAuthenticatedUser(state, action.payload);
        state.error = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || "Login failed";
      })
      .addCase(verifyEmailUser.fulfilled, (state, action) => {
        state.verificationLoading = false;
        state.verificationMessage = action.payload?.message || "Email verified successfully";
        state.verificationState = action.payload?.data?.alreadyVerified ? "already-verified" : "success";

        if (state.user) {
          state.user.emailVerified = true;
        }
      })
      .addCase(verifyEmailUser.rejected, (state, action) => {
        state.verificationLoading = false;
        state.verificationMessage = action.payload?.message || "Verification failed";
        state.verificationState = action.payload?.status === 410 ? "expired" : "error";
      })
      .addCase(resendVerificationEmail.fulfilled, (state, action) => {
        state.verificationLoading = false;
        state.verificationMessage = action.payload?.message || "Verification email sent";
      })
      .addCase(resendVerificationEmail.rejected, (state, action) => {
        state.verificationLoading = false;
        state.verificationMessage = action.payload?.message || "Unable to resend verification email";
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || "Registration failed";
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        state.loading = false;
        state.error = null;
      })
      .addCase(logoutUser.rejected, (state) => {
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        state.loading = false;
        state.error = null;
      });
  },
});

export const { clearAuthState, sessionExpired } = authSlice.actions;

export default authSlice.reducer;