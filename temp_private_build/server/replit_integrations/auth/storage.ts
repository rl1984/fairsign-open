import { users, type User, type UpsertUser } from "@shared/models/auth";
import { systemSettings } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
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
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  getUserByStripeSubscriptionId(subscriptionId: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(email: string, password: string, firstName?: string, lastName?: string, isAdmin?: boolean): Promise<User>;
  createUnverifiedUser(email: string, password: string, verificationToken: string, tokenExpiry: Date): Promise<User>;
  validatePassword(email: string, password: string): Promise<User | null>;
  updatePassword(userId: string, newPassword: string): Promise<void>;
  updateProfile(userId: string, firstName: string, lastName: string): Promise<User | undefined>;
  updateProfileImage(userId: string, imageKey: string | null): Promise<User | undefined>;
  setTwoFactorSecret(userId: string, secret: string): Promise<void>;
  enableTwoFactor(userId: string, enabled: boolean): Promise<void>;
  verifyEmail(userId: string): Promise<User | undefined>;
  setVerificationToken(userId: string, token: string, expiry: Date): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  getStorageSettings(): Promise<StorageSettings>;
  saveStorageSettings(settings: StorageSettings): Promise<void>;
  getRawSecretAccessKey(): Promise<string>;
  updateStripeCustomerId(userId: string | number, customerId: string): Promise<void>;
  updateUserSubscription(userId: string | number, updates: { accountType?: string; stripeSubscriptionId?: string | null; subscriptionStatus?: string }): Promise<void>;
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
}

export const authStorage = new AuthStorage();
