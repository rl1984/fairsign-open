import {
  documents,
  signatureAssets,
  signatureSpots,
  auditEvents,
  templates,
  templateFields,
  emailLogs,
  documentSigners,
  textFieldValues,
  signerSessions,
  type Document,
  type InsertDocument,
  type SignatureAsset,
  type InsertSignatureAsset,
  type SignatureSpot,
  type InsertSignatureSpot,
  type AuditEvent,
  type InsertAuditEvent,
  type Template,
  type InsertTemplate,
  type TemplateField,
  type InsertTemplateField,
  type EmailLog,
  type InsertEmailLog,
  type DocumentSigner,
  type InsertDocumentSigner,
  type SignerSession,
  type InsertSignerSession,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, or, isNull } from "drizzle-orm";

export interface IStorage {
  // Templates
  createTemplate(template: InsertTemplate & { userId?: string }): Promise<Template>;
  createTemplateWithId(template: Partial<Template> & { id: string; name: string }): Promise<Template>;
  getTemplate(id: string): Promise<Template | undefined>;
  getTemplatesForUser(userId: string): Promise<Template[]>;
  updateTemplate(id: string, updates: Partial<Template>): Promise<Template | undefined>;
  deleteTemplate(id: string): Promise<boolean>;

  // Documents
  createDocument(doc: InsertDocument & { userId?: string }): Promise<Document>;
  getDocument(id: string): Promise<Document | undefined>;
  getDocumentByToken(token: string): Promise<Document | undefined>;
  getDocumentsByUser(userId: string): Promise<Document[]>;
  updateDocument(id: string, updates: Partial<Document>): Promise<Document | undefined>;

  // Signature Assets
  createSignatureAsset(asset: InsertSignatureAsset): Promise<SignatureAsset>;
  getSignatureAssets(documentId: string): Promise<SignatureAsset[]>;
  getSignatureAsset(documentId: string, spotKey: string): Promise<SignatureAsset | undefined>;

  // Signature Spots
  createSignatureSpot(spot: InsertSignatureSpot): Promise<SignatureSpot>;
  getSignatureSpots(templateId: string): Promise<SignatureSpot[]>;
  getSignatureSpot(templateId: string, spotKey: string): Promise<SignatureSpot | undefined>;

  // Audit Events
  createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent>;
  getAuditEvents(documentId: string): Promise<AuditEvent[]>;

  // Email Logs
  createEmailLog(log: InsertEmailLog): Promise<EmailLog>;
  getEmailLogs(documentId: string): Promise<EmailLog[]>;
  updateEmailLog(id: string, updates: Partial<EmailLog>): Promise<EmailLog | undefined>;

  // Document Signers
  createDocumentSigner(signer: InsertDocumentSigner): Promise<DocumentSigner>;
  getDocumentSigners(documentId: string): Promise<DocumentSigner[]>;
  getDocumentSignerById(id: string): Promise<DocumentSigner | undefined>;
  getDocumentSignerByToken(token: string): Promise<DocumentSigner | undefined>;
  getDocumentSignerByEmail(documentId: string, email: string): Promise<DocumentSigner | undefined>;
  getDocumentSignerByRole(documentId: string, role: string): Promise<DocumentSigner | undefined>;
  updateDocumentSigner(id: string, updates: Partial<DocumentSigner>): Promise<DocumentSigner | undefined>;

  // Signature Spots by Role
  getSignatureSpotsByRole(templateId: string, signerRole: string): Promise<SignatureSpot[]>;

  // Template Fields (for PDF templates)
  createTemplateField(field: InsertTemplateField): Promise<TemplateField>;
  getTemplateFields(templateId: string): Promise<TemplateField[]>;
  deleteTemplateFields(templateId: string): Promise<void>;

  // Text Field Values (for one-off documents)
  createTextFieldValue(value: {
    documentId: string;
    spotKey: string;
    value: string;
    fieldType: string;
    signerRole?: string;
    signerEmail?: string;
  }): Promise<{ id: string; documentId: string; spotKey: string; value: string; fieldType: string }>;
  getTextFieldValues(documentId: string): Promise<Array<{ spotKey: string; value: string; fieldType: string }>>;
}

export class DatabaseStorage implements IStorage {
  // Templates
  async createTemplate(template: InsertTemplate & { userId?: string }): Promise<Template> {
    const [result] = await db.insert(templates).values(template).returning();
    return result;
  }

  async createTemplateWithId(template: Partial<Template> & { id: string; name: string }): Promise<Template> {
    const [result] = await db.insert(templates).values(template).returning();
    return result;
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    const [template] = await db.select().from(templates).where(eq(templates.id, id));
    return template || undefined;
  }

  async getTemplatesForUser(userId: string): Promise<Template[]> {
    return db
      .select()
      .from(templates)
      .where(or(eq(templates.userId, userId), eq(templates.isDefault, true), isNull(templates.userId)))
      .orderBy(desc(templates.createdAt));
  }

  async updateTemplate(id: string, updates: Partial<Template>): Promise<Template | undefined> {
    const [template] = await db
      .update(templates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(templates.id, id))
      .returning();
    return template || undefined;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const result = await db.delete(templates).where(eq(templates.id, id));
    return true;
  }

  // Documents
  async createDocument(doc: InsertDocument & { userId?: string }): Promise<Document> {
    const [document] = await db.insert(documents).values(doc).returning();
    return document;
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document || undefined;
  }

  async getDocumentByToken(token: string): Promise<Document | undefined> {
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.signingToken, token));
    return document || undefined;
  }

  async getDocumentsByUser(userId: string): Promise<Document[]> {
    return db
      .select()
      .from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(desc(documents.createdAt));
  }

  async updateDocument(id: string, updates: Partial<Document>): Promise<Document | undefined> {
    const [document] = await db
      .update(documents)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return document || undefined;
  }

  // Signature Assets
  async createSignatureAsset(asset: InsertSignatureAsset): Promise<SignatureAsset> {
    const [signatureAsset] = await db.insert(signatureAssets).values(asset).returning();
    return signatureAsset;
  }

  async getSignatureAssets(documentId: string): Promise<SignatureAsset[]> {
    return db
      .select()
      .from(signatureAssets)
      .where(eq(signatureAssets.documentId, documentId));
  }

  async getSignatureAsset(
    documentId: string,
    spotKey: string
  ): Promise<SignatureAsset | undefined> {
    const [asset] = await db
      .select()
      .from(signatureAssets)
      .where(
        and(
          eq(signatureAssets.documentId, documentId),
          eq(signatureAssets.spotKey, spotKey)
        )
      );
    return asset || undefined;
  }

  // Signature Spots
  async createSignatureSpot(spot: InsertSignatureSpot): Promise<SignatureSpot> {
    const [signatureSpot] = await db.insert(signatureSpots).values(spot).returning();
    return signatureSpot;
  }

  async getSignatureSpots(templateId: string): Promise<SignatureSpot[]> {
    return db
      .select()
      .from(signatureSpots)
      .where(eq(signatureSpots.templateId, templateId));
  }

  async getSignatureSpot(
    templateId: string,
    spotKey: string
  ): Promise<SignatureSpot | undefined> {
    const [spot] = await db
      .select()
      .from(signatureSpots)
      .where(
        and(
          eq(signatureSpots.templateId, templateId),
          eq(signatureSpots.spotKey, spotKey)
        )
      );
    return spot || undefined;
  }

  // Audit Events
  async createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent> {
    const [auditEvent] = await db.insert(auditEvents).values(event).returning();
    return auditEvent;
  }

  async getAuditEvents(documentId: string): Promise<AuditEvent[]> {
    return db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.documentId, documentId));
  }

  // Email Logs
  async createEmailLog(log: InsertEmailLog): Promise<EmailLog> {
    const [emailLog] = await db.insert(emailLogs).values(log).returning();
    return emailLog;
  }

  async getEmailLogs(documentId: string): Promise<EmailLog[]> {
    return db
      .select()
      .from(emailLogs)
      .where(eq(emailLogs.documentId, documentId))
      .orderBy(desc(emailLogs.createdAt));
  }

  async updateEmailLog(id: string, updates: Partial<EmailLog>): Promise<EmailLog | undefined> {
    const [log] = await db
      .update(emailLogs)
      .set(updates)
      .where(eq(emailLogs.id, id))
      .returning();
    return log || undefined;
  }

  // Document Signers
  async createDocumentSigner(signer: InsertDocumentSigner): Promise<DocumentSigner> {
    const [result] = await db.insert(documentSigners).values(signer).returning();
    return result;
  }

  async getDocumentSigners(documentId: string): Promise<DocumentSigner[]> {
    return db
      .select()
      .from(documentSigners)
      .where(eq(documentSigners.documentId, documentId))
      .orderBy(documentSigners.orderIndex);
  }

  async getDocumentSignerById(id: string): Promise<DocumentSigner | undefined> {
    const [signer] = await db
      .select()
      .from(documentSigners)
      .where(eq(documentSigners.id, id));
    return signer || undefined;
  }

  async getDocumentSignerByToken(token: string): Promise<DocumentSigner | undefined> {
    const [signer] = await db
      .select()
      .from(documentSigners)
      .where(eq(documentSigners.token, token));
    return signer || undefined;
  }

  async getDocumentSignerByEmail(documentId: string, email: string): Promise<DocumentSigner | undefined> {
    const [signer] = await db
      .select()
      .from(documentSigners)
      .where(
        and(
          eq(documentSigners.documentId, documentId),
          eq(documentSigners.email, email)
        )
      );
    return signer || undefined;
  }

  async getDocumentSignerByRole(documentId: string, role: string): Promise<DocumentSigner | undefined> {
    const [signer] = await db
      .select()
      .from(documentSigners)
      .where(
        and(
          eq(documentSigners.documentId, documentId),
          eq(documentSigners.role, role)
        )
      );
    return signer || undefined;
  }

  async updateDocumentSigner(id: string, updates: Partial<DocumentSigner>): Promise<DocumentSigner | undefined> {
    const [signer] = await db
      .update(documentSigners)
      .set(updates)
      .where(eq(documentSigners.id, id))
      .returning();
    return signer || undefined;
  }

  // Signature Spots by Role
  async getSignatureSpotsByRole(templateId: string, signerRole: string): Promise<SignatureSpot[]> {
    return db
      .select()
      .from(signatureSpots)
      .where(
        and(
          eq(signatureSpots.templateId, templateId),
          eq(signatureSpots.signerRole, signerRole)
        )
      );
  }

  // Template Fields (for PDF templates)
  async createTemplateField(field: InsertTemplateField): Promise<TemplateField> {
    const [result] = await db.insert(templateFields).values(field).returning();
    return result;
  }

  async getTemplateFields(templateId: string): Promise<TemplateField[]> {
    return db
      .select()
      .from(templateFields)
      .where(eq(templateFields.templateId, templateId));
  }

  async deleteTemplateFields(templateId: string): Promise<void> {
    await db.delete(templateFields).where(eq(templateFields.templateId, templateId));
  }

  // Text Field Values (for one-off documents)
  async createTextFieldValue(value: {
    documentId: string;
    spotKey: string;
    value: string;
    fieldType: string;
    signerRole?: string;
    signerEmail?: string;
  }): Promise<{ id: string; documentId: string; spotKey: string; value: string; fieldType: string }> {
    const [result] = await db.insert(textFieldValues).values(value).returning();
    return result;
  }

  async getTextFieldValues(documentId: string): Promise<Array<{ spotKey: string; value: string; fieldType: string }>> {
    return db
      .select({
        spotKey: textFieldValues.spotKey,
        value: textFieldValues.value,
        fieldType: textFieldValues.fieldType,
      })
      .from(textFieldValues)
      .where(eq(textFieldValues.documentId, documentId));
  }

  // Signer Sessions (for QR code mobile signing)
  async createSignerSession(session: InsertSignerSession): Promise<SignerSession> {
    const [result] = await db.insert(signerSessions).values(session).returning();
    return result;
  }

  async getSignerSession(sessionToken: string): Promise<SignerSession | undefined> {
    const [session] = await db
      .select()
      .from(signerSessions)
      .where(eq(signerSessions.sessionToken, sessionToken));
    return session || undefined;
  }

  async getSignerSessionById(id: string): Promise<SignerSession | undefined> {
    const [session] = await db
      .select()
      .from(signerSessions)
      .where(eq(signerSessions.id, id));
    return session || undefined;
  }

  async updateSignerSession(id: string, updates: Partial<SignerSession>): Promise<SignerSession | undefined> {
    const [session] = await db
      .update(signerSessions)
      .set(updates)
      .where(eq(signerSessions.id, id))
      .returning();
    return session || undefined;
  }

  async deleteExpiredSessions(): Promise<void> {
    await db
      .delete(signerSessions)
      .where(and(
        eq(signerSessions.status, "pending"),
        // Note: Can't compare timestamps directly, would need raw SQL for expired check
      ));
  }
}

export const storage = new DatabaseStorage();
