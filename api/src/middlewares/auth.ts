import { Request, Response, NextFunction } from 'express';
import * as tokenService from '../services/token.service.js';
import * as userService from '../services/user.service.js';
import { AppError } from '../utils/errors.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

// Extend Express Request type to include user payload from token
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; username: string; email: string }; // Payload with id, username and email
    }
  }
}

// Type for authenticated requests
export interface AuthenticatedRequest extends Request {
  user: { id: string; username: string; email: string };
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.authToken;

  if (!token) {
    logger.debug(`Auth: No token - ${req.method} ${req.path}`);
    return next(new AppError('Unauthorized: No token provided', 401));
  }

  try {
    const decoded = tokenService.verifyAccessToken(token) as { username: string; email: string; iat?: number; exp?: number };

    // Basic check if essential properties exist after decoding
    if (!decoded || typeof decoded.username !== 'string' || typeof decoded.email !== 'string') {
      logger.warn('Auth: Invalid token structure');
      // Clear the potentially problematic cookie
      res.cookie('authToken', '', {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        expires: new Date(0),
        sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
        path: '/',
      });
      return next(new AppError('Unauthorized: Invalid token structure', 401));
    }

    // Fetch user ID from database using email
    const userProfile = await userService.getUserByEmail(decoded.email);
    
    if (!userProfile) {
      logger.warn(`Auth: User not found - ${decoded.email}`);
      // Clear the cookie for non-existent user
      res.cookie('authToken', '', {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        expires: new Date(0),
        sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
        path: '/',
      });
      return next(new AppError('Unauthorized: User not found', 401));
    }

    req.user = { 
      id: userProfile.id.toString(), 
      username: decoded.username, 
      email: decoded.email 
    };
    next();
  } catch (error: any) {
    logger.warn(`Auth: Token verification failed - ${error.name}: ${error.message}`);
    // Clear the invalid/expired cookie
    res.cookie('authToken', '', {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      expires: new Date(0),
      sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
      path: '/',
    });

    // verifyAccessToken throws AppError with specific messages ("Token expired", "Invalid token")
    // Propagate it directly so the client gets the precise error reason
    if (error instanceof AppError) {
      return next(error);
    }
    // For other unexpected errors during token verification
    return next(new AppError('Unauthorized: Token verification failed due to an unexpected error', 401));
  }
};