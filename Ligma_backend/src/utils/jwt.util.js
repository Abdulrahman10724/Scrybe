import jwt from "jsonwebtoken";

import config from "../config/env.config.js";

// Access tokens carry the user's tokenVersion ("tv"). Bumping the version
// (logout-all, password reset, refresh-token reuse) invalidates every
// access token issued before it, even before the 15-minute expiry.
const signAccessToken = ({ id, tokenVersion = 0 }) =>
  jwt.sign({ id, tv: tokenVersion }, config.JWT_SECRET, { expiresIn: config.ACCESS_TOKEN_TTL });

const verifyAccessToken = (token) => jwt.verify(token, config.JWT_SECRET);

export { signAccessToken, verifyAccessToken };

export default {
  signAccessToken,
  verifyAccessToken,
};
