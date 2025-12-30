const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const rawKey = await crypto.subtle.exportKey("raw", key);
  return arrayBufferToBase64(rawKey);
}

export async function importKey(keyBase64: string): Promise<CryptoKey> {
  const rawKey = base64ToArrayBuffer(keyBase64);
  return crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function deriveKeyFromPassword(
  password: string,
  salt: string
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const saltBuffer = base64ToArrayBuffer(salt);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new Uint8Array(saltBuffer),
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );
}

export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return arrayBufferToBase64(salt);
}

function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

export async function encryptData(
  data: ArrayBuffer,
  key: CryptoKey
): Promise<{ encrypted: ArrayBuffer; iv: string }> {
  const iv = generateIV();
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as BufferSource },
    key,
    data
  );
  return {
    encrypted,
    iv: arrayBufferToBase64(iv),
  };
}

export async function decryptData(
  encryptedData: ArrayBuffer,
  key: CryptoKey,
  ivBase64: string
): Promise<ArrayBuffer> {
  const ivBuffer = base64ToArrayBuffer(ivBase64);
  return crypto.subtle.decrypt(
    { name: ALGORITHM, iv: new Uint8Array(ivBuffer) },
    key,
    encryptedData
  );
}

export async function encryptFile(
  file: File,
  key: CryptoKey
): Promise<{ encryptedBlob: Blob; iv: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const { encrypted, iv } = await encryptData(arrayBuffer, key);
  return {
    encryptedBlob: new Blob([encrypted], { type: "application/octet-stream" }),
    iv,
  };
}

export async function decryptBlob(
  encryptedBlob: Blob,
  key: CryptoKey,
  ivBase64: string,
  originalType: string
): Promise<Blob> {
  const encryptedData = await encryptedBlob.arrayBuffer();
  const decryptedData = await decryptData(encryptedData, key, ivBase64);
  return new Blob([decryptedData], { type: originalType });
}

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

const ENCRYPTION_KEY_STORAGE = "fairsign_encryption_key";
const ENCRYPTION_SALT_STORAGE = "fairsign_encryption_salt";

export function storeEncryptionKey(keyBase64: string): void {
  sessionStorage.setItem(ENCRYPTION_KEY_STORAGE, keyBase64);
}

export function getStoredEncryptionKey(): string | null {
  return sessionStorage.getItem(ENCRYPTION_KEY_STORAGE);
}

export function clearStoredEncryptionKey(): void {
  sessionStorage.removeItem(ENCRYPTION_KEY_STORAGE);
  sessionStorage.removeItem(ENCRYPTION_SALT_STORAGE);
}

export function storeEncryptionSalt(salt: string): void {
  sessionStorage.setItem(ENCRYPTION_SALT_STORAGE, salt);
}

export function getStoredEncryptionSalt(): string | null {
  return sessionStorage.getItem(ENCRYPTION_SALT_STORAGE);
}

export interface EncryptionStatus {
  hasKey: boolean;
  salt: string | null;
}

export function getEncryptionStatus(): EncryptionStatus {
  return {
    hasKey: !!getStoredEncryptionKey(),
    salt: getStoredEncryptionSalt(),
  };
}
