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
  logger.info('🔒 authenticateToken middleware invoked.', { 
    path: req.path, 
    method: req.method,
    cookieKeys: req.cookies ? Object.keys(req.cookies) : [],
    hasAuthTokenCookie: req.cookies && 'authToken' in req.cookies
  });
  
  const token = req.cookies.authToken;
  // Log the first 10 characters of the token if it exists, for debugging
  logger.debug('Auth token from cookie:', { 
    hasToken: !!token,
    tokenPreview: token ? `${token.substring(0, 10)}...` : 'none', 
    cookieHeaders: req.headers.cookie
  });

  if (!token) {
    logger.warn('⛔ authenticateToken: No token provided in cookies.');
    return next(new AppError('Unauthorized: No token provided', 401));
  }

  try {
    logger.debug('🔍 authenticateToken: Attempting to verify token...');
    const decoded = tokenService.verifyAccessToken(token) as { username: string; email: string; iat?: number; exp?: number };
    logger.debug('✅ authenticateToken: Token decoded successfully.', { 
      decodedPayload: {
        username: decoded.username,
        email: decoded.email,
        iat: decoded.iat,
        exp: decoded.exp,
        expiresIn: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : 'unknown'
      }
    });

    // Basic check if essential properties exist after decoding
    if (!decoded || typeof decoded.username !== 'string' || typeof decoded.email !== 'string') {
      logger.warn('❌ authenticateToken: Token verification failed - decoded token has invalid structure.', { decoded });
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
    logger.debug('🔍 authenticateToken: Fetching user ID from database...');
    const userProfile = await userService.getUserByEmail(decoded.email);
    
    if (!userProfile) {
      logger.warn('❌ authenticateToken: User not found in database.', { email: decoded.email });
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
    logger.info('👤 authenticateToken: User set in request.', { user: req.user });
    next();
  } catch (error: any) {
    logger.warn('❌ authenticateToken: Token verification failed.', { 
      errorName: error.name, 
      errorMessage: error.message,
      stack: error.stack
    });
    // Clear the invalid/expired cookie
    res.cookie('authToken', '', {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      expires: new Date(0),
      sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
      path: '/',
    });

    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Unauthorized: Token expired', 401));
    }
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Unauthorized: Invalid token', 401));
    }
    // For other unexpected errors during token verification
    return next(new AppError('Unauthorized: Token verification failed due to an unexpected error', 401));
  }
};