import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js'; // Import custom error class
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';

export const errorHandler = (err: Error | AppError, req: Request, res: Response, next: NextFunction) => { // Type err more specifically
  // Log the error
  logger.error(`${err.name}: ${err.message}`, {
    stack: config.nodeEnv === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    // Use type guard to safely access meta
    ...(err instanceof AppError && err.meta ? { meta: err.meta } : {}),
  });

  if (err instanceof AppError) {
    // Handle known operational errors
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      // Only include specific error details if it's a safe, operational error
      errors: err.isOperational ? err.meta : undefined,
    });
  } else {
    // Handle unexpected programming errors
    // Avoid leaking sensitive details in production
    const statusCode = 500;
    const message = config.nodeEnv === 'production'
      ? 'An unexpected internal server error occurred.'
      : `Internal Server Error: ${err.message}`; // Show more detail in dev

    return res.status(statusCode).json({
      status: 'error',
      message: message,
    });
  }

  // If headers already sent, delegate to default Express error handler
  // Though the above should handle most cases.
  // if (res.headersSent) {
  //   return next(err);
  // }
};
