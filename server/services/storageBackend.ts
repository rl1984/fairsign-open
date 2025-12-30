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

// Create user-specific storage backend based on provider preference
export function createUserStorageBackend(context: UserStorageContext): IStorageBackend {
  switch (context.provider) {
    case "fairsign":
      if (process.env.S3_ENDPOINT && process.env.S3_BUCKET) {
        return new UserS3StorageBackend(context.userId);
      }
      return getStorageBackend();
    case "google_drive":
    case "dropbox":
    case "box":
      throw new Error(`External storage provider ${context.provider} not yet configured. Please connect your account first.`);
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
