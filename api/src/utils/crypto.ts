import crypto from 'node:crypto';
import { config } from './config.js';

// Format: enc.v1$<iv_b64>:<tag_b64>:<cipher_b64>
const PREFIX = 'enc.v1$';

const getKey = (): Buffer => {
  // Derive a 32-byte key from PWD_SECRET using SHA-256
  // Note: For higher security, consider using scrypt with a static app salt.
  return crypto.createHash('sha256').update(config.pwdSecret).digest();
};

export const isEncrypted = (val: unknown): val is string =>
  typeof val === 'string' && val.startsWith(PREFIX);

export function encrypt(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // GCM recommended IV length
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
  return out;
}

export function decrypt(payload: string): string {
  if (!isEncrypted(payload)) {
    throw new Error('Value is not in encrypted format');
  }
  const key = getKey();
  const body = payload.substring(PREFIX.length);
  const [ivB64, tagB64, dataB64] = body.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted payload');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  return dec;
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
