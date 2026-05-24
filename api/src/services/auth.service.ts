import bcrypt from 'bcrypt';
import * as tokenService from './token.service.js';
import pool from '../db/index.js'; // Adjusted path and extension
import { AppError } from '../utils/errors.js'; // Custom error class
import { logger } from '../utils/logger.js';
import { generateOTP, hashOTP, sendOTPEmail } from './email.service.js';
import jwt from 'jsonwebtoken';
import { config } from '../utils/config.js';
import crypto from 'crypto';
import {
  clearRateLimitState,
  recordRateLimitFailure,
  assertWithinRateLimit,
} from './auth-rate-limit.service.js';
import {
  createTwoFactorLoginChallenge,
  disableTwoFactor,
  getTwoFactorStatus,
  initTwoFactorSetup,
  regenerateRecoveryCodes,
  requestTwoFactorLoginOtp,
  verifyTwoFactorAuthenticatorLogin,
  verifyTwoFactorLoginOtp,
  verifyTwoFactorRecoveryCodeLogin,
  verifyTwoFactorSetup,
  type TwoFactorLoginChallenge,
  type TwoFactorOtpRequestResult,
  type TwoFactorRecoveryCodesResult,
  type TwoFactorSetupInitResult,
  type TwoFactorSetupVerifyResult,
  type TwoFactorStatus,
} from './two-factor.service.js';

// Placeholder for user type/interface (ideally from models)
interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  session_version: number;
}

type AuthenticatedUser = Pick<User, 'id' | 'username' | 'email'>;

export interface LoginSuccessResult {
  requiresTwoFactor: false;
  token: string;
  user: AuthenticatedUser;
  message: string;
}

export type LoginResult = LoginSuccessResult | TwoFactorLoginChallenge;

interface PasswordResetChallengePayload {
  purpose: 'password-reset';
  username: string;
  hashedOTP: string;
  nonce: string;
  tabSessionId: string;
  iat?: number;
  exp?: number;
}

const PASSWORD_RESET_CHALLENGE_TTL_SECONDS = 10 * 60;

const timingSafeEqualString = (a: string, b: string): boolean => {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

const createPasswordResetChallenge = (
  username: string,
  hashedOTP: string,
  tabSessionId: string
): { token: string; expiresAt: string; nonce: string } => {
  const nonce = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign(
    {
      purpose: 'password-reset',
      username,
      hashedOTP,
      nonce,
      tabSessionId,
    } satisfies PasswordResetChallengePayload,
    config.jwtSecret,
    { expiresIn: `${PASSWORD_RESET_CHALLENGE_TTL_SECONDS}s` }
  );

  return {
    token,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_CHALLENGE_TTL_SECONDS * 1000).toISOString(),
    nonce,
  };
};

const verifyPasswordResetChallenge = (token: string): PasswordResetChallengePayload => {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as PasswordResetChallengePayload;

    if (!decoded || decoded.purpose !== 'password-reset') {
      throw new AppError('Unauthorized', 401, true, { general: 'Invalid password reset challenge.' });
    }

    if (!decoded.username || !decoded.hashedOTP || !decoded.nonce || !decoded.tabSessionId) {
      throw new AppError('Unauthorized', 401, true, { general: 'Malformed password reset challenge.' });
    }

    return decoded;
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('Unauthorized', 401, true, { general: 'Password reset challenge expired. Request a new OTP.' });
    }
    throw new AppError('Unauthorized', 401, true, { general: 'Invalid password reset challenge.' });
  }
};

export const registerUser = async (username: string, email: string, password: string) => {
  const client = await pool.connect();
  try {
    // Check existing username/email
    const userRes = await client.query('SELECT username, email FROM users WHERE username=$1 OR email=$2', [username, email]);
    const errors: Record<string, string> = {};
    for (const row of userRes.rows) {
      if (row.username === username) errors.username = 'Username is already taken';
      if (row.email === email) errors.email = 'Email is already registered';
    }
    if (Object.keys(errors).length) {
      throw new AppError('Conflict', 409, true, errors);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    const insertRes = await client.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, passwordHash]
    );
    const newUser = insertRes.rows[0];
    logger.info(`User registered: ${newUser.email}`);
    // Exclude password hash from response
    return { message: 'Registration successful', user: { id: newUser.id, username: newUser.username, email: newUser.email } };
  } catch (err: unknown) { // Catch specific errors if possible
    logger.error('Error during registration:', err);
    // Re-throw specific AppErrors or a generic one
    if (err instanceof AppError) throw err;
    throw new AppError('Internal Server Error', 500, false, { general: 'Could not register user.' });
  } finally {
    client.release();
  }
};

const toAuthenticatedUser = (user: User): AuthenticatedUser => ({
  id: user.id,
  username: user.username,
  email: user.email,
});

const createLoginSuccessResult = (user: AuthenticatedUser, sessionVersion: number): LoginSuccessResult => {
  const token = tokenService.generateAccessToken({
    userId: user.id,
    username: user.username,
    email: user.email,
    sessionVersion,
  });

  return {
    requiresTwoFactor: false,
    token,
    user,
    message: 'Login successful',
  };
};

const passwordLoginIdentity = (email: string, ipAddress: string) => ({
  scope: 'login-password',
  subjectKey: email,
  ipAddress,
});

const handlePasswordLoginFailure = async (email: string, ipAddress: string): Promise<void> => {
  const failure = await recordRateLimitFailure(passwordLoginIdentity(email, ipAddress), config.authRateLimit);
  if (failure.locked) {
    throw new AppError('Too many login attempts. Please try again later.', 429, true, {
      retryAfterSec: failure.retryAfterSec,
    });
  }
};

export const loginUser = async (email: string, password: string, ipAddress = 'unknown'): Promise<LoginResult> => {
  const client = await pool.connect();
  const normalizedEmail = email.trim().toLowerCase();

  try {
    await assertWithinRateLimit(
      passwordLoginIdentity(normalizedEmail, ipAddress),
      config.authRateLimit,
      'Too many login attempts. Please try again later.'
    );

    const userRes = await client.query<User>(
      `SELECT id, username, email, password_hash, session_version
       FROM users
       WHERE LOWER(email) = LOWER($1)`,
      [normalizedEmail]
    );

    if (!userRes.rowCount) {
      await handlePasswordLoginFailure(normalizedEmail, ipAddress);
      throw new AppError('Unauthorized', 401, true, { general: 'Invalid email or password.' });
    }

    const user = userRes.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      await handlePasswordLoginFailure(normalizedEmail, ipAddress);
      throw new AppError('Unauthorized', 401, true, { general: 'Invalid email or password.' });
    }

    await clearRateLimitState(passwordLoginIdentity(normalizedEmail, ipAddress));

    const twoFactorStatus = await getTwoFactorStatus(user.id);
    if (twoFactorStatus.enabled) {
      logger.info(`Password phase complete, 2FA required for ${user.email}`);
      return createTwoFactorLoginChallenge(toAuthenticatedUser(user));
    }

    logger.info(`User logged in: ${user.email}`);
    return createLoginSuccessResult(toAuthenticatedUser(user), user.session_version ?? 0);
  } catch (err: unknown) {
    logger.error('Error during login:', err);
    if (err instanceof AppError) throw err;
    throw new AppError('Internal Server Error', 500, false, { general: 'Could not log in user.' });
  } finally {
    client.release();
  }
};

export const verifyLoginTwoFactorAuthenticator = async (
  twoFactorToken: string,
  code: string,
  ipAddress = 'unknown'
): Promise<LoginSuccessResult> => {
  const user = await verifyTwoFactorAuthenticatorLogin(twoFactorToken, code, ipAddress);
  return createLoginSuccessResult(user, user.sessionVersion);
};

export const requestLoginTwoFactorOtp = async (
  twoFactorToken: string,
  ipAddress = 'unknown'
): Promise<TwoFactorOtpRequestResult> => {
  return requestTwoFactorLoginOtp(twoFactorToken, ipAddress);
};

export const verifyLoginTwoFactorOtp = async (
  twoFactorToken: string,
  otpChallengeToken: string,
  code: string,
  ipAddress = 'unknown'
): Promise<LoginSuccessResult> => {
  const user = await verifyTwoFactorLoginOtp(twoFactorToken, otpChallengeToken, code, ipAddress);
  return createLoginSuccessResult(user, user.sessionVersion);
};

export const verifyLoginTwoFactorRecoveryCode = async (
  twoFactorToken: string,
  recoveryCode: string,
  ipAddress = 'unknown'
): Promise<LoginSuccessResult> => {
  const user = await verifyTwoFactorRecoveryCodeLogin(twoFactorToken, recoveryCode, ipAddress);
  return createLoginSuccessResult(user, user.sessionVersion);
};

export const getTwoFactorStatusForUser = async (userId: number): Promise<TwoFactorStatus> => {
  return getTwoFactorStatus(userId);
};

export const initTwoFactorSetupForUser = async (
  userId: number,
  currentPassword?: string
): Promise<TwoFactorSetupInitResult> => {
  return initTwoFactorSetup(userId, currentPassword);
};

export const verifyTwoFactorSetupForUser = async (
  userId: number,
  setupToken: string,
  code: string
): Promise<TwoFactorSetupVerifyResult> => {
  return verifyTwoFactorSetup(userId, setupToken, code);
};

export const disableTwoFactorForUser = async (userId: number, currentPassword: string): Promise<void> => {
  await disableTwoFactor(userId, currentPassword);
};

export const regenerateTwoFactorRecoveryCodesForUser = async (
  userId: number,
  currentPassword: string
): Promise<TwoFactorRecoveryCodesResult> => {
  return regenerateRecoveryCodes(userId, currentPassword);
};

/**
 * Verify username and email belong to the same user and send OTP
 */
export const requestPasswordReset = async (username: string, email: string, tabSessionId: string) => {
  const client = await pool.connect();
  try {
    // Find user by both username and email to ensure they belong to the same user
    const userRes = await client.query(
      'SELECT id, username, email FROM users WHERE username = $1 AND email = $2',
      [username, email]
    );

    if (userRes.rows.length === 0) {
      throw new AppError('User not found', 404, true, { 
        general: 'Username and email do not match any user account.' 
      });
    }

    const user = userRes.rows[0];
    
    // Generate 6-character alphanumeric OTP
    const otp = generateOTP();
    
    // Hash OTP with username
    const hashedOTP = hashOTP(otp, username);

    // Create short-lived signed challenge bound to this tab session
    const challenge = createPasswordResetChallenge(username, hashedOTP, tabSessionId);
    
    // Send OTP email
    await sendOTPEmail(email, username, otp);
    
    logger.info(`Password reset OTP sent to ${email} for user ${username}`);
    
    return {
      message: 'OTP sent to your email address',
      hashedOTP, // Send hashed OTP back to client for verification
      username: user.username, // Send username back for frontend state
      resetChallenge: challenge.token,
      resetChallengeExpiresAt: challenge.expiresAt,
      nonce: challenge.nonce,
    };
  } catch (err: unknown) {
    logger.error('Error during password reset request:', err);
    if (err instanceof AppError) throw err;
    throw new AppError('Internal Server Error', 500, false, { 
      general: 'Could not process password reset request.' 
    });
  } finally {
    client.release();
  }
};

/**
 * Update password
 */
export const resetPasswordWithToken = async (
  username: string,
  newPassword: string,
  otp: string,
  resetChallenge: string,
  tabSessionId: string
) => {
  const client = await pool.connect();
  try {
    const challenge = verifyPasswordResetChallenge(resetChallenge);

    if (challenge.username !== username) {
      throw new AppError('Unauthorized', 401, true, { general: 'Challenge username mismatch.' });
    }

    if (challenge.tabSessionId !== tabSessionId) {
      throw new AppError('Unauthorized', 401, true, { general: 'Challenge is bound to a different browser tab.' });
    }

    const incomingOtpHash = hashOTP(otp, username);
    if (!timingSafeEqualString(challenge.hashedOTP, incomingOtpHash)) {
      throw new AppError('Unauthorized', 401, true, { general: 'Invalid OTP.' });
    }

    // Find user by username
    const userRes = await client.query(
      'SELECT id, username, email FROM users WHERE username = $1',
      [username]
    );

    if (userRes.rows.length === 0) {
      throw new AppError('User not found', 404, true, { 
        general: 'User not found.' 
      });
    }

    const user = userRes.rows[0];
    
    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    // Update user's password
    await client.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, user.id]
    );
    
    logger.info(`Password reset completed for user ${username}`);
    
    return {
      message: 'Password updated successfully'
    };
  } catch (err: unknown) {
    logger.error('Error during password reset:', err);
    if (err instanceof AppError) throw err;
    throw new AppError('Internal Server Error', 500, false, { 
      general: 'Could not reset password.' 
    });
  } finally {
    client.release();
  }
};
