import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../utils/config.js';
import { AppError } from '../utils/errors.js';
import * as tokenService from '../services/token.service.js';
import { logger } from '../utils/logger.js';

// Extend Express Request type to include user payload
declare global {
  namespace Express {
    interface Request {
      user?: { userId: number }; // Add other payload fields if needed
    }
  }
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return next(new AppError('Unauthorized', 401, true, { auth: 'No token provided.' }));
  }

  try {
    const decoded = tokenService.verifyAccessToken(token) as { userId: number; iat: number; exp: number };
    // Attach user payload to the request object
    req.user = { userId: decoded.userId };
    logger.debug(`Token validated for user ID: ${decoded.userId}`);
    next();
  } catch (error) {
    // If verifyAccessToken throws an AppError, pass it along
    if (error instanceof AppError) {
      return next(error);
    }
    // Otherwise, wrap it in a generic auth error
    logger.error('Unexpected error during token authentication:', error);
    return next(new AppError('Unauthorized', 401, true, { auth: 'Invalid or expired token.' }));
  }
};