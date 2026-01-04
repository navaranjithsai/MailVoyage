import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service.js';
import * as userService from '../services/user.service.js'; // Import userService to fetch user details
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';
import { AppError } from '../utils/errors.js';
import { testSMTPConnection } from '../services/email.service.js';
import jwt from 'jsonwebtoken';

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, email, password } = req.body;
    const result = await authService.registerUser(username, email, password);
    res.status(201).json(result);
  } catch (error) {
    logger.error('Registration error:', error);
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser(email, password);

    res.cookie('authToken', result.token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      maxAge: config.jwtCookieExpiresIn, // Use centralized config for cookie expiry
      sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
      path: '/',
    });

    // User object from authService.loginUser already contains id, username, email
    res.status(200).json({ user: result.user, message: 'Login successful' });
  } catch (error) {
    logger.error('Login error:', error);
    next(error);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  // This endpoint does not need authenticateToken middleware
  try {
    res.cookie('authToken', '', {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      expires: new Date(0),
      sameSite: config.nodeEnv === 'production' ? 'none' : 'lax', // Ensure correct sameSite
      path: '/', // Ensure path is specified for robust clearing
    });
    // It's good practice to also send a response confirming logout.
    res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    logger.error('Logout error:', error);
    // Avoid sending sensitive error details to the client for logout.
    // If cookie clearing itself fails, it's a server-side issue mostly.
    // The client will proceed with its local cleanup regardless.
    next(new AppError('Logout failed due to a server error', 500, false, { context: 'logout' }));
  }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, email } = req.body;
    const result = await authService.requestPasswordReset(username, email);
    res.status(200).json(result);
  } catch (error) {
    logger.error('Forgot password error:', error);
    next(error);
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, newPassword } = req.body;
    const result = await authService.resetPasswordWithToken(username, newPassword);
    res.status(200).json(result);
  } catch (error) {
    logger.error('Reset password error:', error);
    next(error);
  }
};

export const validateToken = async (req: Request, res: Response, next: NextFunction) => {
  logger.info('🔄 validateToken controller invoked.', { 
    path: req.path,
    method: req.method,
    hasReqUser: !!req.user
  });
  
  // The authenticateToken middleware (which should have run before this)
  // populates req.user with { username, email } if the token is valid.
  if (req.user && req.user.email && req.user.username) {
    logger.debug('✅ validateToken: req.user populated correctly.', { userFromToken: req.user });
    try {
      // Fetch the full user profile using email from the token.
      logger.debug(`🔍 validateToken: Fetching user profile for email: ${req.user.email}`);
      const userProfile = await userService.getUserByEmail(req.user.email);
      
      if (!userProfile) {
        logger.warn(`❌ validateToken: User from token not found in DB: ${req.user.email}`);
        res.cookie('authToken', '', { // Clear the now invalid cookie
          httpOnly: true,
          secure: config.nodeEnv === 'production',
          expires: new Date(0),
          sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
          path: '/',
        });
        return next(new AppError('Unauthorized: User not found', 401));
      }

      // Additionally, verify that the username from the token matches the username from the DB for that email.
      // This is an extra sanity check, though email is typically unique.
      logger.debug('🔍 validateToken: Comparing username from token with DB.', { 
        tokenUsername: req.user.username, 
        dbUsername: userProfile.username,
        match: userProfile.username === req.user.username
      });
      
      if (userProfile.username !== req.user.username) {
        logger.warn(`❌ validateToken: Username mismatch for email ${req.user.email}: token (${req.user.username}) vs DB (${userProfile.username})`);
        res.cookie('authToken', '', { // Clear the potentially compromised/mismatched cookie
          httpOnly: true,
          secure: config.nodeEnv === 'production',
          expires: new Date(0),
          sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
          path: '/',
        });
        return next(new AppError('Unauthorized: User data mismatch', 401));
      }

      // Token is valid, user exists in DB and matches token data.
      // Send back the essential user details for the frontend state.
      logger.info('✅ validateToken: Token validation successful. Sending user profile.');
      res.status(200).json({ 
        message: 'Token is valid', 
        user: { id: userProfile.id, username: userProfile.username, email: userProfile.email } 
      });
    } catch (error) {
      logger.error('❌ validateToken: Error fetching user profile or during validation logic.', { 
        error,
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      res.cookie('authToken', '', { // Clear cookie on any unexpected error
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        expires: new Date(0),
        sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
        path: '/',
      });
      next(new AppError('Internal Server Error during token validation', 500));
    }
  } else {
    // This state implies that authenticateToken middleware did not populate req.user,
    // meaning the token was invalid, expired, or not present.
    // authenticateToken should have already sent a 401 and cleared the cookie.
    // However, as a safeguard if this controller is somehow reached without req.user:
    logger.warn('⛔ validateToken: Called without req.user populated. This should have been handled by authenticateToken.', {
      user: req.user
    });
    res.cookie('authToken', '', { // Ensure cookie is cleared
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        expires: new Date(0),
        sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
        path: '/',
      });
    return next(new AppError('Unauthorized: Invalid session', 401));
  }
};

export const testSMTP = async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('Testing SMTP connection via endpoint');
    const isConnected = await testSMTPConnection();
    
    res.status(200).json({
      success: isConnected,
      message: isConnected ? 'SMTP connection successful' : 'SMTP connection failed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('SMTP test endpoint error:', error);
    next(error);
  }
};

/**
 * Get a short-lived WebSocket token for real-time sync.
 * This token is used by the frontend WebSocket client to authenticate.
 * It's separate from the main auth cookie to avoid exposing the long-lived token.
 */
export const getWebSocketToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // req.user is populated by authenticateToken middleware
    if (!req.user || !req.user.id) {
      logger.warn('getWebSocketToken: Called without authenticated user');
      return next(new AppError('Unauthorized', 401));
    }

    // Generate a short-lived token (5 minutes) specifically for WebSocket
    const wsToken = jwt.sign(
      { 
        userId: req.user.id, 
        username: req.user.username,
        email: req.user.email,
        purpose: 'websocket' 
      },
      config.jwtSecret,
      { expiresIn: '5m' } // Short-lived for security
    );

    logger.debug(`WebSocket token generated for user ${req.user.id}`);

    res.status(200).json({
      success: true,
      token: wsToken,
      expiresIn: 300 // 5 minutes in seconds
    });
  } catch (error) {
    logger.error('getWebSocketToken error:', error);
    next(error);
  }
};
