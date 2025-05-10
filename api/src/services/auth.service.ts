import bcrypt from 'bcrypt';
import * as tokenService from './token.service.js';
import pool from '../db/index.js'; // Adjusted path and extension
import { AppError } from '../utils/errors.js'; // Custom error class
import { logger } from '../utils/logger.js';

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

    // Generate tokens
    const accessToken = tokenService.generateAccessToken({ userId: user.id });
    // const refreshToken = tokenService.generateRefreshToken({ userId: user.id }); // If using refresh tokens

    logger.info(`User logged in: ${user.email}`);
    // Return token(s) and user info (excluding password)
    return {
      token: accessToken,
      // refreshToken: refreshToken, // If using refresh tokens
      user: { id: user.id, username: user.username, email: user.email }
    };
  } catch (err: any) {
    logger.error('Error during login:', err);
    if (err instanceof AppError) throw err;
    throw new AppError('Internal Server Error', 500, false, { general: 'Could not log in user.' });
  } finally {
    client.release();
  }
};

// Placeholder: Request password reset
export const requestPasswordReset = async (email: string) => {
  logger.info(`Placeholder: Password reset requested for ${email}`);
  // 1. Find user by email
  // 2. Generate a unique, time-limited reset token
  // 3. Store the token hash associated with the user ID
  // 4. Send an email with the reset link (containing the token)
  // Use a dedicated mail service for sending emails
};

// Placeholder: Reset password using token
export const resetPasswordWithToken = async (token: string, newPassword: string) => {
  logger.info(`Placeholder: Password reset attempted with token ${token}`);
  // 1. Verify the token (check existence, expiry, format)
  // 2. Find the associated user ID
  // 3. Hash the new password
  // 4. Update the user's password hash in the database
  // 5. Invalidate/delete the used reset token
};
