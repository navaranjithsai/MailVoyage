import { Request, Response, NextFunction } from 'express';
import * as inboxService from '../services/inbox.service.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
import { signalInboxSyncComplete, signalSettingsUpdated } from '../utils/signaling.js';

// Helper to get authenticated user
const getUser = (req: Request) => {
  if (!req.user) throw new AppError('User not authenticated', 401);
  return req.user as { id: string; username: string; email: string };
};

/**
 * GET /api/inbox/cached
 * Get cached mails from server DB (fast, used on login/page load).
 * Query: ?accountCode=XXX&mailbox=INBOX
 */
export const getCachedMails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = getUser(req);
    const accountCode = req.query.accountCode as string | undefined;
    const mailbox = (req.query.mailbox as string) || 'INBOX';

    const mails = await inboxService.getCachedMails(user.id, accountCode, mailbox);

    res.json({
      success: true,
      data: {
        mails,
        total: mails.length,
        source: 'cache',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/inbox/fetch
 * Fetch mails from the actual mail server via IMAP.
 * Query: ?accountCode=XXX&mailbox=INBOX&limit=20&page=1&sinceUid=0
 */
export const fetchMails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = getUser(req);
    const accountCode = req.query.accountCode as string;

    if (!accountCode) {
      return next(new AppError('accountCode is required', 400, true));
    }

    const mailbox = (req.query.mailbox as string) || 'INBOX';
    const limit = parseInt(req.query.limit as string) || 20;
    const page = parseInt(req.query.page as string) || 1;
    const sinceUid = req.query.sinceUid ? parseInt(req.query.sinceUid as string) : undefined;

    logger.info(`[Inbox] Fetching mails for user ${user.id}, account ${accountCode}, page ${page}`);

    const result = await inboxService.fetchMailsFromServer(user.id, accountCode, {
      mailbox,
      limit,
      page,
      sinceUid,
    });

    res.json({
      success: true,
      data: {
        mails: result.mails,
        total: result.totalOnServer,
        fetched: result.fetched,
        page,
        limit,
        source: 'server',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/inbox/sync
 * Fetch from IMAP server AND update server-side cache.
 * Body: { accountCode, mailbox?, limit?, sinceUid?, page? }
 */
export const syncInbox = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = getUser(req);
    const { accountCode, mailbox, limit, sinceUid, page } = req.body;

    if (!accountCode) {
      return next(new AppError('accountCode is required', 400, true));
    }

    // Get user's cache limit setting
    const cacheLimitStr = await inboxService.getUserSetting(user.id, 'inbox_cache_limit', '15');
    const cacheLimit = parseInt(cacheLimitStr, 10);

    logger.info(`[Inbox] Syncing inbox for user ${user.id}, account ${accountCode}, cacheLimit=${cacheLimit}`);

    const result = await inboxService.syncInbox(user.id, accountCode, {
      mailbox,
      limit,
      sinceUid,
      page,
      cacheLimit,
    });

    // Signal connected clients that inbox sync finished
    signalInboxSyncComplete(user.id, accountCode, result.fetched);

    res.json({
      success: true,
      data: {
        mails: result.mails,
        total: result.totalOnServer,
        fetched: result.fetched,
        cached: result.cached,
        source: 'server',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/inbox/search
 * Search the mail server (IMAP SEARCH) for messages matching a query.
 * Supports progressive date ranges (6mo, 12mo, all-time).
 * Results are NOT saved to the server cache — only returned for client-side storage.
 * Body: { accountCode, query, sinceMonths?: 6|12|0, mailbox?: string }
 */
export const searchOnServer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = getUser(req);
    const { accountCode, query, sinceMonths, mailbox } = req.body;

    if (!accountCode) {
      return next(new AppError('accountCode is required', 400, true));
    }
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return next(new AppError('query is required', 400, true));
    }

    logger.info(`[Inbox] Server search for user ${user.id}, account ${accountCode}, query="${query}", sinceMonths=${sinceMonths ?? 6}`);

    const result = await inboxService.searchMailsOnServer(user.id, accountCode, query.trim(), {
      sinceMonths: sinceMonths ?? 6,
      mailbox: mailbox || 'INBOX',
    });

    res.json({
      success: true,
      data: {
        mails: result.mails,
        searched: result.searched,
        dateRange: result.dateRange,
        protocol: result.protocol,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/inbox/accounts
 * Get list of email accounts (not SMTP-only) for the inbox dropdown.
 */
export const getInboxAccounts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = getUser(req);
    const accounts = await inboxService.getAccountList(user.id);

    res.json({
      success: true,
      data: accounts,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/inbox/settings
 * Get user settings relevant to inbox (cache limit etc).
 */
export const getSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = getUser(req);
    const settings = await inboxService.getAllUserSettings(user.id);

    res.json({
      success: true,
      data: {
        inboxCacheLimit: parseInt(settings.inbox_cache_limit || '15', 10),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/inbox/settings
 * Update user inbox settings.
 * Body: { inboxCacheLimit: number }
 */
export const updateSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = getUser(req);
    const { inboxCacheLimit } = req.body;

    if (inboxCacheLimit !== undefined) {
      const limit = Math.max(5, Math.min(100, parseInt(inboxCacheLimit, 10) || 15));
      await inboxService.setUserSetting(user.id, 'inbox_cache_limit', String(limit));

      // Signal connected clients that settings changed
      signalSettingsUpdated(user.id, ['inbox_cache_limit']);
    }

    res.json({
      success: true,
      message: 'Settings updated',
    });
  } catch (error) {
    next(error);
  }
};
