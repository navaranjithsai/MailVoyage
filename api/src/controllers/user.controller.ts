import { Request, Response, NextFunction } from 'express';
import * as userService from '../services/user.service.js';
import * as tokenService from '../services/token.service.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
import { config } from '../utils/config.js';

// Placeholder: Get user profile
export const getProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // const userId = (req as any).user.userId; // Get userId from authenticated token
    // const profile = await userService.getUserProfile(userId);
    logger.info('Placeholder: Get profile called');
    res.status(200).json({ message: 'Placeholder: Get profile successful' });
  } catch (error) {
    next(error);
  }
};

// Update user profile
export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, username, email } = req.body;
    const currentUser = (req as any).user; // From auth middleware
    
    logger.info('Profile update requested', { 
      requestedId: id, 
      currentUser: currentUser.email,
      newUsername: username,
      newEmail: email 
    });

    // Verify the user is updating their own profile
    if (currentUser.email !== email && !currentUser.username) {
      logger.warn('User attempted to update different user profile', { 
        currentUser: currentUser.email, 
        requestedEmail: email 
      });
      return next(new AppError('Unauthorized: Cannot update another user\'s profile', 403));
    }

    try {
      const updatedUser = await userService.updateUserProfile(parseInt(id), { username, email });
      
      // Generate new access token with updated information
      const newAccessToken = tokenService.generateAccessToken({ username, email });
      
      // Set the new token in httpOnly cookie
      res.cookie('authToken', newAccessToken, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
        path: '/',
      });

      logger.info('Profile updated successfully', { userId: id, username, email });
      
      res.status(200).json({ 
        message: 'Profile updated successfully',
        user: { id, username, email }
      });
    } catch (error: any) {
      logger.error('Error updating profile:', error);
      
      // Handle database constraint errors (unique violations)
      if (error.message && error.message.includes('duplicate key value violates unique constraint')) {
        if (error.message.includes('users_username_key')) {
          return next(new AppError('Username is already taken', 400, true, { username: 'This username is already taken' }));
        }
        if (error.message.includes('users_email_key')) {
          return next(new AppError('Email is already registered', 400, true, { email: 'This email is already registered' }));
        }
      }
      
      throw error; // Re-throw if not a constraint error
    }
  } catch (error) {
    logger.error('Unexpected error in updateProfile:', error);
    next(error);
  }
};

// Placeholder: Get user preferences
export const getPreferences = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // const userId = (req as any).user.userId;
    // const preferences = await userService.getUserPreferences(userId);
    logger.info('Placeholder: Get preferences called');
    res.status(200).json({ message: 'Placeholder: Get preferences successful' });
  } catch (error) {
    next(error);
  }
};

// Placeholder: Update user preferences
export const updatePreferences = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // const userId = (req as any).user.userId;
    // const preferencesData = req.body;
    // const updatedPreferences = await userService.updateUserPreferences(userId, preferencesData);
    logger.info('Placeholder: Update preferences called');
    res.status(200).json({ message: 'Placeholder: Update preferences successful' });
  } catch (error) {
    next(error);
  }
};
