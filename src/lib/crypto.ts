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
    throw new Error('Failed to hash message');
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
