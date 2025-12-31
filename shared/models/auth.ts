import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Storage provider types
export const STORAGE_PROVIDERS = ["fairsign", "google_drive", "dropbox", "box"] as const;
export type StorageProvider = typeof STORAGE_PROVIDERS[number];

// Session storage table.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table with email/password authentication.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("password_hash").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageKey: varchar("profile_image_key"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  twoFactorSecret: varchar("two_factor_secret"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  emailVerificationToken: varchar("email_verification_token"),
  emailVerificationExpiry: timestamp("email_verification_expiry"),
  accountType: varchar("account_type").default("free").notNull(),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  subscriptionStatus: varchar("subscription_status"),
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end"),
  documentsThisMonth: varchar("documents_this_month").default("0"),
  monthlyResetDate: timestamp("monthly_reset_date"),
  storageProvider: varchar("storage_provider").default("fairsign").notNull(),
  encryptionKeyId: varchar("encryption_key_id"),
  encryptionKeySalt: text("encryption_key_salt"),
  organizationId: varchar("organization_id"), // Team the user belongs to (null if no team)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Soft delete fields for 30-day recovery
  deletedAt: timestamp("deleted_at"),
  scheduledDeletionDate: timestamp("scheduled_deletion_date"),
  deletionReason: varchar("deletion_reason"),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// OAuth credentials for external storage providers
export const storageCredentials = pgTable("storage_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  provider: varchar("provider").notNull(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  tokenExpiresAt: timestamp("token_expires_at"),
  providerUserId: varchar("provider_user_id"),
  providerEmail: varchar("provider_email"),
  folderPath: text("folder_path"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStorageCredentialsSchema = createInsertSchema(storageCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertStorageCredentials = z.infer<typeof insertStorageCredentialsSchema>;
export type StorageCredentials = typeof storageCredentials.$inferSelect;

// Storage preference update schema
export const updateStoragePreferenceSchema = z.object({
  storageProvider: z.enum(STORAGE_PROVIDERS),
});
export type UpdateStoragePreference = z.infer<typeof updateStoragePreferenceSchema>;

// Organizations (Teams) - Pro feature for shared document spaces
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  ownerId: varchar("owner_id").notNull(), // The Pro user who created/owns the organization
  seatCount: varchar("seat_count").default("1").notNull(), // Number of paid seats (including owner)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;

// Organization members - tracks who belongs to which organization
export const organizationMembers = pgTable("organization_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  userId: varchar("user_id").notNull(), // The user who is a member
  role: varchar("role").default("member").notNull(), // owner | admin | member
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export const insertOrganizationMemberSchema = createInsertSchema(organizationMembers).omit({
  id: true,
  joinedAt: true,
});
export type InsertOrganizationMember = z.infer<typeof insertOrganizationMemberSchema>;
export type OrganizationMember = typeof organizationMembers.$inferSelect;

// Organization invitations - pending invites to join a team
export const organizationInvitations = pgTable("organization_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  email: varchar("email").notNull(),
  invitedBy: varchar("invited_by").notNull(), // User ID of who sent the invite
  token: varchar("token").notNull().unique(), // Unique token for accepting invite
  status: varchar("status").default("pending").notNull(), // pending | accepted | declined | expired
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at"),
});

export const insertOrganizationInvitationSchema = createInsertSchema(organizationInvitations).omit({
  id: true,
  createdAt: true,
  acceptedAt: true,
});
export type InsertOrganizationInvitation = z.infer<typeof insertOrganizationInvitationSchema>;
export type OrganizationInvitation = typeof organizationInvitations.$inferSelect;
