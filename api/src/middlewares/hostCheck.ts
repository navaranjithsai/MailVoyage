import { Request, Response, NextFunction } from 'express';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const allowedHosts = config.allowedHosts;

export const hostCheck = (req: Request, res: Response, next: NextFunction) => {
  const authority = req.headers[':authority'] || req.headers['host'];
  const requestHost = typeof authority === 'string' ? authority.split(':')[0] : undefined;

  if (!requestHost || !allowedHosts.includes(requestHost)) {
    logger.warn(`Blocking request from unauthorized host: ${authority} (Allowed: ${allowedHosts.join(', ')})`);
    // Use standard 403 Forbidden
    return res.status(403).json({ message: 'Forbidden: Host not allowed.' });
  }

  next();
};