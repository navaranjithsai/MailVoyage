import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { config } from '../utils/config.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const jwtSecret: Secret = config.jwtSecret;
const jwtExpiresIn: string = config.jwtExpiresIn;
// const jwtRefreshSecret: Secret = config.jwtRefreshSecret; // If using refresh tokens
// const jwtRefreshExpiresIn: string = config.jwtRefreshExpiresIn; // If using refresh tokens

if (!jwtSecret /* || !jwtRefreshSecret */) {
  logger.warn('JWT secrets are not set. Authentication will not work.');
  // throw new Error('JWT secrets must be defined in environment variables.');
}

export const generateAccessToken = (payload: object): string => {
  if (!jwtSecret) throw new AppError('Configuration Error', 500, false, { general: 'JWT Secret not configured.' });
  return jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn } as SignOptions);
};

export const verifyAccessToken = (token: string): object | string => {
  if (!jwtSecret) throw new AppError('Configuration Error', 500, false, { general: 'JWT Secret not configured.' });
  try {
    return jwt.verify(token, jwtSecret);
  } catch (error: any) {
    logger.error('JWT Access Token verification failed:', error.message);
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('Unauthorized', 401, true, { token: 'Token expired' });
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError('Unauthorized', 401, true, { token: 'Invalid token' });
    } else {
      throw new AppError('Internal Server Error', 500, false, { general: 'Could not verify token' });
    }
  }
};

/* // --- Refresh Token Logic (Example) ---
export const generateRefreshToken = (payload: object): string => {
  if (!jwtRefreshSecret) throw new AppError('Configuration Error', 500, false, { general: 'JWT Refresh Secret not configured.' });
  return jwt.sign(payload, jwtRefreshSecret, { expiresIn: jwtRefreshExpiresIn } as SignOptions);
};

export const verifyRefreshToken = (token: string): object | string => {
  if (!jwtRefreshSecret) throw new AppError('Configuration Error', 500, false, { general: 'JWT Refresh Secret not configured.' });
  try {
    return jwt.verify(token, jwtRefreshSecret);
  } catch (error: any) {
    logger.error('JWT Refresh Token verification failed:', error.message);
     if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('Unauthorized', 401, true, { token: 'Refresh token expired' });
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError('Unauthorized', 401, true, { token: 'Invalid refresh token' });
    } else {
      throw new AppError('Internal Server Error', 500, false, { general: 'Could not verify refresh token' });
    }
  }
};
*/
