import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

interface ValidationSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

export const validateRequest = (schemas: ValidationSchemas) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query) as Request['query'];
      }
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params) as Request['params'];
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Validation Error:', error.issues);
        // Format Zod errors for client response - extract field-level errors from issues
        const simpleErrors: Record<string, string> = {};
        for (const issue of error.issues) {
          const field = issue.path.length > 0 ? String(issue.path[0]) : 'general';
          if (!simpleErrors[field]) {
            simpleErrors[field] = issue.message;
          }
        }
        next(new AppError('Validation Failed', 400, true, simpleErrors));
      } else {
        logger.error('Unexpected error during validation:', error);
        next(new AppError('Internal Server Error', 500, false, { general: 'An unexpected validation error occurred.' }));
      }
    }
  };
