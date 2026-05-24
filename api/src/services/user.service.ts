import pool from '../db/index.js'; // Corrected: Assuming db/index.ts exports pool correctly
import bcrypt from 'bcrypt';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  sessionVersion: number;
}

export const getUserByEmail = async (email: string): Promise<UserProfile | null> => {
  const client = await pool.connect();
  try {
    const result = await client.query<UserProfile>(
      'SELECT id, username, email, session_version as "sessionVersion" FROM users WHERE email = $1',
      [email]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error(`getUserByEmail failed for ${email}:`, error);
    throw new AppError('Database error while fetching user by email', 500, false, { context: 'getUserByEmail', email });
  } finally {
    client.release();
  }
};

export const incrementSessionVersion = async (userId: number): Promise<number> => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE users
       SET session_version = COALESCE(session_version, 0) + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING session_version`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    return result.rows[0].session_version as number;
  } catch (error) {
    logger.error(`incrementSessionVersion failed for user ${userId}:`, error);
    throw error;
  } finally {
    client.release();
  }
};

export const incrementSessionVersionByEmail = async (email: string): Promise<number | null> => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE users
       SET session_version = COALESCE(session_version, 0) + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE email = $1
       RETURNING session_version`,
      [email]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].session_version as number;
  } catch (error) {
    logger.error(`incrementSessionVersionByEmail failed for ${email}:`, error);
    throw error;
  } finally {
    client.release();
  }
};

// Placeholder: Get user profile data
export const getUserProfile = async (userId: number) => {
  logger.info(`Placeholder: Fetching profile for user ${userId}`);
  // Fetch user data from DB (excluding sensitive info like password hash)
  return { message: `Placeholder: Profile data for user ${userId}` };
};

// Update user profile data
export const updateUserProfile = async (userId: number, profileData: { username: string; email: string }) => {
  logger.info(`Updating profile for user ${userId}`, { profileData });
  
  const client = await pool.connect();
  try {
    const { username, email } = profileData;
    
    // Check if the new username or email already exists (excluding current user)
    const checkQuery = `
      SELECT id, username, email 
      FROM users 
      WHERE (username = $1 OR email = $2) AND id != $3
    `;
    const checkResult = await client.query(checkQuery, [username, email, userId]);
    
    if (checkResult.rows.length > 0) {
      const existingUser = checkResult.rows[0];
      if (existingUser.username === username) {
        throw new AppError('Username is already taken', 400, true, { username: 'This username is already taken' });
      }
      if (existingUser.email === email) {
        throw new AppError('Email is already registered', 400, true, { email: 'This email is already registered' });
      }
    }
    
    // Update the user profile
    const updateQuery = `
      UPDATE users 
      SET username = $1, email = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id, username, email, created_at, updated_at
    `;
    
    const result = await client.query(updateQuery, [username, email, userId]);
    
    if (result.rows.length === 0) {
      throw new AppError('User not found', 404);
    }
    
    const updatedUser = result.rows[0];
    logger.info(`Profile updated successfully for user ${userId}`, { updatedUser });
    
    return {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      updatedAt: updatedUser.updated_at
    };
    
  } catch (error) {
    logger.error(`Error updating profile for user ${userId}:`, error);
    throw error;
  } finally {
    client.release();
  }
};

export const changeUserPassword = async (
  userId: number,
  currentPassword: string,
  newPassword: string
) => {
  logger.info(`Updating password for user ${userId}`);

  const client = await pool.connect();
  try {
    const userResult = await client.query<{ id: number; password_hash: string }>(
      `SELECT id, password_hash
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new AppError('User not found', 404, true, { general: 'User not found.' });
    }

    const user = userResult.rows[0];
    const currentMatches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!currentMatches) {
      throw new AppError('Unauthorized', 401, true, {
        currentPassword: 'Current password is incorrect',
      });
    }

    const sameAsCurrent = await bcrypt.compare(newPassword, user.password_hash);
    if (sameAsCurrent) {
      throw new AppError('Bad Request', 400, true, {
        newPassword: 'New password must be different from current password',
      });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await client.query(
      `UPDATE users
       SET password_hash = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newPasswordHash, userId]
    );

    logger.info(`Password updated successfully for user ${userId}`);
    return { message: 'Password updated successfully' };
  } catch (error) {
    logger.error(`Error updating password for user ${userId}:`, error);
    throw error;
  } finally {
    client.release();
  }
};

// Placeholder: Get user preferences
export const getUserPreferences = async (userId: number) => {
  logger.info(`Placeholder: Fetching preferences for user ${userId}`);
  // Fetch user preferences from DB
  return { message: `Placeholder: Preferences for user ${userId}` };
};

// Placeholder: Update user preferences
export const updateUserPreferences = async (userId: number, _preferencesData: Record<string, unknown>) => {
  logger.info(`Placeholder: Updating preferences for user ${userId}`);
  // Update user preferences in DB
  return { message: `Placeholder: Preferences updated for user ${userId}` };
};
