import crypto from 'crypto';

type TotpAlgorithm = 'sha1' | 'sha256' | 'sha512';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const sanitizeBase32 = (value: string): string =>
  value.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();

const timingSafeEqual = (a: string, b: string): boolean => {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
};

const base32Encode = (data: Buffer): string => {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0b11111];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0b11111];
  }

  return output;
};

const base32Decode = (value: string): Buffer => {
  const normalized = sanitizeBase32(value);
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('Invalid base32 secret.');
    }

    buffer = (buffer << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
};

const resolveAlgorithm = (algorithm: string): TotpAlgorithm => {
  const normalized = algorithm.toLowerCase();
  if (normalized === 'sha1' || normalized === 'sha256' || normalized === 'sha512') {
    return normalized;
  }
  throw new Error(`Unsupported TOTP algorithm: ${algorithm}`);
};

const generateCodeForCounter = (
  secret: string,
  counter: bigint,
  digits: number,
  algorithm: TotpAlgorithm
): string => {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);

  const hmac = crypto.createHmac(algorithm, key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;

  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, '0');
};

export const generateTotpSecret = (byteLength = 20): string => {
  return base32Encode(crypto.randomBytes(byteLength));
};

export const generateOtpAuthUrl = (input: {
  issuer: string;
  label: string;
  secret: string;
  algorithm?: 'SHA1' | 'SHA256' | 'SHA512';
  digits?: number;
  period?: number;
}): string => {
  const algorithm = input.algorithm ?? 'SHA1';
  const digits = input.digits ?? 6;
  const period = input.period ?? 30;

  const pathLabel = encodeURIComponent(`${input.issuer}:${input.label}`);
  const query = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm,
    digits: String(digits),
    period: String(period),
  });

  return `otpauth://totp/${pathLabel}?${query.toString()}`;
};

export const generateTotpCode = (input: {
  secret: string;
  timestampMs?: number;
  period?: number;
  digits?: number;
  algorithm?: 'SHA1' | 'SHA256' | 'SHA512';
}): string => {
  const timestampMs = input.timestampMs ?? Date.now();
  const period = input.period ?? 30;
  const digits = input.digits ?? 6;
  const algorithm = resolveAlgorithm(input.algorithm ?? 'SHA1');

  const counter = BigInt(Math.floor(timestampMs / (period * 1000)));
  return generateCodeForCounter(input.secret, counter, digits, algorithm);
};

export const verifyTotpCode = (input: {
  secret: string;
  code: string;
  timestampMs?: number;
  period?: number;
  digits?: number;
  algorithm?: 'SHA1' | 'SHA256' | 'SHA512';
  window?: number;
}): boolean => {
  const normalizedCode = input.code.replace(/\s+/g, '');
  const timestampMs = input.timestampMs ?? Date.now();
  const period = input.period ?? 30;
  const digits = input.digits ?? 6;
  const window = input.window ?? 1;
  const algorithm = resolveAlgorithm(input.algorithm ?? 'SHA1');

  const currentCounter = BigInt(Math.floor(timestampMs / (period * 1000)));

  for (let delta = -window; delta <= window; delta += 1) {
    const candidateCounter = currentCounter + BigInt(delta);
    if (candidateCounter < 0n) continue;

    const candidate = generateCodeForCounter(input.secret, candidateCounter, digits, algorithm);
    if (timingSafeEqual(candidate, normalizedCode)) {
      return true;
    }
  }

  return false;
};
