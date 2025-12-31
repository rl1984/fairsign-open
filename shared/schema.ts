import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Re-export auth schema
export * from "./models/auth";

// Templates table - stores HTML and PDF document templates
export const templates = pgTable("templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"), // Owner of the template
  name: text("name").notNull(),
  description: text("description"),
  templateType: text("template_type").notNull().default("html"), // html | pdf
  htmlContent: text("html_content"), // For HTML templates
  pdfStorageKey: text("pdf_storage_key"), // For PDF templates - storage location
  pageCount: integer("page_count"), // For PDF templates
  pageDimensions: jsonb("page_dimensions").$type<{ width: number; height: number }[]>(), // Per-page dimensions
  placeholders: jsonb("placeholders").$type<string[]>(), // List of placeholder keys (derived from fields for PDF)
  isDefault: boolean("is_default").default(false), // System-provided templates
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Template fields - defines text/signature fields for PDF templates
export const templateFields = pgTable("template_fields", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => templates.id, { onDelete: "cascade" }),
  apiTag: text("api_tag").notNull(), // The tag used in API calls (e.g., "tenant_name")
  fieldType: text("field_type").notNull(), // text | signature | initial | date | checkbox
  label: text("label"), // Display label for the field
  page: integer("page").notNull(), // 1-based page number
  x: real("x").notNull(), // X coordinate in absolute PDF points (from left edge)
  y: real("y").notNull(), // Y coordinate in absolute PDF points (from top edge, top-origin)
  width: real("width").notNull(), // Width in absolute PDF points
  height: real("height").notNull(), // Height in absolute PDF points
  signerRole: text("signer_role").default("tenant"), // Which signer role this field belongs to
  required: boolean("required").default(true),
  fontSize: integer("font_size").default(12), // For text fields
  fontColor: text("font_color").default("#000000"), // For text fields
  inputMode: text("input_mode").default("any"), // For text fields: any | text | numeric
  placeholder: text("placeholder"), // Placeholder text for text/date fields
  creatorFills: boolean("creator_fills").default(false), // If true, creator fills this field at document creation time
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Documents table - stores lease document metadata
export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"), // Owner of the document (landlord/property manager)
  templateId: text("template_id"), // Nullable for one-off documents without a template
  status: text("status").notNull().default("created"), // created | sent | completed
  dataJson: jsonb("data_json").notNull(),
  callbackUrl: text("callback_url"),
  signingToken: text("signing_token").notNull().unique(),
  unsignedPdfKey: text("unsigned_pdf_key"),
  signedPdfKey: text("signed_pdf_key"),
  signedPdfSha256: text("signed_pdf_sha256"),
  archivedAt: timestamp("archived_at"), // When document was archived (null = not archived)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Signature assets - stores uploaded signature/initial images
export const signatureAssets = pgTable("signature_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id),
  spotKey: text("spot_key").notNull(),
  imageKey: text("image_key").notNull(),
  signerRole: text("signer_role"), // Role of the signer who uploaded (for multi-signer docs)
  signerEmail: text("signer_email"), // Email of the signer who uploaded
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Text field values - stores text/date/checkbox values for one-off documents
export const textFieldValues = pgTable("text_field_values", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id),
  spotKey: text("spot_key").notNull(),
  value: text("value").notNull(), // The text value entered by the signer
  fieldType: text("field_type").notNull(), // text | date | checkbox
  signerRole: text("signer_role"), // Role of the signer who entered the value
  signerEmail: text("signer_email"), // Email of the signer
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Signature spots - defines where signatures/initials go on templates
export const signatureSpots = pgTable("signature_spots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: text("template_id").notNull(),
  spotKey: text("spot_key").notNull(),
  page: integer("page").notNull(), // 1-based
  x: real("x").notNull(), // PDF points
  y: real("y").notNull(),
  w: real("w").notNull(),
  h: real("h").notNull(),
  kind: text("kind").notNull(), // signature | initial
  signerRole: text("signer_role").default("tenant"), // Which signer role this spot belongs to
});

// Audit events - tracks all actions for compliance
export const auditEvents = pgTable("audit_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id),
  event: text("event").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  metaJson: jsonb("meta_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Email logs - tracks all email notifications (development mode logs, production delivery status)
export const emailLogs = pgTable("email_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").references(() => documents.id),
  emailType: text("email_type").notNull(), // signature_request | completion_notice | reminder
  toEmail: text("to_email").notNull(),
  toName: text("to_name"),
  subject: text("subject").notNull(),
  htmlBody: text("html_body").notNull(),
  status: text("status").notNull().default("logged"), // logged | sent | failed
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Document signers - tracks individual signers for multi-signer documents
export const documentSigners = pgTable("document_signers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(), // e.g., "tenant", "tenant2", "landlord"
  token: text("token").notNull().unique(),
  tokenExpiresAt: timestamp("token_expires_at"), // Optional - defaults to 30 days if not set
  status: text("status").notNull().default("pending"), // pending | completed
  signedAt: timestamp("signed_at"),
  orderIndex: integer("order_index").default(0), // Signing order (0 = first signer, 1 = second, etc.)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Mobile signing sessions - ephemeral sessions for QR code based mobile signing
export const signerSessions = pgTable("signer_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id),
  signerId: varchar("signer_id").notNull().references(() => documentSigners.id),
  sessionToken: text("session_token").notNull().unique(), // Short-lived token for mobile
  spotKey: text("spot_key").notNull(), // The specific signature spot this session is for
  status: text("status").notNull().default("pending"), // pending | completed | expired
  expiresAt: timestamp("expires_at").notNull(), // Sessions expire quickly (e.g., 10 minutes)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Relations
export const templatesRelations = relations(templates, ({ many }) => ({
  fields: many(templateFields),
}));

export const templateFieldsRelations = relations(templateFields, ({ one }) => ({
  template: one(templates, {
    fields: [templateFields.templateId],
    references: [templates.id],
  }),
}));

export const documentsRelations = relations(documents, ({ many }) => ({
  signatureAssets: many(signatureAssets),
  auditEvents: many(auditEvents),
  emailLogs: many(emailLogs),
  signers: many(documentSigners),
}));

export const documentSignersRelations = relations(documentSigners, ({ one, many }) => ({
  document: one(documents, {
    fields: [documentSigners.documentId],
    references: [documents.id],
  }),
  sessions: many(signerSessions),
}));

export const signerSessionsRelations = relations(signerSessions, ({ one }) => ({
  document: one(documents, {
    fields: [signerSessions.documentId],
    references: [documents.id],
  }),
  signer: one(documentSigners, {
    fields: [signerSessions.signerId],
    references: [documentSigners.id],
  }),
}));

export const emailLogsRelations = relations(emailLogs, ({ one }) => ({
  document: one(documents, {
    fields: [emailLogs.documentId],
    references: [documents.id],
  }),
}));

export const signatureAssetsRelations = relations(signatureAssets, ({ one }) => ({
  document: one(documents, {
    fields: [signatureAssets.documentId],
    references: [documents.id],
  }),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  document: one(documents, {
    fields: [auditEvents.documentId],
    references: [documents.id],
  }),
}));

// Insert schemas
export const insertTemplateSchema = createInsertSchema(templates).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTemplateFieldSchema = createInsertSchema(templateFields).omit({
  id: true,
  createdAt: true,
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSignatureAssetSchema = createInsertSchema(signatureAssets).omit({
  id: true,
  createdAt: true,
});

export const insertSignatureSpotSchema = createInsertSchema(signatureSpots).omit({
  id: true,
});

export const insertAuditEventSchema = createInsertSchema(auditEvents).omit({
  id: true,
  createdAt: true,
});

export const insertEmailLogSchema = createInsertSchema(emailLogs).omit({
  id: true,
  createdAt: true,
});

export const insertDocumentSignerSchema = createInsertSchema(documentSigners).omit({
  id: true,
  createdAt: true,
});

// Types
export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;

export type TemplateField = typeof templateFields.$inferSelect;
export type InsertTemplateField = z.infer<typeof insertTemplateFieldSchema>;

export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

export type SignatureAsset = typeof signatureAssets.$inferSelect;
export type InsertSignatureAsset = z.infer<typeof insertSignatureAssetSchema>;

export type SignatureSpot = typeof signatureSpots.$inferSelect;
export type InsertSignatureSpot = z.infer<typeof insertSignatureSpotSchema>;

export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;

export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;

export type DocumentSigner = typeof documentSigners.$inferSelect;
export type InsertDocumentSigner = z.infer<typeof insertDocumentSignerSchema>;

export const insertSignerSessionSchema = createInsertSchema(signerSessions).omit({
  id: true,
  createdAt: true,
});
export type SignerSession = typeof signerSessions.$inferSelect;
export type InsertSignerSession = z.infer<typeof insertSignerSessionSchema>;

// System settings table - stores application configuration
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSystemSettingsSchema = createInsertSchema(systemSettings).omit({ id: true, updatedAt: true });
export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingsSchema>;

// Promo codes table - stores promo campaigns for subscription discounts
export const promoCampaigns = pgTable("promo_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(), // User-facing code (e.g., "SUMMER25")
  description: text("description"), // Admin notes
  percentOff: integer("percent_off").notNull(), // Discount percentage (1-100)
  stripeCouponId: text("stripe_coupon_id"), // Stripe Coupon ID
  stripePromoCodeId: text("stripe_promo_code_id"), // Stripe Promotion Code ID
  maxRedemptions: integer("max_redemptions"), // Null = unlimited
  currentRedemptions: integer("current_redemptions").default(0).notNull(),
  expiresAt: timestamp("expires_at"), // Null = never expires
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPromoCampaignSchema = createInsertSchema(promoCampaigns).omit({ 
  id: true, 
  currentRedemptions: true, 
  createdAt: true, 
  updatedAt: true 
});
export type PromoCampaign = typeof promoCampaigns.$inferSelect;
export type InsertPromoCampaign = z.infer<typeof insertPromoCampaignSchema>;

// Admin settings - platform-wide settings for admin users
export const adminSettings = pgTable("admin_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  displayCurrency: varchar("display_currency").default("EUR").notNull(), // EUR | USD | GBP
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: varchar("updated_by"), // Admin user ID who last updated
});

export const insertAdminSettingsSchema = createInsertSchema(adminSettings).omit({
  id: true,
  updatedAt: true,
});
export type AdminSettings = typeof adminSettings.$inferSelect;
export type InsertAdminSettings = z.infer<typeof insertAdminSettingsSchema>;

// API request/response schemas
export const signerSchema = z.object({
  email: z.string().email(),
  name: z.string(),
  role: z.string(),
});

export const createDocumentRequestSchema = z.object({
  template_id: z.string(),
  data: z.record(z.any()),
  callback_url: z.string().url().optional(),
  signers: z.array(signerSchema).optional(), // Multi-signer support
});

export type Signer = z.infer<typeof signerSchema>;
export type CreateDocumentRequest = z.infer<typeof createDocumentRequestSchema>;

export interface DocumentMetadata {
  id: string;
  templateId: string | null;
  status: string;
  title?: string;
  unsignedPdfUrl: string;
  spots: SignatureSpot[]; // All spots for rendering (includes all signers)
  requiredSpotKeys: string[]; // Spot keys this signer needs to sign
  uploadedSpots: string[]; // Spots already signed by this signer (for counter)
  signatureImages?: Record<string, string>;
  textValues?: Record<string, string>; // Map of spotKey -> text value for text/date/checkbox fields
  signerId?: string; // The ID of the current signer (for mobile signing sessions)
  currentSigner?: {
    email: string;
    name: string;
    role: string;
    status: string;
  };
  signers?: Array<{
    email: string;
    name: string;
    role: string;
    status: string;
  }>;
}

export interface WebhookPayload {
  document_id: string;
  status: string;
  signed_pdf_key: string;
  signed_pdf_url: string;
  sha256: string;
}
