import nodemailer from 'nodemailer';
import { logger } from './logger.js';

/**
 * ═══════════════════════════════════════════════════════════════
 * DXER Email Service
 * ═══════════════════════════════════════════════════════════════
 *
 * Sends real emails using SMTP. Configure via environment variables:
 *
 *   SMTP_HOST       - SMTP server hostname (e.g. smtp.gmail.com)
 *   SMTP_PORT       - SMTP port (587 for TLS, 465 for SSL)
 *   SMTP_SECURE     - Use SSL (true for port 465, false for 587)
 *   SMTP_USER       - SMTP username / email
 *   SMTP_PASS       - SMTP password / app password
 *   SMTP_FROM_NAME  - Display name for From header (default: DXER)
 *   SMTP_FROM_EMAIL - From email address (default: SMTP_USER)
 *
 * For Gmail:
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_SECURE=false
 *   SMTP_USER=yourname@gmail.com
 *   SMTP_PASS=xxxx xxxx xxxx xxxx   (16-char App Password)
 *
 * If SMTP is not configured, emails are logged to console instead.
 * ═══════════════════════════════════════════════════════════════
 */

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    logger.warn('SMTP not configured — emails will be logged to console only. Set SMTP_HOST, SMTP_USER, SMTP_PASS.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });

  logger.info({ host, user }, 'SMTP email transporter initialized');
  return transporter;
}

/**
 * Send the employee onboarding invitation email.
 */
export async function sendOnboardingInvite(params: {
  to: string;
  employeeName: string;
  organizationName: string;
  position: string | null;
  department: string | null;
  onboardingUrl: string;
  expiresAt: Date;
}): Promise<{ sent: boolean; previewUrl?: string }> {
  const { to, employeeName, organizationName, position, department, onboardingUrl, expiresAt } = params;
  const fromName = process.env.SMTP_FROM_NAME || 'DXER';
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'noreply@dxer.app';

  const subject = `You're invited to join ${organizationName} on DXER`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#faf9fc;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#faf9fc;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#9333ea,#7e22ce);padding:32px 40px;text-align:center;">
              <div style="display:inline-block;background:rgba(255,255,255,0.2);border-radius:12px;padding:8px 16px;margin-bottom:12px;">
                <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:1px;">DXER</span>
              </div>
              <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:8px 0 0;">You're Invited!</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="color:#1f2937;font-size:16px;line-height:1.6;margin:0 0 20px;">
                Hi <strong>${employeeName}</strong>,
              </p>
              <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 20px;">
                You have been invited to join <strong style="color:#9333ea;">${organizationName}</strong> on the DXER platform.
              </p>

              ${position || department ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#faf5ff;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
                <tr>
                  ${position ? `<td style="padding:4px 0;"><span style="color:#9ca3af;font-size:13px;">Position:</span> <strong style="color:#1f2937;font-size:13px;">${position}</strong></td>` : ''}
                </tr>
                ${department ? `<tr><td style="padding:4px 0;"><span style="color:#9ca3af;font-size:13px;">Department:</span> <strong style="color:#1f2937;font-size:13px;">${department}</strong></td></tr>` : ''}
              </table>
              ` : ''}

              <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 8px;">
                To complete your onboarding, click the button below:
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td align="center">
                    <a href="${onboardingUrl}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#9333ea,#7e22ce);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:12px;box-shadow:0 4px 14px rgba(147,51,234,0.3);">
                      Start Onboarding
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0 0 16px;">
                This link expires on <strong>${expiresAt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>.
              </p>

              <!-- Steps -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f3f8;border-radius:12px;padding:20px;margin-top:8px;">
                <tr><td style="color:#6b7280;font-size:13px;font-weight:600;padding-bottom:12px;">What you'll complete:</td></tr>
                <tr><td style="color:#4b5563;font-size:13px;padding:4px 0;">1. Create your account</td></tr>
                <tr><td style="color:#4b5563;font-size:13px;padding:4px 0;">2. Verify your identity</td></tr>
                <tr><td style="color:#4b5563;font-size:13px;padding:4px 0;">3. Review & sign your employment contract</td></tr>
                <tr><td style="color:#4b5563;font-size:13px;padding:4px 0;">4. Get your Polygon blockchain wallet</td></tr>
              </table>

              <!-- Fallback Link -->
              <p style="color:#9ca3af;font-size:11px;line-height:1.6;margin:24px 0 0;word-break:break-all;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${onboardingUrl}" style="color:#9333ea;">${onboardingUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#faf9fc;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="color:#9ca3af;font-size:11px;margin:0;">
                Sent by DXER &mdash; Blockchain-anchored business operations
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Hi ${employeeName},

You have been invited to join ${organizationName} on the DXER platform.
${position ? `Position: ${position}` : ''}${department ? `\nDepartment: ${department}` : ''}

To complete your onboarding, visit this link:
${onboardingUrl}

This link expires on ${expiresAt.toLocaleDateString()}.

Steps:
1. Create your account
2. Verify your identity
3. Review & sign your employment contract
4. Get your Polygon blockchain wallet

— DXER Team`;

  const transport = getTransporter();

  if (!transport) {
    // No SMTP configured — log to console
    logger.info({
      to,
      subject,
      onboardingUrl,
    }, '📧 EMAIL NOT SENT (SMTP not configured) — onboarding link:');
    return { sent: false };
  }

  try {
    const info = await transport.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text,
      html,
    });

    logger.info({
      to,
      messageId: info.messageId,
      response: info.response,
    }, '📧 Onboarding invitation email SENT');

    return {
      sent: true,
      previewUrl: nodemailer.getTestMessageUrl(info) || undefined,
    };
  } catch (err: any) {
    logger.error({
      to,
      error: err.message,
    }, '📧 Failed to send onboarding email');
    // Don't throw — email failure shouldn't block the invite
    return { sent: false };
  }
}
