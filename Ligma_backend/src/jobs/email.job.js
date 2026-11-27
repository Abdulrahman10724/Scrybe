import crypto from "crypto";
import { z } from "zod";

import { buildStableJobId } from "./job.utils.js";

const verificationEmailJobSchema = z.object({
  type: z.literal("verification"),
  to: z.string().email(),
  name: z.string().optional().default(""),
  token: z.string().min(1),
  userId: z.string().regex(/^[a-f0-9]{24}$/i, "User ID is invalid").optional().nullable(),
});

const invitationEmailJobSchema = z.object({
  type: z.literal("invitation"),
  to: z.string().email(),
  inviterName: z.string().optional().default(""),
  workspaceTitle: z.string().min(1),
  role: z.string().min(1),
  inviteLink: z.string().url(),
  invitationId: z.string().regex(/^[a-f0-9]{24}$/i, "Invitation ID is invalid"),
});

const passwordResetEmailJobSchema = z.object({
  type: z.literal("password-reset"),
  to: z.string().email(),
  name: z.string().optional().default(""),
  token: z.string().min(1),
  userId: z.string().regex(/^[a-f0-9]{24}$/i, "User ID is invalid"),
});

const emailJobSchema = z.discriminatedUnion("type", [
  verificationEmailJobSchema,
  invitationEmailJobSchema,
  passwordResetEmailJobSchema,
]);

const buildEmailJobId = (job) => {
  if (job.type === "verification") {
    return buildStableJobId("verification-email", job.userId || job.to, job.token);
  }

  if (job.type === "password-reset") {
    // Keyed by the token hash prefix, never the raw token.
    return buildStableJobId("password-reset-email", job.userId, crypto.createHash("sha256").update(job.token).digest("hex").slice(0, 16));
  }

  return buildStableJobId("invitation-email", job.invitationId);
};

export { verificationEmailJobSchema, invitationEmailJobSchema, passwordResetEmailJobSchema, emailJobSchema, buildEmailJobId };

export default { verificationEmailJobSchema, invitationEmailJobSchema, emailJobSchema, buildEmailJobId };