import SibApiV3Sdk from "sib-api-v3-sdk";

import config from "../config/env.config.js";
import logger from "../utils/logger.util.js";

// Brevo REST API — HTTPS (port 443), no SMTP, no Render port-block issue.
const client = SibApiV3Sdk.ApiClient.instance;
client.authentications["api-key"].apiKey = config.BREVO_API_KEY;

const canUseBrevo = Boolean(config.BREVO_API_KEY && config.GMAIL_USER);

if (!canUseBrevo) {
  logger.error(
    `Brevo NOT configured. BREVO_API_KEY set: ${Boolean(config.BREVO_API_KEY)}, GMAIL_USER set: ${Boolean(config.GMAIL_USER)}`
  );
}
let apiInstance = null;
const getApiInstance = () => {
  if (!canUseBrevo) return null;
  if (!apiInstance) {
    apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
  }
  return apiInstance;
};

const buildVerificationUrl = (token) => {
  const baseUrl = config.CLIENT_URL.replace(/\/$/, "");
  return `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
};

const sendVerificationEmail = async ({ to, name, token }) => {
  const api = getApiInstance();
  if (!api) {
    throw new Error("Brevo is not configured (BREVO_API_KEY / GMAIL_USER missing)");
  }

  const verificationUrl = buildVerificationUrl(token);
   const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your email</title>
</head>
<body style="margin:0;padding:0;background-color:#F1F5F9;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F5F9;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,0.12);">

          <!-- Gradient header -->
          <tr>
            <td align="center" bgcolor="#0D9488" style="background-color:#0D9488;background-image:linear-gradient(135deg,#0D9488 0%,#4F46E5 100%);padding:40px 24px 56px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" width="64" height="64" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:18px;font-size:34px;font-weight:800;color:#0D9488;line-height:64px;">S</td>
                </tr>
              </table>
              <div style="margin-top:14px;font-size:26px;font-weight:800;letter-spacing:-0.5px;color:#FFFFFF;">scrybe<span style="color:#FBBF24;">.</span></div>
              <div style="margin-top:6px;font-size:13px;color:#CCFBF1;">Brainstorm. Collaborate. Ship.</div>
            </td>
          </tr>

          <!-- Body card -->
          <tr>
            <td style="padding:0 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:-28px;background-color:#FFFFFF;border-radius:20px;border:1px solid #E2E8F0;">
                <tr>
                  <td align="center" style="padding:32px 24px 8px;">
                    <div style="font-size:42px;line-height:1;">&#9993;&#65039;</div>
                    <h1 style="margin:14px 0 8px;font-size:24px;color:#0F172A;">Hi ${name || "there"}, verify your email</h1>
                    <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">
                      Welcome to Scrybe! Verify your email address with one click to activate your account and start brainstorming with your team.
                    </p>
                  </td>
                </tr>

                <!-- Button -->
                <tr>
                  <td align="center" style="padding:24px 24px 8px;">
                    <a href="${verificationUrl}" target="_blank"
                       style="display:inline-block;background-color:#0D9488;background-image:linear-gradient(135deg,#0D9488,#4F46E5);color:#FFFFFF;text-decoration:none;font-weight:700;font-size:16px;padding:15px 38px;border-radius:14px;">
                      Verify my email &rarr;
                    </a>
                  </td>
                </tr>

                <tr>
                  <td align="center" style="padding:8px 24px 28px;">
                    <p style="margin:0;font-size:12px;color:#94A3B8;">This link expires in 24 hours.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Feature chips -->
          <tr>
            <td align="center" style="padding:28px 24px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:0 4px;"><span style="display:inline-block;background-color:#CCFBF1;color:#0F766E;font-size:12px;font-weight:700;padding:7px 12px;border-radius:99px;">&#10024; AI Tasks</span></td>
                  <td style="padding:0 4px;"><span style="display:inline-block;background-color:#E0E7FF;color:#4338CA;font-size:12px;font-weight:700;padding:7px 12px;border-radius:99px;">&#128101; Live Canvas</span></td>
                  <td style="padding:0 4px;"><span style="display:inline-block;background-color:#FEF3C7;color:#B45309;font-size:12px;font-weight:700;padding:7px 12px;border-radius:99px;">&#9203; Time Travel</span></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Fallback link -->
          <tr>
            <td style="padding:20px 36px 8px;">
              <p style="margin:0 0 6px;font-size:12px;color:#64748B;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="margin:0;font-size:12px;word-break:break-all;"><a href="${verificationUrl}" style="color:#4F46E5;">${verificationUrl}</a></p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 36px 32px;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#94A3B8;">
                If you didn't create a Scrybe account, you can safely ignore this email.<br />
                &copy; ${new Date().getFullYear()} Scrybe. Built with care.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
  const text = `Hi ${name || "there"},\n\nWelcome to Scrybe. Please verify your email address to get started.\n\n${verificationUrl}\n\nThis verification link expires in 24 hours.`;

  try {
    const result = await api.sendTransacEmail({
      sender: { email: config.GMAIL_USER, name: "Scrybe" },
      to: [{ email: to, name: name || undefined }],
      subject: "Verify your Scrybe email",
      htmlContent: html,
      textContent: text,
    });

    logger.info("Verification email sent via Brevo", { id: result?.messageId, to });
    return { success: true, id: result?.messageId };
  } catch (error) {
    logger.error("Failed to send verification email", {
      message: error?.message,
      status: error?.status,
      body: error?.response?.body || error?.response?.text,
      to,
    });
        throw new Error("We couldn't send the verification email right now.");
  }
};

const buildInvitationHtml = ({ inviterName, workspaceTitle, role, inviteLink }) => `
  <div style="font-family: Inter, Arial, sans-serif; background:#f7f7fb; padding:24px; color:#111827;">
    <div style="max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:16px; overflow:hidden;">
      <div style="background:linear-gradient(135deg, #0d9488 0%, #0f766e 100%); padding:24px 28px; color:#ffffff;">
        <div style="font-size:12px; font-weight:700; letter-spacing:0.2em; text-transform:uppercase; opacity:0.9;">Scrybe</div>
        <h1 style="margin:12px 0 6px; font-size:22px;">You're invited to collaborate</h1>
        <p style="margin:0; font-size:14px; opacity:0.95;">${inviterName || "A teammate"} invited you to join a workspace on Scrybe.</p>
      </div>
      <div style="padding:28px;">
        <p style="margin:0 0 16px; line-height:1.6; color:#374151;">
          <strong>${inviterName || "Someone"}</strong> invited you to join <strong>${workspaceTitle}</strong> as a <strong>${role}</strong>.
        </p>
        <p style="margin:0 0 20px;">
          <a href="${inviteLink}" style="display:inline-block; padding:12px 20px; border-radius:999px; background:#0d9488; color:#ffffff; text-decoration:none; font-weight:700;">Accept invitation</a>
        </p>
        <p style="margin:0 0 10px; font-size:13px; color:#6b7280; line-height:1.6;">
          If the button does not work, copy and open this link in your browser:<br />
          <span style="word-break:break-all;">${inviteLink}</span>
        </p>
        <p style="margin:16px 0 0; font-size:12px; color:#9ca3af; line-height:1.6;">
          If you weren't expecting this invitation, you can safely ignore this email.
        </p>
      </div>
    </div>
  </div>
`;

const sendInvitationEmail = async ({ to, inviterName, workspaceTitle, role, inviteLink }) => {
  const api = getApiInstance();
  if (!api) {
    throw new Error("Brevo is not configured (BREVO_API_KEY / GMAIL_USER missing)");
  }

  const html = buildInvitationHtml({ inviterName, workspaceTitle, role, inviteLink });
  const text = `${inviterName || "Someone"} invited you to join "${workspaceTitle}" as a ${role} on Scrybe.\n\nAccept the invitation: ${inviteLink}`;

  try {
    const result = await api.sendTransacEmail({
      sender: { email: config.GMAIL_USER, name: "Scrybe" },
      to: [{ email: to }],
      subject: `${inviterName || "Someone"} invited you to join "${workspaceTitle}" on Scrybe`,
      htmlContent: html,
      textContent: text,
    });
    logger.info("Invitation email sent via Brevo", { id: result?.messageId, to });
    return { success: true, id: result?.messageId };
  } catch (error) {
    logger.error("Failed to send invitation email", {
      message: error?.message,
      status: error?.status,
      body: error?.response?.body || error?.response?.text,
      to,
    });
        throw new Error("We couldn't send the invitation email right now.");
  }
};

export { buildVerificationUrl, sendVerificationEmail, sendInvitationEmail };

export default {
  buildVerificationUrl,
  sendVerificationEmail,
  sendInvitationEmail,
};