import config from "../config/env.config.js";

const REFRESH_COOKIE_NAME = "scrybe_rt";
// Scoped to the auth routes: the refresh token is never sent with ordinary
// API calls. In production the browser sees these routes on the Vercel
// origin (vercel.json rewrite), so the cookie is first-party.
const REFRESH_COOKIE_PATH = "/api/v1/auth";

const baseCookieOptions = () => ({
  httpOnly: true,
  secure: config.COOKIE_SECURE,
  sameSite: "lax",
  path: REFRESH_COOKIE_PATH,
});

const setRefreshCookie = (res, rawToken) => {
  res.cookie(REFRESH_COOKIE_NAME, rawToken, {
    ...baseCookieOptions(),
    maxAge: config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
};

const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, baseCookieOptions());
};

const readRefreshCookie = (req) => req.cookies?.[REFRESH_COOKIE_NAME] || null;

export { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH, setRefreshCookie, clearRefreshCookie, readRefreshCookie };
