import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Storage } from "@google-cloud/storage";
import type { StorageProvider } from "@shared/models/auth";

export interface IStorageBackend {
  uploadBuffer(buffer: Buffer, key: string, contentType: string): Promise<string>;
  downloadBuffer(key: string): Promise<Buffer>;
  getSignedDownloadUrl(key: string, ttlSec: number): Promise<string>;
  exists(key: string): Promise<boolean>;
  getPrivateObjectDir(): string;
  delete?(key: string): Promise<void>;
}

export interface UserStorageContext {
  userId: string;
  provider: StorageProvider;
  encryptionKeyId?: string | null;
}

export interface EncryptedUploadResult {
  storageKey: string;
  iv: string;
  encryptedDataKey?: string;
}

// S3/R2 Compatible Storage Backend
export class S3StorageBackend implements IStorageBackend {
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION || "auto";
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "S3 storage requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY env vars"
      );
    }

    this.bucket = bucket;
    this.prefix = process.env.S3_PREFIX || "";
    this.client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  getPrivateObjectDir(): string {
    return this.prefix;
  }

  async uploadBuffer(buffer: Buffer, key: string, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return key;
  }

  async downloadBuffer(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    if (!response.Body) {
      throw new Error("Empty response body");
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async getSignedDownloadUrl(key: string, ttlSec: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: ttlSec });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }
}

// Replit Object Storage Backend (GCS-based)
export class ReplitStorageBackend implements IStorageBackend {
  private storage: Storage;
  private privateObjectDir: string;

  constructor() {
    const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

    this.storage = new Storage({
      credentials: {
        audience: "replit",
        subject_token_type: "access_token",
        token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
        type: "external_account",
        credential_source: {
          url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
          format: {
            type: "json",
            subject_token_field_name: "access_token",
          },
        },
        universe_domain: "googleapis.com",
      },
      projectId: "",
    });

    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' tool."
      );
    }
    this.privateObjectDir = dir;
  }

  getPrivateObjectDir(): string {
    return this.privateObjectDir;
  }

  private parseObjectPath(path: string): { bucketName: string; objectName: string } {
    if (!path.startsWith("/")) {
      path = `/${path}`;
    }
    const pathParts = path.split("/");
    if (pathParts.length < 3) {
      throw new Error("Invalid path: must contain at least a bucket name");
    }
    const bucketName = pathParts[1];
    const objectName = pathParts.slice(2).join("/");
    return { bucketName, objectName };
  }

  async uploadBuffer(buffer: Buffer, key: string, contentType: string): Promise<string> {
    const fullPath = `${this.privateObjectDir}/${key}`;
    const { bucketName, objectName } = this.parseObjectPath(fullPath);
    const bucket = this.storage.bucket(bucketName);
    const file = bucket.file(objectName);

    await file.save(buffer, {
      contentType,
      resumable: false,
    });

    return fullPath;
  }

  async downloadBuffer(key: string): Promise<Buffer> {
    const { bucketName, objectName } = this.parseObjectPath(key);
    const bucket = this.storage.bucket(bucketName);
    const file = bucket.file(objectName);

    const [exists] = await file.exists();
    if (!exists) {
      throw new Error("Object not found");
    }

    const [buffer] = await file.download();
    return buffer;
  }

  async getSignedDownloadUrl(key: string, ttlSec: number): Promise<string> {
    const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
    const { bucketName, objectName } = this.parseObjectPath(key);

    const request = {
      bucket_name: bucketName,
      object_name: objectName,
      method: "GET",
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    };

    const response = await fetch(
      `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to sign object URL: ${response.status}`);
    }

    const { signed_url: signedURL } = await response.json();
    return signedURL;
  }

  async exists(key: string): Promise<boolean> {
    try {
      const { bucketName, objectName } = this.parseObjectPath(key);
      const bucket = this.storage.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      return exists;
    } catch {
      return false;
    }
  }
}

// Factory function to create the appropriate storage backend
export function createStorageBackend(): IStorageBackend {
  const useS3 = process.env.STORAGE_BACKEND === "s3" || 
                (process.env.S3_ENDPOINT && process.env.S3_BUCKET);

  if (useS3) {
    console.log("Using S3-compatible storage backend");
    return new S3StorageBackend();
  }

  console.log("Using Replit Object Storage backend");
  return new ReplitStorageBackend();
}

// Singleton instance
let storageBackendInstance: IStorageBackend | null = null;

export function getStorageBackend(): IStorageBackend {
  if (!storageBackendInstance) {
    storageBackendInstance = createStorageBackend();
  }
  return storageBackendInstance;
}

// Data Residency Types
export type DataRegion = "EU" | "US";

export interface RegionalBucketConfig {
  bucket: string;
  region: string;
  endpoint: string;
}

// Get bucket configuration for a specific region
export function getRegionalBucketConfig(dataRegion: DataRegion): RegionalBucketConfig {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("S3 storage requires S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY env vars");
  }

  if (dataRegion === "US") {
    const bucket = process.env.S3_BUCKET_US;
    const region = process.env.S3_REGION_US || "us-east-1";
    if (!bucket) {
      throw new Error("S3_BUCKET_US environment variable is required for US region");
    }
    return { bucket, region, endpoint };
  }

  // Default to EU
  const bucket = process.env.S3_BUCKET_EU || process.env.S3_BUCKET;
  const region = process.env.S3_REGION_EU || process.env.S3_REGION || "auto";
  if (!bucket) {
    throw new Error("S3_BUCKET_EU or S3_BUCKET environment variable is required for EU region");
  }
  return { bucket, region, endpoint };
}

// Check if regional storage is available (US bucket configured)
export function isRegionalStorageAvailable(): boolean {
  return !!process.env.S3_BUCKET_US;
}

// Regional S3 storage backend - creates backend for specific bucket
export class RegionalS3StorageBackend implements IStorageBackend {
  private client: S3Client;
  private bucket: string;
  private prefix: string;
  public readonly dataRegion: DataRegion;

  constructor(dataRegion: DataRegion, specificBucket?: string) {
    this.dataRegion = dataRegion;
    
    const config = getRegionalBucketConfig(dataRegion);
    this.bucket = specificBucket || config.bucket;
    this.prefix = process.env.S3_PREFIX || "";

    const accessKeyId = process.env.S3_ACCESS_KEY_ID!;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY!;

    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  getBucket(): string {
    return this.bucket;
  }

  getPrivateObjectDir(): string {
    return this.prefix;
  }

  async uploadBuffer(buffer: Buffer, key: string, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return key;
  }

  async downloadBuffer(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    if (!response.Body) {
      throw new Error("Empty response body");
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async getSignedDownloadUrl(key: string, ttlSec: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: ttlSec });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }
}

// Get storage bucket info for a user's data region (for document creation)
export function getStorageBucketInfo(dataRegion: DataRegion): { storageBucket: string; storageRegion: DataRegion } {
  const config = getRegionalBucketConfig(dataRegion);
  return {
    storageBucket: config.bucket,
    storageRegion: dataRegion,
  };
}

// Get storage backend for a user's data region (for new uploads)
export function getStorageBackendForRegion(dataRegion: DataRegion): RegionalS3StorageBackend {
  return new RegionalS3StorageBackend(dataRegion);
}

// Get storage backend for a specific bucket (for downloading existing documents)
export function getStorageBackendForBucket(bucket: string, region: DataRegion = "EU"): RegionalS3StorageBackend {
  return new RegionalS3StorageBackend(region, bucket);
}

// User-specific S3 storage backend with per-user path segregation
export class UserS3StorageBackend implements IStorageBackend {
  private client: S3Client;
  private bucket: string;
  private userId: string;

  constructor(userId: string) {
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION || "auto";
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "S3 storage requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY env vars"
      );
    }

    this.bucket = bucket;
    this.userId = userId;
    this.client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  getPrivateObjectDir(): string {
    return `users/${this.userId}`;
  }

  private getUserKey(key: string): string {
    if (key.startsWith(`users/${this.userId}/`)) {
      return key;
    }
    return `users/${this.userId}/${key}`;
  }

  async uploadBuffer(buffer: Buffer, key: string, contentType: string): Promise<string> {
    const userKey = this.getUserKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: userKey,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return userKey;
  }

  async downloadBuffer(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    if (!response.Body) {
      throw new Error("Empty response body");
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async getSignedDownloadUrl(key: string, ttlSec: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: ttlSec });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }
}

// User Custom S3 Storage Backend (for user-provided S3 credentials)
export interface CustomS3Credentials {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  prefix: string;
}

export class UserCustomS3StorageBackend implements IStorageBackend {
  private client: S3Client;
  private bucket: string;
  private prefix: string;
  private userId: string;

  constructor(userId: string, credentials: CustomS3Credentials) {
    this.userId = userId;
    this.bucket = credentials.bucket;
    this.prefix = credentials.prefix || "";

    this.client = new S3Client({
      endpoint: credentials.endpoint,
      region: credentials.region || "auto",
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  private getUserKey(key: string): string {
    const basePrefix = this.prefix ? `${this.prefix}/` : "";
    return `${basePrefix}users/${this.userId}/documents/${key}`;
  }

  getPrivateObjectDir(): string {
    return this.prefix;
  }

  async uploadBuffer(buffer: Buffer, key: string, contentType: string): Promise<string> {
    const userKey = this.getUserKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: userKey,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return userKey;
  }

  async downloadBuffer(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    if (!response.Body) {
      throw new Error("Empty response body");
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async getSignedDownloadUrl(key: string, ttlSec: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: ttlSec });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }
}

// Dropbox Storage Backend
export interface DropboxCredentials {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date | null;
  onTokenRefresh?: (newAccessToken: string, expiresAt: Date) => Promise<void>;
}

export class DropboxStorageBackend implements IStorageBackend {
  private accessToken: string;
  private refreshToken?: string;
  private tokenExpiresAt?: Date | null;
  private userId: string;
  private basePath: string;
  private onTokenRefresh?: (newAccessToken: string, expiresAt: Date) => Promise<void>;

  constructor(userId: string, credentials: DropboxCredentials) {
    this.userId = userId;
    this.accessToken = credentials.accessToken;
    this.refreshToken = credentials.refreshToken;
    // Normalize tokenExpiresAt to Date (handles string, number, Date, or null)
    this.tokenExpiresAt = this.parseExpiryDate(credentials.tokenExpiresAt);
    this.onTokenRefresh = credentials.onTokenRefresh;
    // Use flat folder structure - all documents go directly into /FairSign
    this.basePath = `/FairSign`;
  }

  private parseExpiryDate(value: Date | string | number | null | undefined): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === "number") return new Date(value);
    if (typeof value === "string") {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }

  private async ensureValidToken(): Promise<void> {
    // Check if token needs refresh (5 min buffer before expiry)
    if (!this.refreshToken) return;
    
    const expiresAt = this.tokenExpiresAt;
    if (!expiresAt || isNaN(expiresAt.getTime())) {
      // No valid expiry, attempt refresh as precaution
      await this.refreshAccessToken();
      return;
    }
    
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    if (Date.now() > expiresAt.getTime() - bufferMs) {
      await this.refreshAccessToken();
    }
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error("No refresh token available for token refresh");
    }

    const appKey = process.env.DROPBOX_APP_KEY;
    const appSecret = process.env.DROPBOX_APP_SECRET;
    if (!appKey || !appSecret) {
      throw new Error("Dropbox credentials not configured");
    }

    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
      client_id: appKey,
      client_secret: appSecret,
    });

    const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh Dropbox token: ${error}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    
    const expiresAt = new Date(Date.now() + (data.expires_in || 14400) * 1000);
    this.tokenExpiresAt = expiresAt;

    // Notify caller to persist the new token
    if (this.onTokenRefresh) {
      await this.onTokenRefresh(this.accessToken, expiresAt);
    }
  }

  private async makeAuthenticatedRequest(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    await this.ensureValidToken();
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        "Authorization": `Bearer ${this.accessToken}`,
      },
    });

    // Handle expired token response
    if (response.status === 401 && this.refreshToken) {
      await this.refreshAccessToken();
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          "Authorization": `Bearer ${this.accessToken}`,
        },
      });
    }

    return response;
  }

  getPrivateObjectDir(): string {
    return this.basePath;
  }

  private getFullPath(key: string): string {
    // Normalize path - Dropbox paths must start with /
    const cleanKey = key.startsWith("/") ? key.slice(1) : key;
    return `${this.basePath}/${cleanKey}`;
  }

  async uploadBuffer(buffer: Buffer, key: string, contentType: string): Promise<string> {
    const path = this.getFullPath(key);
    
    const response = await this.makeAuthenticatedRequest(
      "https://content.dropboxapi.com/2/files/upload",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({
            path,
            mode: "overwrite",
            autorename: false,
            mute: true,
          }),
        },
        body: new Uint8Array(buffer),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Dropbox upload failed: ${error}`);
    }

    const result = await response.json();
    return result.path_display || path;
  }

  async downloadBuffer(key: string): Promise<Buffer> {
    const path = key.startsWith("/") ? key : this.getFullPath(key);
    
    const response = await this.makeAuthenticatedRequest(
      "https://content.dropboxapi.com/2/files/download",
      {
        method: "POST",
        headers: {
          "Dropbox-API-Arg": JSON.stringify({ path }),
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Dropbox download failed: ${error}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async getSignedDownloadUrl(key: string, ttlSec: number): Promise<string> {
    const path = key.startsWith("/") ? key : this.getFullPath(key);
    
    const response = await this.makeAuthenticatedRequest(
      "https://api.dropboxapi.com/2/files/get_temporary_link",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Dropbox get temporary link failed: ${error}`);
    }

    const result = await response.json();
    return result.link;
  }

  async exists(key: string): Promise<boolean> {
    const path = key.startsWith("/") ? key : this.getFullPath(key);
    
    try {
      const response = await this.makeAuthenticatedRequest(
        "https://api.dropboxapi.com/2/files/get_metadata",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path }),
        }
      );

      return response.ok;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const path = key.startsWith("/") ? key : this.getFullPath(key);
    
    const response = await this.makeAuthenticatedRequest(
      "https://api.dropboxapi.com/2/files/delete_v2",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Dropbox delete failed: ${error}`);
    }
  }
}

// Box Storage Backend
export interface BoxCredentials {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date | null;
  onTokenRefresh?: (newAccessToken: string, newRefreshToken: string | undefined, expiresAt: Date) => Promise<void>;
}

export class BoxStorageBackend implements IStorageBackend {
  private accessToken: string;
  private refreshToken?: string;
  private tokenExpiresAt?: Date | null;
  private userId: string;
  private basePath: string;
  private folderId: string | null = null;
  private onTokenRefresh?: (newAccessToken: string, newRefreshToken: string | undefined, expiresAt: Date) => Promise<void>;

  constructor(userId: string, credentials: BoxCredentials) {
    this.userId = userId;
    this.accessToken = credentials.accessToken;
    this.refreshToken = credentials.refreshToken;
    this.tokenExpiresAt = this.parseExpiryDate(credentials.tokenExpiresAt);
    this.onTokenRefresh = credentials.onTokenRefresh;
    // Use flat folder structure - all documents go directly into /FairSign
    this.basePath = "FairSign";
  }

  private parseExpiryDate(value: Date | string | number | null | undefined): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === "number") return new Date(value);
    if (typeof value === "string") {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }

  private async ensureValidToken(): Promise<void> {
    if (!this.refreshToken) return;
    
    const expiresAt = this.tokenExpiresAt;
    if (!expiresAt || isNaN(expiresAt.getTime())) {
      await this.refreshAccessToken();
      return;
    }
    
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    if (Date.now() > expiresAt.getTime() - bufferMs) {
      await this.refreshAccessToken();
    }
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error("No refresh token available for token refresh");
    }

    const clientId = process.env.BOX_CLIENT_ID;
    const clientSecret = process.env.BOX_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Box credentials not configured");
    }

    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await fetch("https://api.box.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh Box token: ${error}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    // Box rotates refresh tokens - save the new one
    const newRefreshToken = data.refresh_token;
    if (newRefreshToken) {
      this.refreshToken = newRefreshToken;
    }
    
    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
    this.tokenExpiresAt = expiresAt;

    if (this.onTokenRefresh) {
      await this.onTokenRefresh(this.accessToken, newRefreshToken, expiresAt);
    }
  }

  private async makeAuthenticatedRequest(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    await this.ensureValidToken();
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        "Authorization": `Bearer ${this.accessToken}`,
      },
    });

    if (response.status === 401 && this.refreshToken) {
      await this.refreshAccessToken();
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          "Authorization": `Bearer ${this.accessToken}`,
        },
      });
    }

    return response;
  }

  private async ensureFolderExists(): Promise<string> {
    if (this.folderId) return this.folderId;

    // Search for existing FairSign folder in root (folder_id=0)
    const searchResponse = await this.makeAuthenticatedRequest(
      `https://api.box.com/2.0/folders/0/items?fields=id,name,type`,
      { method: "GET" }
    );

    if (searchResponse.ok) {
      const data = await searchResponse.json();
      const existing = data.entries?.find(
        (item: any) => item.type === "folder" && item.name === this.basePath
      );
      if (existing) {
        this.folderId = existing.id;
        return existing.id;
      }
    }

    // Create folder if not exists
    const createResponse = await this.makeAuthenticatedRequest(
      "https://api.box.com/2.0/folders",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: this.basePath,
          parent: { id: "0" },
        }),
      }
    );

    if (!createResponse.ok) {
      const error = await createResponse.text();
      // Check if folder already exists (conflict)
      if (createResponse.status === 409) {
        const conflictData = JSON.parse(error);
        if (conflictData.context_info?.conflicts?.[0]?.id) {
          const conflictId = conflictData.context_info.conflicts[0].id;
          this.folderId = conflictId;
          return conflictId;
        }
      }
      throw new Error(`Failed to create Box folder: ${error}`);
    }

    const folderData = await createResponse.json();
    const newFolderId = folderData.id;
    this.folderId = newFolderId;
    return newFolderId;
  }

  private async findFileByName(filename: string, folderId: string): Promise<string | null> {
    const response = await this.makeAuthenticatedRequest(
      `https://api.box.com/2.0/folders/${folderId}/items?fields=id,name,type`,
      { method: "GET" }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const file = data.entries?.find(
      (item: any) => item.type === "file" && item.name === filename
    );
    return file?.id || null;
  }

  getPrivateObjectDir(): string {
    return `/${this.basePath}`;
  }

  async uploadBuffer(buffer: Buffer, key: string, contentType: string): Promise<string> {
    const folderId = await this.ensureFolderExists();
    const filename = key.includes("/") ? key.split("/").pop()! : key;

    // Check if file already exists
    const existingFileId = await this.findFileByName(filename, folderId);

    if (existingFileId) {
      // Upload new version
      const formData = new FormData();
      const uint8Array = new Uint8Array(buffer);
      formData.append("file", new Blob([uint8Array], { type: contentType }), filename);

      const response = await this.makeAuthenticatedRequest(
        `https://upload.box.com/api/2.0/files/${existingFileId}/content`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Box upload (new version) failed: ${error}`);
      }

      const result = await response.json();
      return result.entries?.[0]?.id || existingFileId;
    } else {
      // Upload new file
      const formData = new FormData();
      formData.append(
        "attributes",
        JSON.stringify({
          name: filename,
          parent: { id: folderId },
        })
      );
      const uint8Array = new Uint8Array(buffer);
      formData.append("file", new Blob([uint8Array], { type: contentType }), filename);

      const response = await this.makeAuthenticatedRequest(
        "https://upload.box.com/api/2.0/files/content",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Box upload failed: ${error}`);
      }

      const result = await response.json();
      return result.entries?.[0]?.id || filename;
    }
  }

  async downloadBuffer(key: string): Promise<Buffer> {
    // Key could be a file ID or filename
    let fileId = key;
    
    // If it looks like a filename, find the file ID
    if (key.includes(".") || key.includes("/")) {
      const folderId = await this.ensureFolderExists();
      const filename = key.includes("/") ? key.split("/").pop()! : key;
      const foundId = await this.findFileByName(filename, folderId);
      if (!foundId) {
        throw new Error(`File not found: ${key}`);
      }
      fileId = foundId;
    }

    const response = await this.makeAuthenticatedRequest(
      `https://api.box.com/2.0/files/${fileId}/content`,
      { method: "GET" }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Box download failed: ${error}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async getSignedDownloadUrl(key: string, ttlSec: number): Promise<string> {
    // Key could be a file ID or filename
    let fileId = key;
    
    if (key.includes(".") || key.includes("/")) {
      const folderId = await this.ensureFolderExists();
      const filename = key.includes("/") ? key.split("/").pop()! : key;
      const foundId = await this.findFileByName(filename, folderId);
      if (!foundId) {
        throw new Error(`File not found: ${key}`);
      }
      fileId = foundId;
    }

    // Box doesn't have direct temporary links, use shared link with expiration
    const response = await this.makeAuthenticatedRequest(
      `https://api.box.com/2.0/files/${fileId}?fields=shared_link`,
      { method: "GET" }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Box get shared link failed: ${error}`);
    }

    const fileData = await response.json();
    
    // If no shared link exists, create one
    if (!fileData.shared_link) {
      const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
      const createLinkResponse = await this.makeAuthenticatedRequest(
        `https://api.box.com/2.0/files/${fileId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shared_link: {
              access: "open",
              unshared_at: expiresAt,
            },
          }),
        }
      );

      if (!createLinkResponse.ok) {
        const error = await createLinkResponse.text();
        throw new Error(`Box create shared link failed: ${error}`);
      }

      const updatedFile = await createLinkResponse.json();
      return updatedFile.shared_link?.download_url || updatedFile.shared_link?.url;
    }

    return fileData.shared_link.download_url || fileData.shared_link.url;
  }

  async exists(key: string): Promise<boolean> {
    try {
      const folderId = await this.ensureFolderExists();
      const filename = key.includes("/") ? key.split("/").pop()! : key;
      const fileId = await this.findFileByName(filename, folderId);
      return fileId !== null;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    let fileId = key;
    
    if (key.includes(".") || key.includes("/")) {
      const folderId = await this.ensureFolderExists();
      const filename = key.includes("/") ? key.split("/").pop()! : key;
      const foundId = await this.findFileByName(filename, folderId);
      if (!foundId) {
        return; // File doesn't exist, nothing to delete
      }
      fileId = foundId;
    }

    const response = await this.makeAuthenticatedRequest(
      `https://api.box.com/2.0/files/${fileId}`,
      { method: "DELETE" }
    );

    if (!response.ok && response.status !== 404) {
      const error = await response.text();
      throw new Error(`Box delete failed: ${error}`);
    }
  }
}

// Create user-specific storage backend based on provider preference
export interface ExternalStorageConfig {
  dropboxCredentials?: DropboxCredentials;
  boxCredentials?: BoxCredentials;
}

export function createUserStorageBackend(
  context: UserStorageContext, 
  customS3Credentials?: CustomS3Credentials,
  dropboxCredentials?: DropboxCredentials,
  boxCredentials?: BoxCredentials
): IStorageBackend {
  switch (context.provider) {
    case "fairsign":
      if (process.env.S3_ENDPOINT && process.env.S3_BUCKET) {
        return new UserS3StorageBackend(context.userId);
      }
      return getStorageBackend();
    case "custom_s3":
      if (!customS3Credentials) {
        throw new Error("Custom S3 storage requires credentials to be configured.");
      }
      return new UserCustomS3StorageBackend(context.userId, customS3Credentials);
    case "dropbox":
      if (!dropboxCredentials) {
        throw new Error("Dropbox storage requires OAuth credentials to be configured.");
      }
      return new DropboxStorageBackend(context.userId, dropboxCredentials);
    case "box":
      if (!boxCredentials) {
        throw new Error("Box storage requires OAuth credentials to be configured.");
      }
      return new BoxStorageBackend(context.userId, boxCredentials);
    case "google_drive":
      throw new Error(`External storage provider ${context.provider} not yet implemented.`);
    default:
      return getStorageBackend();
  }
}

// Check if S3 storage is configured
export function isS3StorageAvailable(): boolean {
  return !!(
    process.env.S3_ENDPOINT &&
    process.env.S3_BUCKET &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY
  );
}

// Helper type for user storage with credentials loader
export interface UserStorageConfig {
  userId: string;
  provider: StorageProvider;
  customS3Credentials?: CustomS3Credentials;
}

// Create user storage with auto-loaded credentials
// Note: The caller is responsible for loading and decrypting credentials
// from the database before calling this function when provider is 'custom_s3'
export async function createUserStorageBackendWithCredentials(
  config: UserStorageConfig
): Promise<IStorageBackend> {
  return createUserStorageBackend(
    { userId: config.userId, provider: config.provider },
    config.customS3Credentials
  );
}
