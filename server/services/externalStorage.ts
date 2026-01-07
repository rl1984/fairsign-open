import crypto from "crypto";
import type { StorageCredentials, StorageProvider } from "@shared/models/auth";

function getEncryptionKey(): string {
  const key = process.env.SESSION_SECRET;
  if (!key) {
    throw new Error("SESSION_SECRET environment variable is required for token encryption");
  }
  return key;
}

function deriveUserKey(userId: string): Buffer {
  const masterKey = getEncryptionKey();
  return crypto.scryptSync(masterKey, `user:${userId}`, 32);
}

function encryptWithUserKey(text: string, userId: string): string {
  const iv = crypto.randomBytes(16);
  const userKey = deriveUserKey(userId);
  const cipher = crypto.createCipheriv("aes-256-cbc", userKey, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decryptWithUserKey(encryptedText: string, userId: string): string {
  const parts = encryptedText.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const userKey = deriveUserKey(userId);
  const decipher = crypto.createDecipheriv("aes-256-cbc", userKey, iv);
  let decrypted = decipher.update(parts[1], "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function encrypt(text: string): string {
  const ENCRYPTION_KEY = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(encryptedText: string): string {
  const ENCRYPTION_KEY = getEncryptionKey();
  const parts = encryptedText.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(parts[1], "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authUrl: string;
  tokenUrl: string;
  scope: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
}

export interface StorageProviderInfo {
  provider: StorageProvider;
  name: string;
  description: string;
  connected: boolean;
  email?: string | null;
  requiresEncryption?: boolean;
  requiresPro?: boolean;
}

export function getOAuthConfig(provider: StorageProvider): OAuthConfig | null {
  const baseUrl = process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
    : process.env.REPLIT_DOMAINS?.split(",")[0] 
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : "http://localhost:5000";

  switch (provider) {
    case "google_drive":
      const googleClientId = process.env.GOOGLE_CLIENT_ID;
      const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!googleClientId || !googleClientSecret) return null;
      return {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        redirectUri: `${baseUrl}/api/storage/oauth/callback/google_drive`,
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scope: "https://www.googleapis.com/auth/drive.file email profile",
      };

    case "dropbox":
      // Dropbox uses APP_KEY and APP_SECRET naming convention
      const dropboxClientId = process.env.DROPBOX_APP_KEY;
      const dropboxClientSecret = process.env.DROPBOX_APP_SECRET;
      if (!dropboxClientId || !dropboxClientSecret) return null;
      return {
        clientId: dropboxClientId,
        clientSecret: dropboxClientSecret,
        redirectUri: `${baseUrl}/api/storage/oauth/callback/dropbox`,
        authUrl: "https://www.dropbox.com/oauth2/authorize",
        tokenUrl: "https://api.dropboxapi.com/oauth2/token",
        // Dropbox scopes for file access
        scope: "files.content.write files.content.read account_info.read",
      };

    case "box":
      const boxClientId = process.env.BOX_CLIENT_ID;
      const boxClientSecret = process.env.BOX_CLIENT_SECRET;
      if (!boxClientId || !boxClientSecret) return null;
      return {
        clientId: boxClientId,
        clientSecret: boxClientSecret,
        redirectUri: `${baseUrl}/api/storage/oauth/callback/box`,
        authUrl: "https://account.box.com/api/oauth2/authorize",
        tokenUrl: "https://api.box.com/oauth2/token",
        scope: "root_readwrite",
      };

    default:
      return null;
  }
}

export function generateOAuthUrl(provider: StorageProvider, state: string): string | null {
  const config = getOAuthConfig(provider);
  if (!config) return null;

  // Base params for all providers
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    state,
  });

  // Provider-specific parameters
  switch (provider) {
    case "dropbox":
      // Dropbox uses token_access_type for refresh tokens, not access_type
      params.set("token_access_type", "offline");
      // Dropbox scoped apps require explicit scope parameter
      params.set("scope", config.scope);
      break;
    case "google_drive":
      params.set("scope", config.scope);
      params.set("access_type", "offline");
      params.set("prompt", "consent");
      break;
    case "box":
      params.set("scope", config.scope);
      break;
    default:
      params.set("scope", config.scope);
      break;
  }

  return `${config.authUrl}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  provider: StorageProvider,
  code: string
): Promise<OAuthTokenResponse | null> {
  const config = getOAuthConfig(provider);
  if (!config) return null;

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    console.error(`OAuth token exchange failed for ${provider}:`, await response.text());
    return null;
  }

  return response.json();
}

export async function refreshAccessToken(
  provider: StorageProvider,
  refreshToken: string
): Promise<OAuthTokenResponse | null> {
  const config = getOAuthConfig(provider);
  if (!config) return null;

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    console.error(`Token refresh failed for ${provider}:`, await response.text());
    return null;
  }

  return response.json();
}

export function encryptToken(token: string, userId?: string): string {
  if (userId) {
    return encryptWithUserKey(token, userId);
  }
  return encrypt(token);
}

export function decryptToken(encryptedToken: string, userId?: string): string {
  if (userId) {
    return decryptWithUserKey(encryptedToken, userId);
  }
  return decrypt(encryptedToken);
}

export async function getUserInfoFromProvider(
  provider: StorageProvider,
  accessToken: string
): Promise<{ email?: string; name?: string; userId?: string } | null> {
  try {
    switch (provider) {
      case "google_drive": {
        const response = await fetch(
          "https://www.googleapis.com/oauth2/v2/userinfo",
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        if (!response.ok) return null;
        const data = await response.json();
        return { email: data.email, name: data.name, userId: data.id };
      }

      case "dropbox": {
        const response = await fetch(
          "https://api.dropboxapi.com/2/users/get_current_account",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        if (!response.ok) return null;
        const data = await response.json();
        return { email: data.email, name: data.name?.display_name, userId: data.account_id };
      }

      case "box": {
        const response = await fetch("https://api.box.com/2.0/users/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) return null;
        const data = await response.json();
        return { email: data.login, name: data.name, userId: data.id };
      }

      default:
        return null;
    }
  } catch (error) {
    console.error(`Failed to get user info from ${provider}:`, error);
    return null;
  }
}

export function isProviderConfigured(provider: StorageProvider): boolean {
  switch (provider) {
    case "google_drive":
      return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    case "dropbox":
      // Dropbox uses APP_KEY and APP_SECRET naming convention
      return !!(process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET);
    case "box":
      return !!(process.env.BOX_CLIENT_ID && process.env.BOX_CLIENT_SECRET);
    case "fairsign":
      return true;
    case "custom_s3":
      return true; // Always configured - user provides their own credentials
    default:
      return false;
  }
}

export function getAvailableProviders(): StorageProviderInfo[] {
  return [
    {
      provider: "fairsign",
      name: "FairSign Storage",
      description: "Secure encrypted storage powered by Cloudflare R2. Your documents are encrypted before upload and only you can access them.",
      connected: true,
      requiresEncryption: true,
    },
    {
      provider: "custom_s3",
      name: "Custom S3 Storage",
      description: "Connect your own S3-compatible storage (AWS S3, Cloudflare R2, MinIO, etc.).",
      connected: false,
      requiresPro: true,
    },
    {
      provider: "google_drive",
      name: "Google Drive",
      description: "Store signed documents in your Google Drive account.",
      connected: false,
      requiresPro: true,
    },
    {
      provider: "dropbox",
      name: "Dropbox",
      description: "Store signed documents in your Dropbox account.",
      connected: false,
      requiresPro: true,
    },
    {
      provider: "box",
      name: "Box",
      description: "Store signed documents in your Box account.",
      connected: false,
      requiresPro: true,
    },
  ];
}
