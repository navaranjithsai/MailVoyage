import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodIssue, ZodTypeAny } from 'zod'; // Import ZodTypeAny
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

interface ValidationSchemas {
  body?: ZodTypeAny; // Changed from AnyZodObject to ZodTypeAny
  query?: ZodTypeAny; // Changed from AnyZodObject to ZodTypeAny
  params?: ZodTypeAny; // Changed from AnyZodObject to ZodTypeAny
}

export const validateRequest = (schemas: ValidationSchemas) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query);
      }
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Validation Error:', error.flatten());
        // Format Zod errors for client response
        const formattedErrors = error.flatten((issue: ZodIssue) => issue.message).fieldErrors; // Use message directly
        // Pick the first error for each field for simplicity
        const simpleErrors: Record<string, string> = {};
        for (const field in formattedErrors) {
            // Ensure the field exists and has errors before accessing [0]
            if(formattedErrors[field] && formattedErrors[field]!.length > 0){
                 simpleErrors[field] = formattedErrors[field]![0];
            }
        }
        next(new AppError('Validation Failed', 400, true, simpleErrors));
      } else {
        logger.error('Unexpected error during validation:', error);
        next(new AppError('Internal Server Error', 500, false, { general: 'An unexpected validation error occurred.' }));
      }
    }
  };
