import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Storage provider types
export const STORAGE_PROVIDERS = ["fairsign", "google_drive", "dropbox", "box", "custom_s3"] as const;
export type StorageProvider = typeof STORAGE_PROVIDERS[number];

// Account types with feature tiers
export const ACCOUNT_TYPES = ["free", "pro", "enterprise", "org"] as const;
export type AccountType = typeof ACCOUNT_TYPES[number];

// Tier hierarchy for comparison (higher number = more features)
export const TIER_HIERARCHY: Record<AccountType, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
  org: 3,
};

// Feature limits by tier
export const TIER_LIMITS = {
  free: {
    documentsPerMonth: 5,
    signersPerDocument: 10,
    apiCallsPerMonth: 0,
  },
  pro: {
    documentsPerMonth: -1, // unlimited
    signersPerDocument: -1, // unlimited
    apiCallsPerMonth: 0,
  },
  enterprise: {
    documentsPerMonth: -1, // unlimited
    signersPerDocument: -1, // unlimited
    apiCallsPerMonth: 200,
  },
  org: {
    documentsPerMonth: -1, // unlimited
    signersPerDocument: -1, // unlimited
    apiCallsPerMonth: 500,
  },
} as const;

// Helper function to check if user is Enterprise or Organisation (has SSO access)
export function isEnterpriseOrOrg(accountType: string | null | undefined): boolean {
  return hasMinimumTier(accountType, "enterprise");
}

// Helper function to check if user has at least a certain tier
export function hasMinimumTier(userAccountType: string | null | undefined, requiredTier: AccountType): boolean {
  const userTier = (userAccountType || "free") as AccountType;
  return TIER_HIERARCHY[userTier] >= TIER_HIERARCHY[requiredTier];
}

// Helper function to check if user is Pro or higher
export function isProOrHigher(accountType: string | null | undefined): boolean {
  return hasMinimumTier(accountType, "pro");
}

// Helper function to check if user is Enterprise
export function isEnterprise(accountType: string | null | undefined): boolean {
  return hasMinimumTier(accountType, "enterprise");
}

// Get tier limits for a user
export function getTierLimits(accountType: string | null | undefined) {
  const tier = (accountType || "free") as AccountType;
  return TIER_LIMITS[tier] || TIER_LIMITS.free;
}

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

// User storage table with email/password and SSO authentication.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("password_hash"), // Nullable for SSO-only users
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageKey: varchar("profile_image_key"),
  // Google SSO fields
  googleId: varchar("google_id").unique(), // Google OAuth user ID
  avatarUrl: varchar("avatar_url"), // Profile picture from Google/Microsoft
  // Microsoft SSO fields (Azure AD)
  microsoftId: varchar("microsoft_id").unique(), // Microsoft/Azure AD user ID
  isAdmin: boolean("is_admin").default(false).notNull(),
  twoFactorSecret: varchar("two_factor_secret"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  emailVerificationToken: varchar("email_verification_token"),
  emailVerificationExpiry: timestamp("email_verification_expiry"),
  passwordResetToken: varchar("password_reset_token"),
  passwordResetExpiry: timestamp("password_reset_expiry"),
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
  // Identity verification (Stripe Identity) - Pro feature
  identityVerifiedAt: timestamp("identity_verified_at"),
  identityVerificationSessionId: varchar("identity_verification_session_id"),
  identityVerificationStatus: varchar("identity_verification_status"), // pending | verified | failed | requires_input
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Soft delete fields for 30-day recovery
  deletedAt: timestamp("deleted_at"),
  scheduledDeletionDate: timestamp("scheduled_deletion_date"),
  deletionReason: varchar("deletion_reason"),
  // Data residency - determines which regional bucket to use (Enterprise feature to change)
  dataRegion: varchar("data_region").default("EU").notNull(), // EU | US
  // Embedded signing - allowed origins for iframe embedding (Enterprise feature)
  allowedOrigins: text("allowed_origins").array(), // e.g., ["https://myapp.com", "https://app.example.com"]
  // API usage tracking for Enterprise quota enforcement
  apiCallsCount: integer("api_calls_count").default(0).notNull(), // Current month API call count
  apiQuotaLimit: integer("api_quota_limit").default(0).notNull(), // 0 = no access, 200 = Enterprise limit
  billingPeriodStart: timestamp("billing_period_start"), // Start of current billing period for quota reset
  // Admin blocking - prevents user from signing in
  isBlocked: boolean("is_blocked").default(false).notNull(),
  blockedAt: timestamp("blocked_at"),
  blockedReason: varchar("blocked_reason"),
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

// Custom S3 credentials for Pro users who want to use their own S3-compatible storage
export const userS3Credentials = pgTable("user_s3_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  endpointEncrypted: text("endpoint_encrypted").notNull(),
  bucketEncrypted: text("bucket_encrypted").notNull(),
  accessKeyIdEncrypted: text("access_key_id_encrypted").notNull(),
  secretAccessKeyEncrypted: text("secret_access_key_encrypted").notNull(),
  region: varchar("region").default("auto"),
  prefix: varchar("prefix"), // Optional path prefix within the bucket
  label: varchar("label"), // User-friendly name for the storage (e.g., "My Cloudflare R2")
  isActive: boolean("is_active").default(true).notNull(),
  lastTestedAt: timestamp("last_tested_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserS3CredentialsSchema = createInsertSchema(userS3Credentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserS3Credentials = z.infer<typeof insertUserS3CredentialsSchema>;
export type UserS3Credentials = typeof userS3Credentials.$inferSelect;

// Organizations (Teams) - Pro feature for shared document spaces
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  ownerId: varchar("owner_id").notNull(), // The Pro user who created/owns the organization
  seatCount: varchar("seat_count").default("1").notNull(), // Number of paid seats (including owner)
  ssoEnforced: boolean("sso_enforced").default(false).notNull(), // If true, members must use SSO (no passwords)
  ssoProviderSettings: jsonb("sso_provider_settings"), // JSONB for SSO config (provider, domain, etc.)
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

// API Keys - for programmatic API access (Enterprise feature)
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(), // Linked to organization, not individual user
  name: varchar("name").notNull(), // User-friendly name like "Production Key"
  keyPrefix: varchar("key_prefix").notNull(), // First 8 chars of the key for display (e.g., "fs_live_a1")
  keyHash: varchar("key_hash").notNull(), // SHA-256 hash of the full key
  lastUsedAt: timestamp("last_used_at"), // When the key was last used
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
});
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;

// User Guide - Admin-editable help content for logged-in users
export const userGuides = pgTable("user_guides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  slug: varchar("slug").notNull().unique(),
  content: text("content").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  published: boolean("published").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserGuideSchema = createInsertSchema(userGuides).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserGuide = z.infer<typeof insertUserGuideSchema>;
export type UserGuide = typeof userGuides.$inferSelect;
