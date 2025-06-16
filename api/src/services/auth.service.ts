import bcrypt from 'bcrypt';
import * as tokenService from './token.service.js';
import pool from '../db/index.js'; // Adjusted path and extension
import { AppError } from '../utils/errors.js'; // Custom error class
import { logger } from '../utils/logger.js';
import { generateOTP, hashOTP, sendOTPEmail } from './email.service.js';

// Placeholder for user type/interface (ideally from models)
interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
}

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
  } catch (err: any) { // Catch specific errors if possible
    logger.error('Error during registration:', err);
    // Re-throw specific AppErrors or a generic one
    if (err instanceof AppError) throw err;
    throw new AppError('Internal Server Error', 500, false, { general: 'Could not register user.' });
  } finally {
    client.release();
  }
};

export const loginUser = async (email: string, password: string) => {
  const client = await pool.connect();
  try {
    // Fetch user
    const userRes = await client.query<User>('SELECT id, username, email, password_hash FROM users WHERE email=$1', [email]);
    if (!userRes.rowCount) {
      throw new AppError('Unauthorized', 401, true, { general: 'Invalid email or password.' });
    }
    const user = userRes.rows[0];

    // Verify password
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      throw new AppError('Unauthorized', 401, true, { general: 'Invalid email or password.' });
    }

    // Generate tokens with username and email in the payload
    const accessToken = tokenService.generateAccessToken({
      // userId: user.id, // Removed userId from token payload
      username: user.username,
      email: user.email
    });
    // const refreshToken = tokenService.generateRefreshToken({ userId: user.id }); // If using refresh tokens

    logger.info(`User logged in: ${user.email}`);
    // Return token (for cookie setting by controller) and user info (excluding password)
    // User ID is still returned in the user object for frontend use, just not in the JWT payload.
    return {
      token: accessToken,
      // refreshToken: refreshToken, // If using refresh tokens
      user: { id: user.id, username: user.username, email: user.email }
    };
  } catch (err: any) { // Catch specific errors if possible
    logger.error('Error during login:', err);
    // Re-throw specific AppErrors or a generic one
    if (err instanceof AppError) throw err;
    throw new AppError('Internal Server Error', 500, false, { general: 'Could not log in user.' });
  } finally {
    client.release();
  }
};

/**
 * Verify username and email belong to the same user and send OTP
 */
export const requestPasswordReset = async (username: string, email: string) => {
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
    
    // Send OTP email
    await sendOTPEmail(email, username, otp);
    
    logger.info(`Password reset OTP sent to ${email} for user ${username}`);
    
    return {
      message: 'OTP sent to your email address',
      hashedOTP, // Send hashed OTP back to client for verification
      username: user.username // Send username back for frontend state
    };
  } catch (err: any) {
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
export const resetPasswordWithToken = async (username: string, newPassword: string) => {
  const client = await pool.connect();
  try {
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
  } catch (err: any) {
    logger.error('Error during password reset:', err);
    if (err instanceof AppError) throw err;
    throw new AppError('Internal Server Error', 500, false, { 
      general: 'Could not reset password.' 
    });
  } finally {
    client.release();
  }
};
