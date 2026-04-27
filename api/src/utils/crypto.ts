import crypto from 'node:crypto';
import { config } from './config.js';

// Format: enc.v1$<iv_b64>:<tag_b64>:<cipher_b64>
const PREFIX = 'enc.v1$';
const TOTP_PREFIX = 'enc.totp.v1$';

const getPwdKey = (): Buffer => {
  // Derive a 32-byte key from PWD_SECRET using SHA-256
  // Note: For higher security, consider using scrypt with a static app salt.
  return crypto.createHash('sha256').update(config.pwdSecret).digest();
};

const getTotpKey = (): Buffer =>
  crypto.createHash('sha256').update(config.twoFactor.encryptionKey).digest();

const encryptWithKeyAndPrefix = (plain: string, key: Buffer, prefix: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${prefix}${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
};

const decryptWithKeyAndPrefix = (payload: string, key: Buffer, prefix: string): string => {
  if (!payload.startsWith(prefix)) {
    throw new Error('Value is not in encrypted format');
  }
  const body = payload.substring(prefix.length);
  const [ivB64, tagB64, dataB64] = body.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted payload');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
};

export const isEncrypted = (val: unknown): val is string =>
  typeof val === 'string' && val.startsWith(PREFIX);

export const isTotpEncrypted = (val: unknown): val is string =>
  typeof val === 'string' && val.startsWith(TOTP_PREFIX);

export function encrypt(plain: string): string {
  return encryptWithKeyAndPrefix(plain, getPwdKey(), PREFIX);
}

export function decrypt(payload: string): string {
  return decryptWithKeyAndPrefix(payload, getPwdKey(), PREFIX);
}

export function tryDecrypt(value: string | null | undefined): string | null | undefined {
  if (typeof value !== 'string') return value;
  if (!isEncrypted(value)) return value;
  try {
    return decrypt(value);
  } catch {
    return null; // decryption failed; treat as missing
  }
}

export function encryptTotpSecret(plain: string): string {
  return encryptWithKeyAndPrefix(plain, getTotpKey(), TOTP_PREFIX);
}

export function decryptTotpSecret(payload: string): string {
  return decryptWithKeyAndPrefix(payload, getTotpKey(), TOTP_PREFIX);
}
