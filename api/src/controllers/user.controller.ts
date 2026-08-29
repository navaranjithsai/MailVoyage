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
    const { username, email } = req.body;
    const currentUser = req.user; // From auth middleware
    
    if (!currentUser) {
      return next(new AppError('Unauthorized', 401));
    }

    // SECURITY FIX (R1): Derive the target identity ONLY from the auth token.
    // Previously the target `id` came from the request body and the guard
    // `currentUser.email !== email && !currentUser.username` was a no-op for
    // authenticated users — meaning any logged-in user could rewrite another
    // user's profile by supplying their id. Ignore body `id` entirely.
    const targetUserId = Number(currentUser.id);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return next(new AppError('Invalid authenticated user id', 400, true));
    }

    logger.info('Profile update requested', { 
      userId: targetUserId,
      currentUser: currentUser.email,
      newUsername: username,
      newEmail: email 
    });

    try {
      await userService.updateUserProfile(targetUserId, { username, email });
      
      // Replace the access token atomically with the profile response. Keep
      // the current sessionVersion so existing authenticated channels remain
      // valid, while including every claim required by authenticateToken.
      const newAccessToken = tokenService.generateAccessToken({
        userId: targetUserId,
        username,
        email,
        sessionVersion: currentUser.sessionVersion,
      });
      
      // Set the new token in httpOnly cookie
      res.cookie('authToken', newAccessToken, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: 'strict',
        path: '/',
      });

      logger.info('Profile updated successfully', { userId: targetUserId, username, email });
      
      res.status(200).json({ 
        message: 'Profile updated successfully',
        user: { id: String(targetUserId), username, email }
      });
    } catch (error: unknown) {
      logger.error('Error updating profile:', error);
      
      // Handle database constraint errors (unique violations)
      const errMessage = error instanceof Error ? error.message : '';
      if (errMessage.includes('duplicate key value violates unique constraint')) {
        if (errMessage.includes('users_username_key')) {
          return next(new AppError('Username is already taken', 400, true, { username: 'This username is already taken' }));
        }
        if (errMessage.includes('users_email_key')) {
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

export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUser = req.user;

    if (!currentUser) {
      return next(new AppError('Unauthorized', 401));
    }

    const userId = Number(currentUser.id);
    if (!Number.isFinite(userId)) {
      return next(new AppError('Invalid authenticated user id', 400));
    }

    const { currentPassword, newPassword } = req.body;
    const result = await userService.changeUserPassword(userId, currentPassword, newPassword);

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    logger.error('Unexpected error in changePassword:', error);
    return next(new AppError('Failed to update password due to server error', 500));
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
