import { Request, Response, NextFunction } from 'express';
import * as mailService from '../services/mail.service.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Extract the authenticated user's numeric id at the controller boundary.
 * `req.user.id` is always a string (set by auth middleware via `.toString()`),
 * so the legacy `typeof ... === 'string' ? parseInt(...) : ...` guard had a
 * dead else-branch. Centralize conversion + validation here once.
 */
const requireNumericUserId = (req: Request): number => {
  const raw = req.user?.id;
  const userId = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isInteger(userId) || userId <= 0) {
    throw new AppError('Invalid authenticated user id', 401);
  }
  return userId;
};

/**
 * Get paginated list of sent mails for the authenticated user
 */
export const getSentMails = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user;
    
    if (!user || !user.id) {
      throw new AppError('Authentication required', 401);
    }
    
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // Max 100 per page
    const since = req.query.since as string | undefined; // ISO timestamp for delta sync
    
    const userId = requireNumericUserId(req);
    const result = await mailService.getSentMailsByUserId(userId, page, limit, since);
    
    res.json({
      success: true,
      data: result,
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single sent mail by thread ID
 */
export const getSentMailByThreadId = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user;
    
    if (!user || !user.id) {
      throw new AppError('Authentication required', 401);
    }
    
    const threadId = String(req.params.threadId);
    
    if (!threadId) {
      throw new AppError('Thread ID is required', 400);
    }
    
    logger.info(`Fetching sent mail with thread ID ${threadId} for user ${user.id}`);
    
    const userId = requireNumericUserId(req);
    const mail = await mailService.getSentMailByThreadId(userId, threadId);
    
    if (!mail) {
      throw new AppError('Sent mail not found', 404);
    }
    
    res.json({
      success: true,
      data: mail,
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single sent mail by ID
 */
export const getSentMailById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user;
    
    if (!user || !user.id) {
      throw new AppError('Authentication required', 401);
    }
    
    const id = String(req.params.id);
    
    if (!id) {
      throw new AppError('Mail ID is required', 400);
    }
    
    logger.info(`Fetching sent mail with ID ${id} for user ${user.id}`);
    
    const userId = requireNumericUserId(req);
    const mail = await mailService.getSentMailById(userId, id);
    
    if (!mail) {
      throw new AppError('Sent mail not found', 404);
    }
    
    res.json({
      success: true,
      data: mail,
    });
    
  } catch (error) {
    next(error);
  }
};
