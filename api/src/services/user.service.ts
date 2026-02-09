import pool from '../db/index.js'; // Corrected: Assuming db/index.ts exports pool correctly
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

export interface UserProfile {
  id: number;
  username: string;
  email: string;
}

export const getUserByEmail = async (email: string): Promise<UserProfile | null> => {
  const client = await pool.connect();
  try {
    const result = await client.query<UserProfile>(
      'SELECT id, username, email FROM users WHERE email = $1',
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

// Placeholder: Get user preferences
export const getUserPreferences = async (userId: number) => {
  logger.info(`Placeholder: Fetching preferences for user ${userId}`);
  // Fetch user preferences from DB
  return { message: `Placeholder: Preferences for user ${userId}` };
};

// Placeholder: Update user preferences
export const updateUserPreferences = async (userId: number, preferencesData: any) => {
  logger.info(`Placeholder: Updating preferences for user ${userId}`);
  // Update user preferences in DB
  return { message: `Placeholder: Preferences updated for user ${userId}` };
};
