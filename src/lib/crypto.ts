/**
 * Utility functions for cryptographic operations in the frontend
 */

/**
 * Hash a string using SHA-256
 * @param message - The message to hash
 * @returns Promise<string> - The hexadecimal hash
 */
export const sha256 = async (message: string): Promise<string> => {
  try {
    // Use Web Crypto API if available
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    // Fallback for environments without Web Crypto API
    // This is a simple hash function - in production, you might want to use a more robust library
    let hash = 0;
    if (message.length === 0) return hash.toString(16);
    
    for (let i = 0; i < message.length; i++) {
      const char = message.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(16);
  } catch (error) {
    console.error('Error hashing message:', error);
    throw new Error('Failed to hash message', { cause: error });
  }
};

/**
 * Generate a random alphanumeric string
 * @param length - The length of the string to generate
 * @returns string - Random alphanumeric string
 */
export const generateRandomString = (length: number): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    // Use secure random if available
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(array[i] % chars.length);
    }
  } else {
    // Fallback to Math.random (less secure)
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  
  return result;
};

/**
 * Validate if a string is a valid hexadecimal hash
 * @param hash - The hash to validate
 * @returns boolean - True if valid hex hash
 */
export const isValidHex = (hash: string): boolean => {
  return /^[a-f0-9]+$/i.test(hash);
};

// ============================================================================
// AES-GCM Encryption for IndexedDB mail storage
// ============================================================================

const ENC_PREFIX = 'mv.enc$';
const KEY_STORAGE_KEY = 'mv-enc-key';

/**
 * Convert a Uint8Array to a base64 string in chunks.
 * `String.fromCharCode(...bytes)` spreads all bytes onto the call stack and
 * blows up (stack overflow) for large payloads like encrypted mail bodies.
 * Chunking keeps the operation safe for any size.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK_SIZE = 0x8000; // 32768 bytes per chunk — safe call-stack size
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

/**
 * Derive or retrieve the per-user encryption key.
 * Key is stored in localStorage so it survives tab close / page refresh.
 * It is destroyed on logout when localStorage.clear() is called.
 *
 * SECURITY NOTE (known trade-off): the key lives in localStorage, so any XSS
 * can read it and decrypt locally stored mail. Accepting this for now to keep
 * offline data readable across reloads; revisit if stricter protection is
 * required (e.g. derive the key from the session).
 */
async function getEncryptionKey(): Promise<CryptoKey> {
  let rawKey = localStorage.getItem(KEY_STORAGE_KEY);

  if (!rawKey) {
    // Generate a new 256-bit key and persist
    const keyBytes = new Uint8Array(32);
    crypto.getRandomValues(keyBytes);
    rawKey = bytesToBase64(keyBytes);
    localStorage.setItem(KEY_STORAGE_KEY, rawKey);
  }

  const keyBuffer = Uint8Array.from(atob(rawKey), c => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', keyBuffer, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/**
 * Encrypt a string using AES-256-GCM.
 * Returns: mv.enc$<iv_b64>:<ciphertext_b64>
 */
export async function encryptData(plaintext: string): Promise<string> {
  if (!plaintext) return plaintext;
  try {
    const key = await getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    const ivB64 = bytesToBase64(iv);
    const cipherB64 = bytesToBase64(new Uint8Array(cipherBuffer));
    return `${ENC_PREFIX}${ivB64}:${cipherB64}`;
  } catch {
    // Fallback: return plain if crypto fails (e.g. insecure context)
    return plaintext;
  }
}

/**
 * Decrypt a string encrypted with encryptData.
 */
export async function decryptData(ciphertext: string): Promise<string> {
  if (!ciphertext || !ciphertext.startsWith(ENC_PREFIX)) return ciphertext;
  try {
    const key = await getEncryptionKey();
    const body = ciphertext.substring(ENC_PREFIX.length);
    const [ivB64, dataB64] = body.split(':');
    if (!ivB64 || !dataB64) return ciphertext;
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch {
    return ciphertext; // Return as-is if decryption fails
  }
}

/**
 * Check if a string is encrypted with our format.
 */
export function isEncryptedData(value: string): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/**
 * Encrypt sensitive fields of an inbox mail record before storing in IndexedDB.
 */
export async function encryptMailRecord<T extends object>(
  record: T,
  fieldsToEncrypt: (keyof T)[]
): Promise<T> {
  const encrypted = { ...record };
  for (const field of fieldsToEncrypt) {
    const value = encrypted[field];
    if (typeof value === 'string' && value.length > 0) {
      (encrypted as Record<string, unknown>)[field as string] = await encryptData(value);
    }
  }
  return encrypted;
}

/**
 * Decrypt sensitive fields of an inbox mail record after reading from IndexedDB.
 */
export async function decryptMailRecord<T extends object>(
  record: T,
  fieldsToDecrypt: (keyof T)[]
): Promise<T> {
  const decrypted = { ...record };
  for (const field of fieldsToDecrypt) {
    const value = decrypted[field];
    if (typeof value === 'string' && isEncryptedData(value)) {
      (decrypted as Record<string, unknown>)[field as string] = await decryptData(value);
    }
  }
  return decrypted;
}
