import { storage } from "../storage";
import type { Request } from "express";

export type AuditEventType =
  | "document_created"
  | "document_viewed"
  | "signature_uploaded"
  | "consent_given"
  | "completed"
  | "email_sent"
  | "reminder_sent"
  | "completion_email_sent"
  | "embedded_link_requested"
  | "webhook_sent"
  | "internal_download"
  | "signer_added"
  | "text_field_submitted"
  | "signer_completed"
  | "signer_webhook_sent"
  | "next_signer_notified";

export async function logAuditEvent(
  documentId: string,
  event: AuditEventType,
  req: Request,
  meta?: Record<string, unknown>
): Promise<void> {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    "unknown";

  const userAgent = req.headers["user-agent"] || "unknown";

  try {
    await storage.createAuditEvent({
      documentId,
      event,
      ip,
      userAgent,
      metaJson: meta || {},
    });

    console.log(`[Audit] ${event} for document ${documentId} from ${ip}`);
  } catch (error) {
    console.error(`Failed to log audit event:`, error);
  }
}
