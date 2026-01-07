import { 
  users, 
  storageCredentials, 
  userS3Credentials,
  organizations, 
  organizationMembers, 
  organizationInvitations,
  apiKeys,
  type User, 
  type UpsertUser, 
  type StorageCredentials, 
  type StorageProvider,
  type UserS3Credentials,
  type Organization,
  type OrganizationMember,
  type OrganizationInvitation,
  type InsertOrganization,
  type InsertOrganizationMember,
  type InsertOrganizationInvitation,
  type ApiKey,
  type InsertApiKey,
} from "@shared/models/auth";
import { systemSettings } from "@shared/schema";
import { db } from "../../db";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcrypt";

export interface StorageSettings {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
}

export interface IAuthStorage {
  getUser(id: string | number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getUserByMicrosoftId(microsoftId: string): Promise<User | undefined>;
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  getUserByStripeSubscriptionId(subscriptionId: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(email: string, password: string, firstName?: string, lastName?: string, isAdmin?: boolean): Promise<User>;
  createSSOUser(email: string, googleId: string, firstName?: string, lastName?: string, avatarUrl?: string): Promise<User>;
  createMicrosoftSSOUser(email: string, microsoftId: string, firstName?: string, lastName?: string, avatarUrl?: string): Promise<User>;
  linkGoogleAccount(userId: string, googleId: string, avatarUrl?: string): Promise<User | undefined>;
  linkMicrosoftAccount(userId: string, microsoftId: string, avatarUrl?: string): Promise<User | undefined>;
  createUnverifiedUser(email: string, password: string, verificationToken: string, tokenExpiry: Date): Promise<User>;
  validatePassword(email: string, password: string): Promise<User | null>;
  updatePassword(userId: string, newPassword: string): Promise<void>;
  updateProfile(userId: string, firstName: string, lastName: string): Promise<User | undefined>;
  updateProfileImage(userId: string, imageKey: string | null): Promise<User | undefined>;
  setTwoFactorSecret(userId: string, secret: string): Promise<void>;
  enableTwoFactor(userId: string, enabled: boolean): Promise<void>;
  verifyEmail(userId: string): Promise<User | undefined>;
  setVerificationToken(userId: string, token: string, expiry: Date): Promise<void>;
  setPasswordResetToken(userId: string, token: string, expiry: Date): Promise<void>;
  getUserByPasswordResetToken(token: string): Promise<User | undefined>;
  clearPasswordResetToken(userId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  getStorageSettings(): Promise<StorageSettings>;
  saveStorageSettings(settings: StorageSettings): Promise<void>;
  getRawSecretAccessKey(): Promise<string>;
  updateStripeCustomerId(userId: string | number, customerId: string): Promise<void>;
  updateUserSubscription(userId: string | number, updates: { accountType?: string; stripeSubscriptionId?: string | null; subscriptionStatus?: string }): Promise<void>;
  updateStorageProvider(userId: string, provider: StorageProvider): Promise<User | undefined>;
  updateEncryptionKey(userId: string, keyId: string, salt: string): Promise<User | undefined>;
  getStorageCredentials(userId: string, provider: string): Promise<StorageCredentials | undefined>;
  getAllStorageCredentials(userId: string): Promise<StorageCredentials[]>;
  saveStorageCredential(credential: Omit<StorageCredentials, "id" | "createdAt" | "updatedAt">): Promise<StorageCredentials>;
  deleteStorageCredential(userId: string, provider: string): Promise<void>;
  checkDocumentUsage(userId: string): Promise<{ canCreate: boolean; used: number; limit: number; accountType: string }>;
  incrementDocumentCount(userId: string): Promise<void>;
  
  // Organization (Team) management
  createOrganization(data: InsertOrganization): Promise<Organization>;
  getOrganization(id: string): Promise<Organization | undefined>;
  getOrganizationByOwnerId(ownerId: string): Promise<Organization | undefined>;
  updateOrganization(id: string, updates: Partial<Organization>): Promise<Organization | undefined>;
  deleteOrganization(id: string): Promise<void>;
  updateOrganizationSeatCount(id: string, seatCount: number): Promise<Organization | undefined>;
  
  // Organization members
  addOrganizationMember(data: InsertOrganizationMember): Promise<OrganizationMember>;
  getOrganizationMembers(organizationId: string): Promise<(OrganizationMember & { user: User })[]>;
  getOrganizationMember(organizationId: string, userId: string): Promise<OrganizationMember | undefined>;
  removeOrganizationMember(organizationId: string, userId: string): Promise<void>;
  updateMemberRole(organizationId: string, userId: string, role: string): Promise<OrganizationMember | undefined>;
  
  // Organization invitations
  createOrganizationInvitation(data: InsertOrganizationInvitation): Promise<OrganizationInvitation>;
  getOrganizationInvitation(id: string): Promise<OrganizationInvitation | undefined>;
  getOrganizationInvitationByToken(token: string): Promise<OrganizationInvitation | undefined>;
  getOrganizationInvitations(organizationId: string): Promise<OrganizationInvitation[]>;
  getPendingInvitationsByEmail(email: string): Promise<OrganizationInvitation[]>;
  updateInvitationStatus(id: string, status: string, acceptedAt?: Date): Promise<OrganizationInvitation | undefined>;
  deleteOrganizationInvitation(id: string): Promise<void>;
  
  // User organization helpers
  setUserOrganization(userId: string, organizationId: string | null): Promise<User | undefined>;
  getUserOrganization(userId: string): Promise<Organization | undefined>;
  
  // User custom S3 credentials
  getUserS3Credentials(userId: string): Promise<UserS3Credentials | undefined>;
  saveUserS3Credentials(credentials: Omit<UserS3Credentials, "id" | "createdAt" | "updatedAt">): Promise<UserS3Credentials>;
  deleteUserS3Credentials(userId: string): Promise<void>;
  updateUserS3LastTested(userId: string): Promise<void>;
  
  // Data residency
  updateDataRegion(userId: string, dataRegion: "EU" | "US"): Promise<User | undefined>;
  
  // Embedded signing - allowed origins for iframe embedding (Enterprise feature)
  updateAllowedOrigins(userId: string, origins: string[]): Promise<User | undefined>;
  
  // API usage tracking for Enterprise quota enforcement
  incrementApiUsage(userId: string): Promise<void>;
  resetApiUsage(userId: string, newBillingPeriodStart: Date): Promise<void>;
  setApiQuotaLimit(userId: string, limit: number, billingPeriodStart?: Date): Promise<void>;
  
  // API Keys for programmatic access (Enterprise feature)
  createApiKey(data: InsertApiKey): Promise<ApiKey>;
  getApiKeysByOrganization(organizationId: string): Promise<ApiKey[]>;
  getApiKeyByPrefix(keyPrefix: string): Promise<ApiKey | undefined>;
  deleteApiKey(id: string): Promise<void>;
  updateApiKeyLastUsed(id: string): Promise<void>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string | number): Promise<User | undefined> {
    const userId = typeof id === 'number' ? id.toString() : id;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user;
  }

  async getUserByStripeSubscriptionId(subscriptionId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.stripeSubscriptionId, subscriptionId));
    return user;
  }

  async updateStripeCustomerId(userId: string | number, customerId: string): Promise<void> {
    const id = typeof userId === 'number' ? userId.toString() : userId;
    await db.update(users).set({ stripeCustomerId: customerId, updatedAt: new Date() }).where(eq(users.id, id));
  }

  async updateUserSubscription(userId: string | number, updates: { accountType?: string; stripeSubscriptionId?: string | null; subscriptionStatus?: string }): Promise<void> {
    const id = typeof userId === 'number' ? userId.toString() : userId;
    await db.update(users).set({ ...updates, updatedAt: new Date() } as any).where(eq(users.id, id));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async createSSOUser(
    email: string,
    googleId: string,
    firstName?: string,
    lastName?: string,
    avatarUrl?: string
  ): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        googleId,
        firstName,
        lastName,
        avatarUrl,
        emailVerified: true, // Google verifies the email
      })
      .returning();
    return user;
  }

  async linkGoogleAccount(userId: string, googleId: string, avatarUrl?: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ 
        googleId, 
        avatarUrl: avatarUrl || undefined,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getUserByMicrosoftId(microsoftId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.microsoftId, microsoftId));
    return user;
  }

  async createMicrosoftSSOUser(
    email: string,
    microsoftId: string,
    firstName?: string,
    lastName?: string,
    avatarUrl?: string
  ): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        microsoftId,
        firstName,
        lastName,
        avatarUrl,
        emailVerified: true, // Microsoft verifies the email
      })
      .returning();
    return user;
  }

  async linkMicrosoftAccount(userId: string, microsoftId: string, avatarUrl?: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ 
        microsoftId, 
        avatarUrl: avatarUrl || undefined,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.emailVerificationToken, token));
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(users.createdAt);
  }

  async createUser(
    email: string, 
    password: string, 
    firstName?: string, 
    lastName?: string,
    isAdmin: boolean = false
  ): Promise<User> {
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        isAdmin,
        emailVerified: true,
      })
      .returning();
    return user;
  }

  async createUnverifiedUser(
    email: string,
    password: string,
    verificationToken: string,
    tokenExpiry: Date
  ): Promise<User> {
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpiry: tokenExpiry,
      })
      .returning();
    return user;
  }

  async validatePassword(email: string, password: string): Promise<User | null> {
    const user = await this.getUserByEmail(email);
    if (!user) return null;
    
    // SSO-only users don't have a password
    if (!user.passwordHash) return null;
    
    const isValid = await bcrypt.compare(password, user.passwordHash);
    return isValid ? user : null;
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async updateProfile(userId: string, firstName: string, lastName: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ firstName, lastName, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateProfileImage(userId: string, imageKey: string | null): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ profileImageKey: imageKey, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async setTwoFactorSecret(userId: string, secret: string): Promise<void> {
    await db.update(users).set({ twoFactorSecret: secret, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async enableTwoFactor(userId: string, enabled: boolean): Promise<void> {
    const updates: any = { twoFactorEnabled: enabled, updatedAt: new Date() };
    if (!enabled) {
      updates.twoFactorSecret = null;
    }
    await db.update(users).set(updates).where(eq(users.id, userId));
  }

  async verifyEmail(userId: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async setVerificationToken(userId: string, token: string, expiry: Date): Promise<void> {
    await db
      .update(users)
      .set({
        emailVerificationToken: token,
        emailVerificationExpiry: expiry,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async setPasswordResetToken(userId: string, token: string, expiry: Date): Promise<void> {
    await db
      .update(users)
      .set({
        passwordResetToken: token,
        passwordResetExpiry: expiry,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async getUserByPasswordResetToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.passwordResetToken, token));
    return user;
  }

  async clearPasswordResetToken(userId: string): Promise<void> {
    await db
      .update(users)
      .set({
        passwordResetToken: null,
        passwordResetExpiry: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async deleteUser(userId: string): Promise<void> {
    await db.delete(users).where(eq(users.id, userId));
  }

  async getStorageSettings(): Promise<StorageSettings> {
    const settings: StorageSettings = {
      endpoint: "",
      bucket: "",
      region: "auto",
      accessKeyId: "",
      secretAccessKey: "",
      prefix: "",
    };

    const rows = await db.select().from(systemSettings);
    for (const row of rows) {
      if (row.key === "s3_endpoint") settings.endpoint = row.value || "";
      if (row.key === "s3_bucket") settings.bucket = row.value || "";
      if (row.key === "s3_region") settings.region = row.value || "auto";
      if (row.key === "s3_access_key_id") settings.accessKeyId = row.value || "";
      if (row.key === "s3_secret_access_key") {
        const secret = row.value || "";
        settings.secretAccessKey = secret ? "••••••••" + secret.slice(-4) : "";
      }
      if (row.key === "s3_prefix") settings.prefix = row.value || "";
    }

    return settings;
  }

  async getRawSecretAccessKey(): Promise<string> {
    const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, "s3_secret_access_key"));
    return row?.value || "";
  }

  async saveStorageSettings(settings: StorageSettings): Promise<void> {
    const settingsMap = [
      { key: "s3_endpoint", value: settings.endpoint },
      { key: "s3_bucket", value: settings.bucket },
      { key: "s3_region", value: settings.region },
      { key: "s3_access_key_id", value: settings.accessKeyId },
      { key: "s3_prefix", value: settings.prefix },
    ];

    for (const { key, value } of settingsMap) {
      const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
      if (existing.length > 0) {
        await db.update(systemSettings).set({ value, updatedAt: new Date() }).where(eq(systemSettings.key, key));
      } else {
        await db.insert(systemSettings).values({ key, value });
      }
    }

    if (settings.secretAccessKey && !settings.secretAccessKey.startsWith("••••")) {
      const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, "s3_secret_access_key"));
      if (existing.length > 0) {
        await db.update(systemSettings).set({ value: settings.secretAccessKey, updatedAt: new Date() }).where(eq(systemSettings.key, "s3_secret_access_key"));
      } else {
        await db.insert(systemSettings).values({ key: "s3_secret_access_key", value: settings.secretAccessKey });
      }
    }
  }

  async updateStorageProvider(userId: string, provider: StorageProvider): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ storageProvider: provider, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateEncryptionKey(userId: string, keyId: string, salt: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ encryptionKeyId: keyId, encryptionKeySalt: salt, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getStorageCredentials(userId: string, provider: string): Promise<StorageCredentials | undefined> {
    const [cred] = await db
      .select()
      .from(storageCredentials)
      .where(and(eq(storageCredentials.userId, userId), eq(storageCredentials.provider, provider)));
    return cred;
  }

  async getAllStorageCredentials(userId: string): Promise<StorageCredentials[]> {
    return db.select().from(storageCredentials).where(eq(storageCredentials.userId, userId));
  }

  async saveStorageCredential(credential: Omit<StorageCredentials, "id" | "createdAt" | "updatedAt">): Promise<StorageCredentials> {
    const existing = await this.getStorageCredentials(credential.userId, credential.provider);
    if (existing) {
      const [updated] = await db
        .update(storageCredentials)
        .set({ ...credential, updatedAt: new Date() })
        .where(eq(storageCredentials.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(storageCredentials).values(credential).returning();
    return created;
  }

  async deleteStorageCredential(userId: string, provider: string): Promise<void> {
    await db
      .delete(storageCredentials)
      .where(and(eq(storageCredentials.userId, userId), eq(storageCredentials.provider, provider)));
  }

  async checkDocumentUsage(userId: string): Promise<{ canCreate: boolean; used: number; limit: number; accountType: string }> {
    const user = await this.getUser(userId);
    if (!user) {
      return { canCreate: false, used: 0, limit: 0, accountType: "free" };
    }

    const FREE_LIMIT = 5;
    const accountType = user.accountType || "free";
    const isPro = accountType === "pro" || accountType === "enterprise";

    if (isPro) {
      return { canCreate: true, used: 0, limit: -1, accountType };
    }

    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let documentsUsed = parseInt(user.documentsThisMonth || "0", 10);

    if (!user.monthlyResetDate || new Date(user.monthlyResetDate) < currentMonth) {
      documentsUsed = 0;
      await db
        .update(users)
        .set({ documentsThisMonth: "0", monthlyResetDate: currentMonth, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }

    return {
      canCreate: documentsUsed < FREE_LIMIT,
      used: documentsUsed,
      limit: FREE_LIMIT,
      accountType,
    };
  }

  async incrementDocumentCount(userId: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) return;

    const accountType = user.accountType || "free";
    if (accountType === "pro" || accountType === "enterprise") {
      return;
    }

    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let currentCount = parseInt(user.documentsThisMonth || "0", 10);

    if (!user.monthlyResetDate || new Date(user.monthlyResetDate) < currentMonth) {
      currentCount = 0;
    }

    await db
      .update(users)
      .set({
        documentsThisMonth: (currentCount + 1).toString(),
        monthlyResetDate: currentMonth,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  // Organization (Team) management
  async createOrganization(data: InsertOrganization): Promise<Organization> {
    const [org] = await db.insert(organizations).values(data).returning();
    return org;
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org;
  }

  async getOrganizationByOwnerId(ownerId: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.ownerId, ownerId));
    return org;
  }

  async updateOrganization(id: string, updates: Partial<Organization>): Promise<Organization | undefined> {
    const [org] = await db
      .update(organizations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();
    return org;
  }

  async deleteOrganization(id: string): Promise<void> {
    // First remove all members and invitations
    await db.delete(organizationMembers).where(eq(organizationMembers.organizationId, id));
    await db.delete(organizationInvitations).where(eq(organizationInvitations.organizationId, id));
    // Clear organizationId from all users in this org
    await db.update(users).set({ organizationId: null }).where(eq(users.organizationId, id));
    // Delete the organization
    await db.delete(organizations).where(eq(organizations.id, id));
  }

  async updateOrganizationSeatCount(id: string, seatCount: number): Promise<Organization | undefined> {
    return this.updateOrganization(id, { seatCount: seatCount.toString() });
  }

  // Organization members
  async addOrganizationMember(data: InsertOrganizationMember): Promise<OrganizationMember> {
    const [member] = await db.insert(organizationMembers).values(data).returning();
    // Also update the user's organizationId
    await db.update(users).set({ organizationId: data.organizationId }).where(eq(users.id, data.userId));
    return member;
  }

  async getOrganizationMembers(organizationId: string): Promise<(OrganizationMember & { user: User })[]> {
    const members = await db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, organizationId));
    const result: (OrganizationMember & { user: User })[] = [];
    for (const member of members) {
      const user = await this.getUser(member.userId);
      if (user) {
        result.push({ ...member, user });
      }
    }
    return result;
  }

  async getOrganizationMember(organizationId: string, userId: string): Promise<OrganizationMember | undefined> {
    const [member] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)));
    return member;
  }

  async removeOrganizationMember(organizationId: string, userId: string): Promise<void> {
    await db
      .delete(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)));
    // Clear user's organizationId
    await db.update(users).set({ organizationId: null }).where(eq(users.id, userId));
  }

  async updateMemberRole(organizationId: string, userId: string, role: string): Promise<OrganizationMember | undefined> {
    const [member] = await db
      .update(organizationMembers)
      .set({ role })
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
      .returning();
    return member;
  }

  // Organization invitations
  async createOrganizationInvitation(data: InsertOrganizationInvitation): Promise<OrganizationInvitation> {
    const [invitation] = await db.insert(organizationInvitations).values(data).returning();
    return invitation;
  }

  async getOrganizationInvitation(id: string): Promise<OrganizationInvitation | undefined> {
    const [invitation] = await db.select().from(organizationInvitations).where(eq(organizationInvitations.id, id));
    return invitation;
  }

  async getOrganizationInvitationByToken(token: string): Promise<OrganizationInvitation | undefined> {
    const [invitation] = await db.select().from(organizationInvitations).where(eq(organizationInvitations.token, token));
    return invitation;
  }

  async getOrganizationInvitations(organizationId: string): Promise<OrganizationInvitation[]> {
    return db.select().from(organizationInvitations).where(eq(organizationInvitations.organizationId, organizationId));
  }

  async getPendingInvitationsByEmail(email: string): Promise<OrganizationInvitation[]> {
    return db
      .select()
      .from(organizationInvitations)
      .where(and(eq(organizationInvitations.email, email.toLowerCase()), eq(organizationInvitations.status, "pending")));
  }

  async updateInvitationStatus(id: string, status: string, acceptedAt?: Date): Promise<OrganizationInvitation | undefined> {
    const updates: Partial<OrganizationInvitation> = { status };
    if (acceptedAt) {
      updates.acceptedAt = acceptedAt;
    }
    const [invitation] = await db
      .update(organizationInvitations)
      .set(updates)
      .where(eq(organizationInvitations.id, id))
      .returning();
    return invitation;
  }

  async deleteOrganizationInvitation(id: string): Promise<void> {
    await db.delete(organizationInvitations).where(eq(organizationInvitations.id, id));
  }

  // User organization helpers
  async setUserOrganization(userId: string, organizationId: string | null): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ organizationId, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getUserOrganization(userId: string): Promise<Organization | undefined> {
    const user = await this.getUser(userId);
    if (!user || !user.organizationId) {
      return undefined;
    }
    return this.getOrganization(user.organizationId);
  }

  // User custom S3 credentials
  async getUserS3Credentials(userId: string): Promise<UserS3Credentials | undefined> {
    const [cred] = await db
      .select()
      .from(userS3Credentials)
      .where(eq(userS3Credentials.userId, userId));
    return cred;
  }

  async saveUserS3Credentials(credentials: Omit<UserS3Credentials, "id" | "createdAt" | "updatedAt">): Promise<UserS3Credentials> {
    const existing = await this.getUserS3Credentials(credentials.userId);
    if (existing) {
      const [updated] = await db
        .update(userS3Credentials)
        .set({ ...credentials, updatedAt: new Date() })
        .where(eq(userS3Credentials.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(userS3Credentials).values(credentials).returning();
    return created;
  }

  async deleteUserS3Credentials(userId: string): Promise<void> {
    await db.delete(userS3Credentials).where(eq(userS3Credentials.userId, userId));
  }

  async updateUserS3LastTested(userId: string): Promise<void> {
    await db
      .update(userS3Credentials)
      .set({ lastTestedAt: new Date(), updatedAt: new Date() })
      .where(eq(userS3Credentials.userId, userId));
  }

  async updateDataRegion(userId: string, dataRegion: "EU" | "US"): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ dataRegion, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }
  
  async updateAllowedOrigins(userId: string, origins: string[]): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ allowedOrigins: origins, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }
  
  // API usage tracking for Enterprise quota enforcement
  async incrementApiUsage(userId: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) return;
    
    const newCount = (user.apiCallsCount || 0) + 1;
    await db
      .update(users)
      .set({ apiCallsCount: newCount, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }
  
  async resetApiUsage(userId: string, newBillingPeriodStart: Date): Promise<void> {
    await db
      .update(users)
      .set({ 
        apiCallsCount: 0, 
        billingPeriodStart: newBillingPeriodStart,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId));
  }
  
  async setApiQuotaLimit(userId: string, limit: number, billingPeriodStart?: Date): Promise<void> {
    const updates: any = { 
      apiQuotaLimit: limit, 
      updatedAt: new Date() 
    };
    
    if (billingPeriodStart) {
      updates.billingPeriodStart = billingPeriodStart;
      updates.apiCallsCount = 0; // Reset count when billing period starts
    }
    
    await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId));
  }
  
  // API Keys for programmatic access (Enterprise feature)
  async createApiKey(data: InsertApiKey): Promise<ApiKey> {
    const [apiKey] = await db.insert(apiKeys).values(data).returning();
    return apiKey;
  }
  
  async getApiKeysByOrganization(organizationId: string): Promise<ApiKey[]> {
    return db.select().from(apiKeys).where(eq(apiKeys.organizationId, organizationId));
  }
  
  async getApiKeyByPrefix(keyPrefix: string): Promise<ApiKey | undefined> {
    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.keyPrefix, keyPrefix));
    return apiKey;
  }
  
  async deleteApiKey(id: string): Promise<void> {
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
  }
  
  async updateApiKeyLastUsed(id: string): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }
}

export const authStorage = new AuthStorage();
