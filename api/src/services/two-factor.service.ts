import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import pool from '../db/index.js';
import { config } from '../utils/config.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { decryptTotpSecret, encryptTotpSecret } from '../utils/crypto.js';
import { generateOtpAuthUrl, generateTotpSecret, verifyTotpCode } from '../utils/totp.js';
import {
  assertWithinRateLimit,
  clearRateLimitState,
  recordRateLimitFailure,
  type RateLimitIdentity,
} from './auth-rate-limit.service.js';
import {
  deleteUserSetting,
  getUserSettingJSON,
  setUserSettingJSON,
} from './user-settings.service.js';
import { generateOTP, hashOTP, sendTwoFactorLoginOTPEmail } from './email.service.js';

interface UserRecord {
  id: number;
  username: string;
  email: string;
  password_hash: string;
}

interface UserProfile {
  id: number;
  username: string;
  email: string;
}

interface TwoFactorConfigSetting {
  enabled: boolean;
  secretEnc: string;
  issuer: string;
  label: string;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: number;
  period: number;
  updatedAt: string;
}

interface TwoFactorRecoveryCodesSetting {
  version: number;
  codes: string[];
  generatedAt: string;
  updatedAt: string;
}

interface TwoFactorLoginPayload {
  purpose: 'two-factor-login';
  userId: number;
  username: string;
  email: string;
  nonce: string;
  iat?: number;
  exp?: number;
}

interface TwoFactorSetupPayload {
  purpose: 'two-factor-setup';
  userId: number;
  username: string;
  email: string;
  secretEnc: string;
  nonce: string;
  iat?: number;
  exp?: number;
}

interface TwoFactorOtpPayload {
  purpose: 'two-factor-login-email-otp';
  userId: number;
  username: string;
  email: string;
  hashedOtp: string;
  nonce: string;
  twoFactorNonce: string;
  iat?: number;
  exp?: number;
}

export interface TwoFactorStatus {
  enabled: boolean;
  hasSetup: boolean;
  method: 'totp' | null;
}

export interface TwoFactorLoginChallenge {
  requiresTwoFactor: true;
  twoFactorToken: string;
  twoFactorEmail: string;
  methods: ['authenticator', 'email_otp', 'recovery_code'];
  message: string;
  expiresAt: string;
}

export interface TwoFactorSetupInitResult {
  setupToken: string;
  otpauthUrl: string;
  manualKey: string;
  qrDataUrl: string | null;
  expiresAt: string;
}

export interface TwoFactorSetupVerifyResult {
  enabled: true;
  message: string;
  recoveryCodes: string[];
  generatedAt: string;
}

export interface TwoFactorRecoveryCodesResult {
  recoveryCodes: string[];
  generatedAt: string;
}

export interface TwoFactorOtpRequestResult {
  otpChallengeToken: string;
  email: string;
  resendAvailableInSec: number;
  expiresAt: string;
}

const TWO_FACTOR_CONFIG_KEY = 'two_factor_config';
const TWO_FACTOR_RECOVERY_CODES_KEY = 'two_factor_recovery_codes';
const LOGIN_METHODS: ['authenticator', 'email_otp', 'recovery_code'] = [
  'authenticator',
  'email_otp',
  'recovery_code',
];

const RATE_LIMIT_SCOPES = {
  loginTotpVerify: 'login-2fa-totp-verify',
  loginOtpRequest: 'login-2fa-otp-request',
  loginOtpVerify: 'login-2fa-otp-verify',
  loginRecoveryVerify: 'login-2fa-recovery-verify',
  loginOtpResend: 'login-2fa-otp-resend',
} as const;

const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const timingSafeEqual = (a: string, b: string): boolean => {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
};

const normalizeIp = (ipAddress: string): string => {
  const raw = (ipAddress || '').trim();
  if (!raw) return 'unknown';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
};

const makeRateLimitIdentity = (scope: string, subjectKey: string, ipAddress: string): RateLimitIdentity => ({
  scope,
  subjectKey,
  ipAddress: normalizeIp(ipAddress),
});

const createNonce = (): string => crypto.randomBytes(16).toString('hex');

const generateSetupQrDataUrl = async (otpAuthUrl: string): Promise<string> => {
  try {
    return await QRCode.toDataURL(otpAuthUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 280,
    });
  } catch (error: unknown) {
    logger.error('Failed to generate 2FA setup QR code', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError('Internal Server Error', 500, false, {
      general: 'Unable to generate QR code for two-factor setup.',
    });
  }
};

const getTokenExpiresAtISO = (ttlSec: number): string =>
  new Date(Date.now() + ttlSec * 1000).toISOString();

const verifyJwtToken = <T extends { purpose: string }>(
  token: string,
  expectedPurpose: T['purpose'],
  invalidMessage: string,
  expiredMessage: string
): T => {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as T;

    if (!decoded || decoded.purpose !== expectedPurpose) {
      throw new AppError('Unauthorized', 401, true, { general: invalidMessage });
    }

    return decoded;
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('Unauthorized', 401, true, { general: expiredMessage });
    }
    throw new AppError('Unauthorized', 401, true, { general: invalidMessage });
  }
};

const getUserById = async (userId: number): Promise<UserRecord | null> => {
  const client = await pool.connect();
  try {
    const result = await client.query<UserRecord>(
      `SELECT id, username, email, password_hash
       FROM users
       WHERE id = $1`,
      [userId]
    );

    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
};

const assertCurrentPassword = async (userId: number, currentPassword: string): Promise<UserRecord> => {
  if (!currentPassword?.trim()) {
    throw new AppError('Bad Request', 400, true, {
      currentPassword: 'Current password is required.',
    });
  }

  const user = await getUserById(userId);
  if (!user) {
    throw new AppError('Unauthorized', 401, true, { general: 'User not found.' });
  }

  const matches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!matches) {
    throw new AppError('Unauthorized', 401, true, {
      currentPassword: 'Current password is incorrect.',
    });
  }

  return user;
};

const getTwoFactorConfigSetting = async (userId: number): Promise<TwoFactorConfigSetting | null> => {
  const configSetting = await getUserSettingJSON<TwoFactorConfigSetting>(userId, TWO_FACTOR_CONFIG_KEY);
  if (!configSetting || !configSetting.enabled || !configSetting.secretEnc) {
    return null;
  }
  return configSetting;
};

const getRecoveryCodesSetting = async (userId: number): Promise<TwoFactorRecoveryCodesSetting | null> => {
  const recoverySetting = await getUserSettingJSON<TwoFactorRecoveryCodesSetting>(
    userId,
    TWO_FACTOR_RECOVERY_CODES_KEY
  );

  if (!recoverySetting || !Array.isArray(recoverySetting.codes)) {
    return null;
  }

  return recoverySetting;
};

const generateRecoveryCode = (): string => {
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    const randomIndex = crypto.randomInt(0, RECOVERY_CODE_ALPHABET.length);
    code += RECOVERY_CODE_ALPHABET[randomIndex];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
};

const normalizeRecoveryCode = (value: string): string =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, '');

const hashRecoveryCode = (userId: number, plainCode: string): string => {
  const normalized = normalizeRecoveryCode(plainCode);
  return crypto
    .createHash('sha256')
    .update(`${normalized}:${userId}:${config.jwtSecret}`)
    .digest('hex');
};

const generateRecoveryCodeSet = (userId: number): { plainCodes: string[]; hashedCodes: string[] } => {
  const plainCodes = Array.from({ length: config.twoFactor.recoveryCodeCount }, () => generateRecoveryCode());
  const hashedCodes = plainCodes.map((code) => hashRecoveryCode(userId, code));
  return { plainCodes, hashedCodes };
};

const assertOtpResendAllowed = async (userId: number, ipAddress: string): Promise<void> => {
  const client = await pool.connect();
  try {
    const identity = makeRateLimitIdentity(RATE_LIMIT_SCOPES.loginOtpResend, String(userId), ipAddress);

    const result = await client.query<{ updated_at: Date }>(
      `SELECT updated_at
       FROM auth_rate_limit_state
       WHERE scope = $1 AND subject_key = $2 AND ip_address = $3`,
      [identity.scope, identity.subjectKey, identity.ipAddress]
    );

    if (result.rows.length === 0) {
      return;
    }

    const nextAllowedAt = result.rows[0].updated_at.getTime() + config.twoFactor.otpResendIntervalSec * 1000;
    const now = Date.now();

    if (nextAllowedAt > now) {
      throw new AppError('Too many requests', 429, true, {
        retryAfterSec: Math.ceil((nextAllowedAt - now) / 1000),
        message: 'Please wait before requesting another OTP.',
      });
    }
  } finally {
    client.release();
  }
};

const markOtpResendTimestamp = async (userId: number, ipAddress: string): Promise<void> => {
  const client = await pool.connect();
  try {
    const identity = makeRateLimitIdentity(RATE_LIMIT_SCOPES.loginOtpResend, String(userId), ipAddress);

    await client.query(
      `INSERT INTO auth_rate_limit_state (
        scope,
        subject_key,
        ip_address,
        attempt_count,
        window_started_at,
        locked_until,
        updated_at
      ) VALUES ($1, $2, $3, 0, NOW(), NULL, NOW())
      ON CONFLICT (scope, subject_key, ip_address)
      DO UPDATE SET updated_at = NOW()`,
      [identity.scope, identity.subjectKey, identity.ipAddress]
    );
  } finally {
    client.release();
  }
};

const assertTwoFactorEnabled = async (userId: number): Promise<TwoFactorConfigSetting> => {
  const tfConfig = await getTwoFactorConfigSetting(userId);
  if (!tfConfig) {
    throw new AppError('Bad Request', 400, true, {
      general: 'Two-factor authentication is not enabled for this account.',
    });
  }
  return tfConfig;
};

const verifyTwoFactorLoginToken = (twoFactorToken: string): TwoFactorLoginPayload => {
  const payload = verifyJwtToken<TwoFactorLoginPayload>(
    twoFactorToken,
    'two-factor-login',
    'Invalid two-factor login token.',
    'Two-factor login token expired. Please log in again.'
  );

  if (!payload.userId || !payload.username || !payload.email || !payload.nonce) {
    throw new AppError('Unauthorized', 401, true, {
      general: 'Malformed two-factor login token.',
    });
  }

  return payload;
};

const verifyTwoFactorSetupToken = (setupToken: string): TwoFactorSetupPayload => {
  const payload = verifyJwtToken<TwoFactorSetupPayload>(
    setupToken,
    'two-factor-setup',
    'Invalid two-factor setup token.',
    'Two-factor setup token expired. Start setup again.'
  );

  if (!payload.userId || !payload.email || !payload.secretEnc || !payload.nonce) {
    throw new AppError('Unauthorized', 401, true, {
      general: 'Malformed two-factor setup token.',
    });
  }

  return payload;
};

const verifyTwoFactorOtpToken = (otpChallengeToken: string): TwoFactorOtpPayload => {
  const payload = verifyJwtToken<TwoFactorOtpPayload>(
    otpChallengeToken,
    'two-factor-login-email-otp',
    'Invalid email OTP challenge token.',
    'Email OTP challenge expired. Request a new OTP.'
  );

  if (!payload.userId || !payload.email || !payload.hashedOtp || !payload.nonce || !payload.twoFactorNonce) {
    throw new AppError('Unauthorized', 401, true, {
      general: 'Malformed email OTP challenge token.',
    });
  }

  return payload;
};

const resolveAuthenticatedUser = async (payload: TwoFactorLoginPayload): Promise<UserProfile> => {
  const user = await getUserById(payload.userId);
  if (!user) {
    throw new AppError('Unauthorized', 401, true, { general: 'User not found.' });
  }

  if (user.email !== payload.email || user.username !== payload.username) {
    throw new AppError('Unauthorized', 401, true, {
      general: 'User identity changed. Please sign in again.',
    });
  }

  return { id: user.id, username: user.username, email: user.email };
};

const recordAndThrowIfLocked = async (
  identity: RateLimitIdentity,
  baseMessage: string
): Promise<void> => {
  const failure = await recordRateLimitFailure(identity, config.authRateLimit);
  if (failure.locked) {
    throw new AppError(baseMessage, 429, true, {
      retryAfterSec: failure.retryAfterSec,
    });
  }
};

export const getTwoFactorStatus = async (userId: number): Promise<TwoFactorStatus> => {
  const setting = await getTwoFactorConfigSetting(userId);
  const enabled = !!setting;

  return {
    enabled,
    hasSetup: enabled,
    method: enabled ? 'totp' : null,
  };
};

export const createTwoFactorLoginChallenge = (user: {
  id: number;
  username: string;
  email: string;
}): TwoFactorLoginChallenge => {
  const nonce = createNonce();
  const ttlSec = config.twoFactor.loginTokenTtlSec;

  const twoFactorToken = jwt.sign(
    {
      purpose: 'two-factor-login',
      userId: user.id,
      username: user.username,
      email: user.email,
      nonce,
    } satisfies TwoFactorLoginPayload,
    config.jwtSecret,
    { expiresIn: `${ttlSec}s` }
  );

  return {
    requiresTwoFactor: true,
    twoFactorToken,
    twoFactorEmail: user.email,
    methods: [...LOGIN_METHODS],
    message: 'Two-factor verification required',
    expiresAt: getTokenExpiresAtISO(ttlSec),
  };
};

export const initTwoFactorSetup = async (
  userId: number,
  currentPassword?: string
): Promise<TwoFactorSetupInitResult> => {
  const user = await getUserById(userId);
  if (!user) {
    throw new AppError('Unauthorized', 401, true, { general: 'User not found.' });
  }

  const status = await getTwoFactorStatus(userId);
  if (status.enabled) {
    if (!currentPassword) {
      throw new AppError('Bad Request', 400, true, {
        currentPassword: 'Current password is required to reconfigure 2FA.',
      });
    }
    await assertCurrentPassword(userId, currentPassword);
  }

  const secret = generateTotpSecret(20);
  const secretEnc = encryptTotpSecret(secret);
  const nonce = createNonce();
  const ttlSec = config.twoFactor.setupTokenTtlSec;

  const setupToken = jwt.sign(
    {
      purpose: 'two-factor-setup',
      userId,
      username: user.username,
      email: user.email,
      secretEnc,
      nonce,
    } satisfies TwoFactorSetupPayload,
    config.jwtSecret,
    { expiresIn: `${ttlSec}s` }
  );

  const otpAuthUrl = generateOtpAuthUrl({
    issuer: config.twoFactor.issuer,
    label: user.email,
    secret,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });

  const qrDataUrl = await generateSetupQrDataUrl(otpAuthUrl);

  return {
    setupToken,
    otpauthUrl: otpAuthUrl,
    manualKey: secret,
    qrDataUrl,
    expiresAt: getTokenExpiresAtISO(ttlSec),
  };
};

export const verifyTwoFactorSetup = async (
  userId: number,
  setupToken: string,
  code: string
): Promise<TwoFactorSetupVerifyResult> => {
  const payload = verifyTwoFactorSetupToken(setupToken);

  if (payload.userId !== userId) {
    throw new AppError('Unauthorized', 401, true, {
      general: 'Setup token does not match this user.',
    });
  }

  const secret = decryptTotpSecret(payload.secretEnc);
  const codeValid = verifyTotpCode({
    secret,
    code,
    digits: 6,
    period: 30,
    algorithm: 'SHA1',
    window: 1,
  });

  if (!codeValid) {
    throw new AppError('Unauthorized', 401, true, {
      code: 'Invalid authenticator code.',
    });
  }

  const nowIso = new Date().toISOString();
  const twoFactorConfig: TwoFactorConfigSetting = {
    enabled: true,
    secretEnc: payload.secretEnc,
    issuer: config.twoFactor.issuer,
    label: payload.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    updatedAt: nowIso,
  };

  const recovery = generateRecoveryCodeSet(userId);
  const recoveryCodesSetting: TwoFactorRecoveryCodesSetting = {
    version: 1,
    codes: recovery.hashedCodes,
    generatedAt: nowIso,
    updatedAt: nowIso,
  };

  await setUserSettingJSON(userId, TWO_FACTOR_CONFIG_KEY, twoFactorConfig);
  await setUserSettingJSON(userId, TWO_FACTOR_RECOVERY_CODES_KEY, recoveryCodesSetting);

  return {
    enabled: true,
    message: 'Two-factor authentication enabled',
    recoveryCodes: recovery.plainCodes,
    generatedAt: nowIso,
  };
};

export const disableTwoFactor = async (userId: number, currentPassword: string): Promise<void> => {
  await assertCurrentPassword(userId, currentPassword);
  await deleteUserSetting(userId, TWO_FACTOR_CONFIG_KEY);
  await deleteUserSetting(userId, TWO_FACTOR_RECOVERY_CODES_KEY);
};

export const regenerateRecoveryCodes = async (
  userId: number,
  currentPassword: string
): Promise<TwoFactorRecoveryCodesResult> => {
  await assertCurrentPassword(userId, currentPassword);
  await assertTwoFactorEnabled(userId);

  const nowIso = new Date().toISOString();
  const recovery = generateRecoveryCodeSet(userId);

  await setUserSettingJSON(userId, TWO_FACTOR_RECOVERY_CODES_KEY, {
    version: 1,
    codes: recovery.hashedCodes,
    generatedAt: nowIso,
    updatedAt: nowIso,
  } satisfies TwoFactorRecoveryCodesSetting);

  return {
    recoveryCodes: recovery.plainCodes,
    generatedAt: nowIso,
  };
};

export const verifyTwoFactorAuthenticatorLogin = async (
  twoFactorToken: string,
  code: string,
  ipAddress: string
): Promise<UserProfile> => {
  const payload = verifyTwoFactorLoginToken(twoFactorToken);
  const identity = makeRateLimitIdentity(RATE_LIMIT_SCOPES.loginTotpVerify, String(payload.userId), ipAddress);

  await assertWithinRateLimit(
    identity,
    config.authRateLimit,
    'Too many authenticator attempts. Please try again later.'
  );

  const tfConfig = await assertTwoFactorEnabled(payload.userId);
  const secret = decryptTotpSecret(tfConfig.secretEnc);

  const codeValid = verifyTotpCode({
    secret,
    code,
    digits: tfConfig.digits,
    period: tfConfig.period,
    algorithm: tfConfig.algorithm,
    window: 1,
  });

  if (!codeValid) {
    await recordAndThrowIfLocked(identity, 'Too many authenticator attempts. Please try again later.');
    throw new AppError('Unauthorized', 401, true, { code: 'Invalid authenticator code.' });
  }

  await clearRateLimitState(identity);
  return resolveAuthenticatedUser(payload);
};

export const requestTwoFactorLoginOtp = async (
  twoFactorToken: string,
  ipAddress: string
): Promise<TwoFactorOtpRequestResult> => {
  const payload = verifyTwoFactorLoginToken(twoFactorToken);
  await assertTwoFactorEnabled(payload.userId);

  const requestIdentity = makeRateLimitIdentity(
    RATE_LIMIT_SCOPES.loginOtpRequest,
    String(payload.userId),
    ipAddress
  );

  await assertWithinRateLimit(
    requestIdentity,
    config.authRateLimit,
    'Too many OTP requests. Please try again later.'
  );

  await assertOtpResendAllowed(payload.userId, ipAddress);

  const attempt = await recordRateLimitFailure(requestIdentity, config.authRateLimit);
  if (attempt.locked) {
    throw new AppError('Too many OTP requests. Please try again later.', 429, true, {
      retryAfterSec: attempt.retryAfterSec,
    });
  }

  const otp = generateOTP();
  const hashedOtp = hashOTP(otp, payload.username);

  await sendTwoFactorLoginOTPEmail(payload.email, payload.username, otp);

  const nonce = createNonce();
  const ttlSec = config.twoFactor.otpTokenTtlSec;

  const otpChallengeToken = jwt.sign(
    {
      purpose: 'two-factor-login-email-otp',
      userId: payload.userId,
      username: payload.username,
      email: payload.email,
      hashedOtp,
      nonce,
      twoFactorNonce: payload.nonce,
    } satisfies TwoFactorOtpPayload,
    config.jwtSecret,
    { expiresIn: `${ttlSec}s` }
  );

  await markOtpResendTimestamp(payload.userId, ipAddress);

  return {
    otpChallengeToken,
    email: payload.email,
    resendAvailableInSec: config.twoFactor.otpResendIntervalSec,
    expiresAt: getTokenExpiresAtISO(ttlSec),
  };
};

export const verifyTwoFactorLoginOtp = async (
  twoFactorToken: string,
  otpChallengeToken: string,
  code: string,
  ipAddress: string
): Promise<UserProfile> => {
  const loginPayload = verifyTwoFactorLoginToken(twoFactorToken);
  const otpPayload = verifyTwoFactorOtpToken(otpChallengeToken);

  if (
    otpPayload.userId !== loginPayload.userId ||
    otpPayload.email !== loginPayload.email ||
    otpPayload.username !== loginPayload.username ||
    otpPayload.twoFactorNonce !== loginPayload.nonce
  ) {
    throw new AppError('Unauthorized', 401, true, {
      general: 'OTP challenge does not match this login session.',
    });
  }

  const verifyIdentity = makeRateLimitIdentity(
    RATE_LIMIT_SCOPES.loginOtpVerify,
    String(loginPayload.userId),
    ipAddress
  );

  await assertWithinRateLimit(
    verifyIdentity,
    config.authRateLimit,
    'Too many OTP verification attempts. Please try again later.'
  );

  const incomingHash = hashOTP(code, loginPayload.username);
  if (!timingSafeEqual(otpPayload.hashedOtp, incomingHash)) {
    await recordAndThrowIfLocked(verifyIdentity, 'Too many OTP verification attempts. Please try again later.');
    throw new AppError('Unauthorized', 401, true, { code: 'Invalid OTP code.' });
  }

  await clearRateLimitState(verifyIdentity);
  return resolveAuthenticatedUser(loginPayload);
};

export const verifyTwoFactorRecoveryCodeLogin = async (
  twoFactorToken: string,
  recoveryCode: string,
  ipAddress: string
): Promise<UserProfile> => {
  const loginPayload = verifyTwoFactorLoginToken(twoFactorToken);
  await assertTwoFactorEnabled(loginPayload.userId);

  const identity = makeRateLimitIdentity(
    RATE_LIMIT_SCOPES.loginRecoveryVerify,
    String(loginPayload.userId),
    ipAddress
  );

  await assertWithinRateLimit(
    identity,
    config.authRateLimit,
    'Too many recovery code attempts. Please try again later.'
  );

  const recoverySetting = await getRecoveryCodesSetting(loginPayload.userId);
  if (!recoverySetting || recoverySetting.codes.length === 0) {
    throw new AppError('Unauthorized', 401, true, {
      recoveryCode: 'No recovery codes available. Use authenticator or email OTP.',
    });
  }

  const incomingHash = hashRecoveryCode(loginPayload.userId, recoveryCode);
  const matchedIndex = recoverySetting.codes.findIndex((hash) => timingSafeEqual(hash, incomingHash));

  if (matchedIndex === -1) {
    await recordAndThrowIfLocked(identity, 'Too many recovery code attempts. Please try again later.');
    throw new AppError('Unauthorized', 401, true, {
      recoveryCode: 'Invalid recovery code.',
    });
  }

  recoverySetting.codes.splice(matchedIndex, 1);
  recoverySetting.updatedAt = new Date().toISOString();

  await setUserSettingJSON(loginPayload.userId, TWO_FACTOR_RECOVERY_CODES_KEY, recoverySetting);
  await clearRateLimitState(identity);

  logger.info(`Recovery code consumed for user ${loginPayload.userId}. Remaining: ${recoverySetting.codes.length}`);

  return resolveAuthenticatedUser(loginPayload);
};
