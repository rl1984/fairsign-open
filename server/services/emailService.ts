import nodemailer from "nodemailer";
import { Resend } from "resend";
import { storage } from "../storage";
import type { Document, EmailLog } from "@shared/schema";
import { FAIRSIGN_LOGO_HTML } from "./fairsignLogo";

export type EmailType = "signature_request" | "completion_notice" | "reminder" | "email_verification" | "team_invitation" | "account_deletion";

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendEmailOptions {
  documentId?: string;
  emailType: EmailType;
  toEmail: string;
  toName?: string;
  subject: string;
  htmlBody: string;
  attachments?: EmailAttachment[];
}

export interface EmailResult {
  success: boolean;
  emailLogId: string;
  error?: string;
}

function getSmtpTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_FROM_EMAIL || "noreply@fairsign.io";
  const fromName = process.env.SMTP_FROM_NAME || "FairSign.io";

  if (!host || !user || !pass) {
    return null;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });

  return { transporter, fromEmail, fromName };
}

export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  const { documentId, emailType, toEmail, toName, subject, htmlBody, attachments } = options;

  let emailLogId: string | null = null;
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_FROM_EMAIL || "noreply@fairsign.io";
  const fromName = process.env.SMTP_FROM_NAME || "FairSign.io";

  try {
    const emailLog = await storage.createEmailLog({
      documentId: documentId || null,
      emailType,
      toEmail,
      toName: toName || null,
      subject,
      htmlBody,
      status: "pending",
      errorMessage: null,
      sentAt: null,
    });
    emailLogId = emailLog.id;

    // Try Resend first
    const resend = getResendClient();
    if (resend) {
      try {
        const resendOptions: any = {
          from: `${fromName} <${fromEmail}>`,
          to: [toEmail],
          subject,
          html: htmlBody,
        };

        if (attachments && attachments.length > 0) {
          resendOptions.attachments = attachments.map(att => ({
            filename: att.filename,
            content: att.content,
          }));
        }

        const { data, error } = await resend.emails.send(resendOptions);

        if (error) {
          console.error("[EMAIL] Resend error:", error);
          await storage.updateEmailLog(emailLog.id, {
            status: "failed",
            errorMessage: `Resend error: ${error.message}`,
          });

          return {
            success: false,
            emailLogId: emailLog.id,
            error: error.message,
          };
        }

        await storage.updateEmailLog(emailLog.id, {
          status: "sent",
          sentAt: new Date(),
        });

        console.log(`[EMAIL] Sent to ${toEmail} via Resend (ID: ${data?.id})`);

        return {
          success: true,
          emailLogId: emailLog.id,
        };
      } catch (resendError) {
        const err = resendError instanceof Error ? resendError.message : "Resend send failed";
        console.error("[EMAIL] Resend exception:", err);
        
        await storage.updateEmailLog(emailLog.id, {
          status: "failed",
          errorMessage: err,
        });

        return {
          success: false,
          emailLogId: emailLog.id,
          error: err,
        };
      }
    }

    // Fall back to SMTP
    const smtpConfig = getSmtpTransporter();

    if (smtpConfig) {
      const { transporter, fromEmail: smtpFromEmail, fromName: smtpFromName } = smtpConfig;

      try {
        await transporter.verify();
      } catch (verifyError) {
        const verifyErr = verifyError instanceof Error ? verifyError.message : "SMTP verification failed";
        console.error("[EMAIL] SMTP verification failed:", verifyErr);
        
        await storage.updateEmailLog(emailLog.id, {
          status: "failed",
          errorMessage: `SMTP verification failed: ${verifyErr}`,
        });

        return {
          success: false,
          emailLogId: emailLog.id,
          error: verifyErr,
        };
      }

      const mailOptions: nodemailer.SendMailOptions = {
        from: `"${smtpFromName}" <${smtpFromEmail}>`,
        to: toName ? `"${toName}" <${toEmail}>` : toEmail,
        subject,
        html: htmlBody,
      };

      if (attachments && attachments.length > 0) {
        mailOptions.attachments = attachments.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        }));
      }

      await transporter.sendMail(mailOptions);

      await storage.updateEmailLog(emailLog.id, {
        status: "sent",
        sentAt: new Date(),
      });

      console.log(`[EMAIL] Sent to ${toEmail} via SMTP`);

      return {
        success: true,
        emailLogId: emailLog.id,
      };
    } else {
      // Dev mode - log only
      await storage.updateEmailLog(emailLog.id, {
        status: "logged",
      });

      console.log(`[EMAIL SERVICE - DEV MODE] No email provider configured`);
      console.log(`To: ${toName ? `${toName} <${toEmail}>` : toEmail}`);
      console.log(`Subject: ${subject}`);
      console.log(`Type: ${emailType}`);
      console.log(`Document ID: ${documentId || "N/A"}`);
      console.log(`---`);
      console.log(htmlBody.substring(0, 500) + (htmlBody.length > 500 ? "..." : ""));
      console.log(`---`);

      return {
        success: true,
        emailLogId: emailLog.id,
      };
    }
  } catch (error) {
    console.error("Failed to send email:", error);
    const err = error instanceof Error ? error.message : "Unknown error";

    if (emailLogId) {
      try {
        await storage.updateEmailLog(emailLogId, {
          status: "failed",
          errorMessage: err,
        });
      } catch (updateError) {
        console.error("Failed to update email log:", updateError);
      }
    }

    return {
      success: false,
      emailLogId: emailLogId || "",
      error: err,
    };
  }
}

export async function sendSignatureRequestEmail(
  document: Document,
  signerEmail: string,
  signerName?: string
): Promise<EmailResult> {
  const signingUrl = getSigningUrl(document.id, document.signingToken);
  const documentData = document.dataJson as Record<string, any>;
  
  const subject = `Please sign: ${documentData.propertyAddress || "Lease Agreement"}`;
  
  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Roboto', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1976d2; color: white; padding: 20px; text-align: center; border-radius: 4px 4px 0 0; }
    .content { background: #ffffff; padding: 20px; border-radius: 0 0 4px 4px; }
    .button { display: inline-block; background: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Document Ready for Signature</h1>
    </div>
    <div class="content">
      <p>Hello${signerName ? ` ${signerName}` : ""},</p>
      <p>You have a document waiting for your signature.</p>
      ${documentData.propertyAddress ? `<p><strong>Property:</strong> ${documentData.propertyAddress}</p>` : ""}
      <p>Please click the button below to review and sign the document:</p>
      <a href="${signingUrl}" class="button">Review &amp; Sign Document</a>
      <p>If you have any questions about this document, please contact the sender or email <a href="mailto:support@fairsign.io">support@fairsign.io</a>.</p>
      <div class="footer">
        <p>This is an automated message. Please do not reply to this email.</p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all;">${signingUrl}</p>
        <p style="font-size: 11px; color: #868e96; margin-top: 16px;">&copy; ${new Date().getFullYear()} FairSign.io. All Rights Reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({
    documentId: document.id,
    emailType: "signature_request",
    toEmail: signerEmail,
    toName: signerName,
    subject,
    htmlBody,
  });
}

export async function sendCompletionNoticeEmail(
  document: Document,
  recipientEmail: string,
  recipientName?: string,
  isOwner: boolean = false
): Promise<EmailResult> {
  const documentData = document.dataJson as Record<string, any>;
  
  const subject = `Document Signed: ${documentData.propertyAddress || "Lease Agreement"}`;
  
  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Roboto', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4caf50; color: white; padding: 20px; text-align: center; border-radius: 4px 4px 0 0; }
    .content { background: #ffffff; padding: 20px; border-radius: 0 0 4px 4px; }
    .button { display: inline-block; background: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; }
    .success-icon { font-size: 48px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="success-icon">&#10003;</div>
      <h1>Document Completed</h1>
    </div>
    <div class="content">
      <p>Hello${recipientName ? ` ${recipientName}` : ""},</p>
      <p>The document has been successfully signed and completed.</p>
      ${documentData.propertyAddress ? `<p><strong>Property:</strong> ${documentData.propertyAddress}</p>` : ""}
      ${isOwner ? `
      <p>You can view the signed document in your dashboard.</p>
      <a href="/dashboard" class="button">View in Dashboard</a>
      ` : `
      <p>A copy of the signed document will be provided to you by your property manager.</p>
      `}
      <p>If you have any questions about this document, please contact the sender or email <a href="mailto:support@fairsign.io">support@fairsign.io</a>.</p>
      <div class="footer">
        <p>This is an automated message. Please do not reply to this email.</p>
        <p style="font-size: 11px; color: #868e96; margin-top: 16px;">&copy; ${new Date().getFullYear()} FairSign.io. All Rights Reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({
    documentId: document.id,
    emailType: "completion_notice",
    toEmail: recipientEmail,
    toName: recipientName,
    subject,
    htmlBody,
  });
}

// HTML for verified sender badge used in emails
function getVerifiedSenderBadgeHtml(): string {
  return `
    <div style="display: inline-flex; align-items: center; gap: 6px; background-color: #e8f5e9; border: 1px solid #4caf50; border-radius: 16px; padding: 6px 12px; margin: 8px 0;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M9 12l2 2 4-4"/>
      </svg>
      <span style="font-size: 13px; font-weight: 600; color: #2e7d32;">Verified Sender</span>
    </div>
  `;
}

export async function sendSignatureRequestEmailWithUrl(
  documentId: string,
  signerEmail: string,
  signerName: string,
  signingUrl: string,
  documentTitle?: string,
  senderVerified: boolean = false,
  senderName?: string
): Promise<EmailResult> {
  const subject = `Action Required: ${signerName}, please sign "${documentTitle || "Document"}"`;
  const currentYear = new Date().getFullYear();
  const verifiedBadge = senderVerified ? getVerifiedSenderBadgeHtml() : "";
  const senderText = senderName ? `<strong>${senderName}</strong> has sent you a document for signature.` : "You have been requested to sign a document.";
  
  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document Signature Request</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #ffffff;
      padding: 40px 20px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
    .header {
      background-color: #ffffff;
      padding: 32px 40px;
      text-align: center;
      border-bottom: 1px solid #e9ecef;
    }
    .logo {
      max-width: 160px;
      height: auto;
    }
    .content {
      padding: 40px;
    }
    .greeting {
      font-size: 22px;
      font-weight: 600;
      color: #1a1a1a;
      margin: 0 0 24px 0;
    }
    .message {
      font-size: 16px;
      color: #4a4a4a;
      margin: 0 0 16px 0;
    }
    .document-info {
      background-color: #f8f9fa;
      border-left: 4px solid #000000;
      padding: 16px 20px;
      margin: 24px 0;
    }
    .document-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6c757d;
      margin: 0 0 4px 0;
    }
    .document-title {
      font-size: 16px;
      font-weight: 600;
      color: #1a1a1a;
      margin: 0;
    }
    .button-container {
      text-align: center;
      margin: 32px 0;
    }
    .button {
      display: inline-block;
      background-color: #000000;
      color: #ffffff !important;
      text-decoration: none;
      padding: 16px 48px;
      font-size: 16px;
      font-weight: 600;
      border-radius: 6px;
      transition: background-color 0.2s ease;
    }
    .button:hover {
      background-color: #333333;
    }
    .security-notice {
      background-color: #f8f9fa;
      border-radius: 6px;
      padding: 16px 20px;
      margin: 24px 0;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .security-icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
    }
    .security-text {
      font-size: 14px;
      color: #6c757d;
      margin: 0;
    }
    .help-text {
      font-size: 14px;
      color: #6c757d;
      margin: 24px 0 0 0;
    }
    .link-fallback {
      font-size: 13px;
      color: #6c757d;
      margin: 24px 0 0 0;
      padding-top: 24px;
      border-top: 1px solid #e9ecef;
    }
    .link-fallback a {
      color: #0066cc;
      word-break: break-all;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 24px 40px;
      text-align: center;
      border-top: 1px solid #e9ecef;
    }
    .footer-text {
      font-size: 12px;
      color: #6c757d;
      margin: 0 0 8px 0;
    }
    .footer-legal {
      font-size: 11px;
      color: #868e96;
      margin: 16px 0 0 0;
      line-height: 1.5;
    }
    @media only screen and (max-width: 600px) {
      .wrapper {
        padding: 20px 10px;
      }
      .header {
        padding: 24px 20px;
      }
      .content {
        padding: 24px 20px;
      }
      .footer {
        padding: 20px;
      }
      .greeting {
        font-size: 20px;
      }
      .button {
        padding: 14px 32px;
        font-size: 15px;
      }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div style="background-color: #ffffff; display: inline-block; padding: 8px; border-radius: 4px;">
          ${FAIRSIGN_LOGO_HTML}
        </div>
      </div>
      <div class="content">
        <h1 class="greeting">Hello ${signerName},</h1>
        ${verifiedBadge}
        <p class="message">${senderText} Please review and sign at your earliest convenience.</p>
        
        ${documentTitle ? `
        <div class="document-info">
          <p class="document-label">Document</p>
          <p class="document-title">${documentTitle}</p>
        </div>
        ` : ""}
        
        <div class="button-container">
          <a href="${signingUrl}" class="button">Review &amp; Sign Document</a>
        </div>
        
        <div class="security-notice">
          <svg class="security-icon" viewBox="0 0 24 24" fill="none" stroke="#6c757d" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <p class="security-text">This document is secured with encryption and your signature will be legally binding. All signing activity is recorded for audit purposes.${senderVerified ? " Senders with a verified sender badge have had their identity confirmed by a third-party service." : ""}</p>
        </div>
        
        <p class="help-text">If you have any questions about this document, please contact the sender or email <a href="mailto:support@fairsign.io">support@fairsign.io</a>.</p>
        
        <div class="link-fallback">
          <p>Having trouble with the button? Copy and paste this link into your browser:</p>
          <p><a href="${signingUrl}">${signingUrl}</a></p>
        </div>
      </div>
      <div class="footer">
        <p class="footer-text">This is an automated message from FairSign.io. Please do not reply to this email.</p>
        <div style="background-color: #f0f7ff; border-radius: 6px; padding: 16px; margin: 16px 0; text-align: left;">
          <p style="font-size: 13px; color: #1a1a1a; margin: 0 0 8px 0; font-weight: 600;">Need an e-signature solution?</p>
          <p style="font-size: 12px; color: #4a4a4a; margin: 0 0 12px 0; line-height: 1.5;">We're up to 80% cheaper than the competition. Sign up free today at <a href="https://fairsign.io" style="color: #0066cc; text-decoration: none; font-weight: 500;">fairsign.io</a> and send 5 documents per month for free. No credit card, no watermarks.</p>
        </div>
        <p class="footer-legal">&copy; ${currentYear} FairSign.io. All Rights Reserved.<br>Unauthorised use is prohibited by law.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({
    documentId,
    emailType: "signature_request",
    toEmail: signerEmail,
    toName: signerName,
    subject,
    htmlBody,
  });
}

export async function sendReminderEmail(
  document: Document,
  signerEmail: string,
  signerName?: string
): Promise<EmailResult> {
  const signingUrl = getSigningUrl(document.id, document.signingToken);
  const documentData = document.dataJson as Record<string, any>;
  const documentTitle = documentData.title || documentData.propertyAddress || "Document";
  const currentYear = new Date().getFullYear();
  
  const subject = `Reminder: Please sign "${documentTitle}"`;
  
  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document Signature Reminder</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #ffffff;
      padding: 40px 20px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
    .header {
      background-color: #ffffff;
      padding: 32px 40px;
      text-align: center;
      border-bottom: 1px solid #e9ecef;
    }
    .content {
      padding: 40px;
    }
    .reminder-badge {
      display: inline-block;
      background-color: #fff3cd;
      color: #856404;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 24px;
    }
    .greeting {
      font-size: 22px;
      font-weight: 600;
      color: #1a1a1a;
      margin: 0 0 24px 0;
    }
    .message {
      font-size: 16px;
      color: #4a4a4a;
      margin: 0 0 16px 0;
    }
    .document-info {
      background-color: #f8f9fa;
      border-left: 4px solid #f59e0b;
      padding: 16px 20px;
      margin: 24px 0;
    }
    .document-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6c757d;
      margin: 0 0 4px 0;
    }
    .document-title {
      font-size: 16px;
      font-weight: 600;
      color: #1a1a1a;
      margin: 0;
    }
    .button-container {
      text-align: center;
      margin: 32px 0;
    }
    .button {
      display: inline-block;
      background-color: #000000;
      color: #ffffff !important;
      text-decoration: none;
      padding: 16px 48px;
      font-size: 16px;
      font-weight: 600;
      border-radius: 6px;
    }
    .help-text {
      font-size: 14px;
      color: #6c757d;
      margin: 24px 0 0 0;
    }
    .link-fallback {
      font-size: 13px;
      color: #6c757d;
      margin: 24px 0 0 0;
      padding-top: 24px;
      border-top: 1px solid #e9ecef;
    }
    .link-fallback a {
      color: #0066cc;
      word-break: break-all;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 24px 40px;
      text-align: center;
      border-top: 1px solid #e9ecef;
    }
    .footer-text {
      font-size: 12px;
      color: #6c757d;
      margin: 0 0 8px 0;
    }
    .footer-legal {
      font-size: 11px;
      color: #868e96;
      margin: 16px 0 0 0;
      line-height: 1.5;
    }
    @media only screen and (max-width: 600px) {
      .wrapper { padding: 20px 10px; }
      .header { padding: 24px 20px; }
      .content { padding: 24px 20px; }
      .footer { padding: 20px; }
      .greeting { font-size: 20px; }
      .button { padding: 14px 32px; font-size: 15px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div style="background-color: #ffffff; display: inline-block; padding: 8px; border-radius: 4px;">
          ${FAIRSIGN_LOGO_HTML}
        </div>
      </div>
      <div class="content">
        <div class="reminder-badge">Reminder</div>
        <h1 class="greeting">Hello ${signerName || "there"},</h1>
        <p class="message">This is a friendly reminder that you have a document waiting for your signature.</p>
        
        <div class="document-info">
          <p class="document-label">Document</p>
          <p class="document-title">${documentTitle}</p>
        </div>
        
        <div class="button-container">
          <a href="${signingUrl}" class="button">Review &amp; Sign Document</a>
        </div>
        
        <p class="help-text">If you have already signed this document, please disregard this message. For questions, contact <a href="mailto:support@fairsign.io">support@fairsign.io</a>.</p>
        
        <div class="link-fallback">
          <p>Having trouble with the button? Copy and paste this link into your browser:</p>
          <p><a href="${signingUrl}">${signingUrl}</a></p>
        </div>
      </div>
      <div class="footer">
        <p class="footer-text">This is an automated message from FairSign.io. Please do not reply to this email.</p>
        <p class="footer-legal">&copy; ${currentYear} FairSign.io. All Rights Reserved.<br>Unauthorised use is prohibited by law.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({
    documentId: document.id,
    emailType: "reminder",
    toEmail: signerEmail,
    toName: signerName,
    subject,
    htmlBody,
  });
}

function getSigningUrl(documentId: string, signingToken: string): string {
  // Use deployment URL if available (production), otherwise dev domain (development), otherwise localhost
  const baseUrl = process.env.REPLIT_DEPLOYMENT_URL 
    ? `https://${process.env.REPLIT_DEPLOYMENT_URL}`
    : process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "http://localhost:5000";
  // The signing page route is /d/:id?token=xxx
  return `${baseUrl}/d/${documentId}?token=${signingToken}`;
}

export async function getEmailLogsForDocument(documentId: string): Promise<EmailLog[]> {
  return storage.getEmailLogs(documentId);
}

export async function sendCompletionEmailWithAttachment(
  documentId: string,
  recipientEmail: string,
  recipientName: string,
  documentTitle: string,
  signedPdfBuffer: Buffer,
  senderVerified: boolean = false
): Promise<EmailResult> {
  const subject = `Completed: "${documentTitle}" has been signed`;
  const currentYear = new Date().getFullYear();
  const safeFilename = documentTitle.replace(/[^a-zA-Z0-9-_\s]/g, '').trim() || 'Document';
  const verifiedBadge = senderVerified ? getVerifiedSenderBadgeHtml() : "";
  
  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document Completed</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #ffffff;
      padding: 40px 20px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
    .header {
      background-color: #ffffff;
      padding: 32px 40px;
      text-align: center;
      border-bottom: 1px solid #e9ecef;
    }
    .content {
      padding: 40px;
    }
    .success-badge {
      display: inline-block;
      background-color: #d4edda;
      color: #155724;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 24px;
    }
    .greeting {
      font-size: 22px;
      font-weight: 600;
      color: #1a1a1a;
      margin: 0 0 24px 0;
    }
    .message {
      font-size: 16px;
      color: #4a4a4a;
      margin: 0 0 16px 0;
    }
    .document-info {
      background-color: #f8f9fa;
      border-left: 4px solid #28a745;
      padding: 16px 20px;
      margin: 24px 0;
    }
    .document-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6c757d;
      margin: 0 0 4px 0;
    }
    .document-title {
      font-size: 16px;
      font-weight: 600;
      color: #1a1a1a;
      margin: 0;
    }
    .attachment-notice {
      background-color: #e7f3ff;
      border-radius: 6px;
      padding: 16px 20px;
      margin: 24px 0;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .attachment-icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
    }
    .attachment-text {
      font-size: 14px;
      color: #004085;
      margin: 0;
    }
    .help-text {
      font-size: 14px;
      color: #6c757d;
      margin: 24px 0 0 0;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 24px 40px;
      text-align: center;
      border-top: 1px solid #e9ecef;
    }
    .footer-text {
      font-size: 12px;
      color: #6c757d;
      margin: 0 0 8px 0;
    }
    .footer-legal {
      font-size: 11px;
      color: #868e96;
      margin: 16px 0 0 0;
      line-height: 1.5;
    }
    @media only screen and (max-width: 600px) {
      .wrapper {
        padding: 20px 10px;
      }
      .header {
        padding: 24px 20px;
      }
      .content {
        padding: 24px 20px;
      }
      .footer {
        padding: 20px;
      }
      .greeting {
        font-size: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div style="background-color: #ffffff; display: inline-block; padding: 8px; border-radius: 4px;">
          ${FAIRSIGN_LOGO_HTML}
        </div>
      </div>
      <div class="content">
        <div class="success-badge">Document Completed</div>
        <h1 class="greeting">Hello ${recipientName},</h1>
        ${verifiedBadge}
        <p class="message">Great news! The document has been successfully signed by all parties and is now complete.</p>
        
        <div class="document-info">
          <p class="document-label">Document</p>
          <p class="document-title">${documentTitle}</p>
        </div>
        
        <div class="attachment-notice">
          <svg class="attachment-icon" viewBox="0 0 24 24" fill="none" stroke="#004085" stroke-width="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
          <p class="attachment-text">A copy of the signed document is attached to this email for your records. Please save it in a secure location.</p>
        </div>
        
        <p class="help-text">If you have any questions about this document, please contact the sender or email <a href="mailto:support@fairsign.io">support@fairsign.io</a>.</p>
      </div>
      <div class="footer">
        <p class="footer-text">This is an automated message from FairSign.io. Please do not reply to this email.</p>
        <p class="footer-legal">&copy; ${currentYear} FairSign.io. All Rights Reserved.<br>Unauthorised use is prohibited by law.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({
    documentId,
    emailType: "completion_notice",
    toEmail: recipientEmail,
    toName: recipientName,
    subject,
    htmlBody,
    attachments: [
      {
        filename: `${safeFilename}-signed.pdf`,
        content: signedPdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

export async function sendEmailVerification(
  email: string,
  verificationToken: string
): Promise<EmailResult> {
  const baseUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "http://localhost:5000";
  const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
  const currentYear = new Date().getFullYear();

  const subject = "Verify your FairSign.io account";

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #ffffff;
      padding: 40px 20px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
    .header {
      background-color: #ffffff;
      padding: 32px 40px;
      text-align: center;
      border-bottom: 1px solid #e9ecef;
    }
    .content {
      padding: 40px;
    }
    .greeting {
      font-size: 22px;
      font-weight: 600;
      color: #1a1a1a;
      margin: 0 0 24px 0;
    }
    .message {
      font-size: 16px;
      color: #4a4a4a;
      margin: 0 0 16px 0;
    }
    .button-container {
      text-align: center;
      margin: 32px 0;
    }
    .button {
      display: inline-block;
      background-color: #000000;
      color: #ffffff !important;
      text-decoration: none;
      padding: 16px 48px;
      font-size: 16px;
      font-weight: 600;
      border-radius: 6px;
    }
    .expiry-notice {
      background-color: #fff3cd;
      border-radius: 6px;
      padding: 12px 16px;
      margin: 24px 0;
      font-size: 14px;
      color: #856404;
    }
    .link-fallback {
      font-size: 13px;
      color: #6c757d;
      margin: 24px 0 0 0;
      padding-top: 24px;
      border-top: 1px solid #e9ecef;
    }
    .link-fallback a {
      color: #0066cc;
      word-break: break-all;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 24px 40px;
      text-align: center;
      border-top: 1px solid #e9ecef;
    }
    .footer-text {
      font-size: 12px;
      color: #6c757d;
      margin: 0 0 8px 0;
    }
    .footer-legal {
      font-size: 11px;
      color: #868e96;
      margin: 16px 0 0 0;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1 style="margin: 0; font-size: 24px; color: #1a1a1a;">FairSign.io</h1>
      </div>
      <div class="content">
        <h1 class="greeting">Welcome to FairSign.io!</h1>
        <p class="message">Thank you for signing up. Please verify your email address to complete your account setup and start signing documents.</p>
        
        <div class="button-container">
          <a href="${verificationUrl}" class="button">Verify Email Address</a>
        </div>
        
        <div class="expiry-notice">
          This verification link will expire in 24 hours. If you didn't create an account with FairSign.io, you can safely ignore this email.
        </div>
        
        <div class="link-fallback">
          <p>Having trouble with the button? Copy and paste this link into your browser:</p>
          <p><a href="${verificationUrl}">${verificationUrl}</a></p>
        </div>
      </div>
      <div class="footer">
        <p class="footer-text">This is an automated message from FairSign.io. Please do not reply to this email.</p>
        <p class="footer-legal">&copy; ${currentYear} FairSign.io. All Rights Reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({
    emailType: "email_verification",
    toEmail: email,
    subject,
    htmlBody,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  resetToken: string
): Promise<EmailResult> {
  const baseUrl = process.env.APP_URL 
    || (process.env.REPLIT_DEPLOYMENT_URL ? `https://${process.env.REPLIT_DEPLOYMENT_URL}` : null)
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
    || "http://localhost:5000";
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
  const currentYear = new Date().getFullYear();

  const subject = "Reset your FairSign.io password";

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #ffffff;
      padding: 40px 20px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
    .header {
      background-color: #ffffff;
      padding: 32px 40px;
      text-align: center;
      border-bottom: 1px solid #e9ecef;
    }
    .content {
      padding: 40px;
    }
    .greeting {
      font-size: 22px;
      font-weight: 600;
      color: #1a1a1a;
      margin: 0 0 24px 0;
    }
    .message {
      font-size: 16px;
      color: #4a4a4a;
      margin: 0 0 16px 0;
    }
    .button-container {
      text-align: center;
      margin: 32px 0;
    }
    .button {
      display: inline-block;
      background-color: #000000;
      color: #ffffff !important;
      text-decoration: none;
      padding: 16px 48px;
      font-size: 16px;
      font-weight: 600;
      border-radius: 6px;
    }
    .expiry-notice {
      background-color: #fff3cd;
      border-radius: 6px;
      padding: 12px 16px;
      margin: 24px 0;
      font-size: 14px;
      color: #856404;
    }
    .link-fallback {
      font-size: 13px;
      color: #6c757d;
      margin: 24px 0 0 0;
      padding-top: 24px;
      border-top: 1px solid #e9ecef;
    }
    .link-fallback a {
      color: #0066cc;
      word-break: break-all;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 24px 40px;
      text-align: center;
      border-top: 1px solid #e9ecef;
    }
    .footer-text {
      font-size: 12px;
      color: #6c757d;
      margin: 0 0 8px 0;
    }
    .footer-legal {
      font-size: 11px;
      color: #868e96;
      margin: 16px 0 0 0;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1 style="margin: 0; font-size: 24px; color: #1a1a1a;">FairSign.io</h1>
      </div>
      <div class="content">
        <h1 class="greeting">Reset Your Password</h1>
        <p class="message">We received a request to reset the password for your FairSign.io account. Click the button below to choose a new password.</p>
        
        <div class="button-container">
          <a href="${resetUrl}" class="button">Reset Password</a>
        </div>
        
        <div class="expiry-notice">
          This password reset link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email and your password will remain unchanged.
        </div>
        
        <div class="link-fallback">
          <p>Having trouble with the button? Copy and paste this link into your browser:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
        </div>
      </div>
      <div class="footer">
        <p class="footer-text">This is an automated message from FairSign.io. Please do not reply to this email.</p>
        <p class="footer-legal">&copy; ${currentYear} FairSign.io. All Rights Reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({
    emailType: "email_verification",
    toEmail: email,
    subject,
    htmlBody,
  });
}

/**
 * Sends account deletion confirmation email
 */
export async function sendAccountDeletionEmail(
  email: string,
  firstName: string,
  scheduledDeletionDate: Date,
  subscriptionEndDate: Date | null
): Promise<EmailResult> {
  const currentYear = new Date().getFullYear();
  const formattedDeletionDate = scheduledDeletionDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  
  const subscriptionInfo = subscriptionEndDate 
    ? `<p class="message">Since you have an active subscription, your account will remain active until <strong>${subscriptionEndDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</strong>. After that date, your 30-day recovery period will begin.</p>`
    : "";

  const subject = "Your FairSign.io Account Deletion Request";

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Deletion Request</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #ffffff;
      padding: 40px 20px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
    .header {
      background-color: #ffffff;
      padding: 32px 40px;
      text-align: center;
      border-bottom: 1px solid #e9ecef;
    }
    .content {
      padding: 40px;
    }
    .deletion-badge {
      display: inline-block;
      background-color: #fee2e2;
      color: #991b1b;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 24px;
    }
    .greeting {
      font-size: 22px;
      font-weight: 600;
      color: #1a1a1a;
      margin: 0 0 24px 0;
    }
    .message {
      font-size: 16px;
      color: #4a4a4a;
      margin: 0 0 16px 0;
    }
    .warning-box {
      background-color: #fef3cd;
      border-left: 4px solid #f59e0b;
      padding: 16px 20px;
      margin: 24px 0;
    }
    .warning-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #92400e;
      margin: 0 0 4px 0;
    }
    .warning-date {
      font-size: 18px;
      font-weight: 600;
      color: #92400e;
      margin: 0;
    }
    .info-box {
      background-color: #f0f9ff;
      border-radius: 6px;
      padding: 16px 20px;
      margin: 24px 0;
    }
    .info-title {
      font-size: 14px;
      font-weight: 600;
      color: #0369a1;
      margin: 0 0 8px 0;
    }
    .info-text {
      font-size: 14px;
      color: #0c4a6e;
      margin: 0;
    }
    .info-text a {
      color: #0369a1;
    }
    .help-text {
      font-size: 14px;
      color: #6c757d;
      margin: 24px 0 0 0;
    }
    .help-text a {
      color: #0066cc;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 24px 40px;
      text-align: center;
      border-top: 1px solid #e9ecef;
    }
    .footer-text {
      font-size: 12px;
      color: #6c757d;
      margin: 0 0 8px 0;
    }
    .footer-legal {
      font-size: 11px;
      color: #868e96;
      margin: 16px 0 0 0;
      line-height: 1.5;
    }
    @media only screen and (max-width: 600px) {
      .wrapper { padding: 20px 10px; }
      .header { padding: 24px 20px; }
      .content { padding: 24px 20px; }
      .footer { padding: 20px; }
      .greeting { font-size: 20px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div style="background-color: #ffffff; display: inline-block; padding: 8px; border-radius: 4px;">
          ${FAIRSIGN_LOGO_HTML}
        </div>
      </div>
      <div class="content">
        <div class="deletion-badge">Account Deletion Requested</div>
        <h1 class="greeting">Hello ${firstName},</h1>
        <p class="message">We've received your request to delete your FairSign.io account. We're sorry to see you go.</p>
        
        ${subscriptionInfo}
        
        <div class="warning-box">
          <p class="warning-label">Scheduled deletion date</p>
          <p class="warning-date">${formattedDeletionDate}</p>
        </div>
        
        <div class="info-box">
          <p class="info-title">Want to restore your account?</p>
          <p class="info-text">You can reactivate your account and restore access to all your documents within the 30-day recovery period by contacting us at <a href="mailto:support@fairsign.io">support@fairsign.io</a></p>
        </div>
        
        <p class="message">After the scheduled deletion date, your account and all associated documents will be permanently removed and cannot be recovered.</p>
        
        <p class="help-text">If you didn't request this deletion, please contact us immediately at <a href="mailto:support@fairsign.io">support@fairsign.io</a>.</p>
      </div>
      <div class="footer">
        <p class="footer-text">This is an automated message from FairSign.io. Please do not reply to this email.</p>
        <p class="footer-legal">&copy; ${currentYear} FairSign.io. All Rights Reserved.<br>Unauthorised use is prohibited by law.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({
    emailType: "account_deletion",
    toEmail: email,
    subject,
    htmlBody,
  });
}

export async function sendTeamInvitationEmail(
  inviteeEmail: string,
  inviterName: string,
  organizationName: string,
  inviteToken: string
): Promise<EmailResult> {
  const appUrl = process.env.APP_URL || process.env.REPL_URL || "https://fairsign.io";
  const inviteUrl = `${appUrl}/team-invite?token=${inviteToken}`;
  const currentYear = new Date().getFullYear();

  const subject = `${inviterName} invited you to join their team on FairSign.io`;
  
  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team Invitation</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #ffffff;
      padding: 40px 20px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
    .header {
      background-color: #ffffff;
      padding: 32px 40px;
      text-align: center;
      border-bottom: 1px solid #e9ecef;
    }
    .content {
      padding: 40px;
    }
    .team-badge {
      display: inline-block;
      background-color: #e0e7ff;
      color: #3730a3;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 24px;
    }
    .greeting {
      font-size: 22px;
      font-weight: 600;
      color: #1a1a1a;
      margin: 0 0 24px 0;
    }
    .message {
      font-size: 16px;
      color: #4a4a4a;
      margin: 0 0 16px 0;
    }
    .team-info {
      background-color: #f8f9fa;
      border-left: 4px solid #6366f1;
      padding: 16px 20px;
      margin: 24px 0;
    }
    .team-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6c757d;
      margin: 0 0 4px 0;
    }
    .team-name {
      font-size: 16px;
      font-weight: 600;
      color: #1a1a1a;
      margin: 0;
    }
    .button-container {
      text-align: center;
      margin: 32px 0;
    }
    .button {
      display: inline-block;
      background-color: #000000;
      color: #ffffff !important;
      text-decoration: none;
      padding: 16px 48px;
      font-size: 16px;
      font-weight: 600;
      border-radius: 6px;
    }
    .info-box {
      background-color: #f0f9ff;
      border-radius: 6px;
      padding: 16px 20px;
      margin: 24px 0;
    }
    .info-title {
      font-size: 14px;
      font-weight: 600;
      color: #0369a1;
      margin: 0 0 8px 0;
    }
    .info-text {
      font-size: 14px;
      color: #0c4a6e;
      margin: 0;
    }
    .help-text {
      font-size: 14px;
      color: #6c757d;
      margin: 24px 0 0 0;
    }
    .link-fallback {
      font-size: 13px;
      color: #6c757d;
      margin: 24px 0 0 0;
      padding-top: 24px;
      border-top: 1px solid #e9ecef;
    }
    .link-fallback a {
      color: #0066cc;
      word-break: break-all;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 24px 40px;
      text-align: center;
      border-top: 1px solid #e9ecef;
    }
    .footer-text {
      font-size: 12px;
      color: #6c757d;
      margin: 0 0 8px 0;
    }
    .footer-legal {
      font-size: 11px;
      color: #868e96;
      margin: 16px 0 0 0;
      line-height: 1.5;
    }
    @media only screen and (max-width: 600px) {
      .wrapper { padding: 20px 10px; }
      .header { padding: 24px 20px; }
      .content { padding: 24px 20px; }
      .footer { padding: 20px; }
      .greeting { font-size: 20px; }
      .button { padding: 14px 32px; font-size: 15px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div style="background-color: #ffffff; display: inline-block; padding: 8px; border-radius: 4px;">
          ${FAIRSIGN_LOGO_HTML}
        </div>
      </div>
      <div class="content">
        <div class="team-badge">Team Invitation</div>
        <h1 class="greeting">You've been invited!</h1>
        <p class="message"><strong>${inviterName}</strong> has invited you to join their team on FairSign.io.</p>
        
        <div class="team-info">
          <p class="team-label">Team</p>
          <p class="team-name">${organizationName}</p>
        </div>
        
        <div class="info-box">
          <p class="info-title">What does joining a team mean?</p>
          <p class="info-text">As a team member, you'll have access to a shared document workspace. You can create, view, and manage documents alongside your team members.</p>
        </div>
        
        <div class="button-container">
          <a href="${inviteUrl}" class="button">Join Team</a>
        </div>
        
        <p class="help-text">This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.</p>
        
        <div class="link-fallback">
          <p>Having trouble with the button? Copy and paste this link into your browser:</p>
          <p><a href="${inviteUrl}">${inviteUrl}</a></p>
        </div>
      </div>
      <div class="footer">
        <p class="footer-text">This is an automated message from FairSign.io. Please do not reply to this email.</p>
        <p class="footer-legal">&copy; ${currentYear} FairSign.io. All Rights Reserved.<br>Unauthorised use is prohibited by law.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({
    emailType: "team_invitation",
    toEmail: inviteeEmail,
    subject,
    htmlBody,
  });
}
