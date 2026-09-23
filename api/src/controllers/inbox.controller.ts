import { Request, Response, NextFunction } from 'express';
import * as inboxService from '../services/inbox.service.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
import { signalInboxSyncComplete, signalSettingsUpdated, signalInboxUpdate } from '../utils/signaling.js';
import {
  INBOX_CACHE_LIMIT_SETTING_KEY,
  INBOX_CACHE_LIMIT_DEFAULT,
  clampInboxCacheLimit,
} from '../utils/inboxCacheConfig.js';

// Helper to get authenticated user
const getUser = (req: Request) => {
  if (!req.user) throw new AppError('User not authenticated', 401);
  return req.user as { id: string; username: string; email: string; sessionVersion: number };
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
 * Fetch from mail server AND update server-side cache.
 * Body: { accountCode, mailbox?, limit?, sinceUid?, beforeUid?, page? }
 *
 * Older-mail pulls (beforeUid / page > 1) are transit-only: the server does
 * NOT cache them and does NOT broadcast sync-complete (the client stores
 * them in Dexie directly — broadcasting would cause every connected client
 * to pointlessly reload their inbox view).
 */
export const syncInbox = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = getUser(req);
    const { accountCode, mailbox, limit, sinceUid, beforeUid, page } = req.body;

    if (!accountCode) {
      return next(new AppError('accountCode is required', 400, true));
    }

    // Get the user's own cache limit setting (never a hardcoded number)
    const cacheLimit = await inboxService.getUserInboxCacheLimit(user.id);

    // Older-pull detection must mirror inboxService.syncInbox exactly.
    const isOlderPull =
      (typeof beforeUid === 'number' && beforeUid > 0) ||
      (typeof page === 'number' && page > 1);

    logger.info(`[Inbox] Syncing inbox for user ${user.id}, account ${accountCode}, cacheLimit=${cacheLimit}${beforeUid ? `, beforeUid=${beforeUid}` : ''}${isOlderPull ? ' (older pull, transit-only)' : ''}`);

    const result = await inboxService.syncInbox(user.id, accountCode, {
      mailbox,
      limit,
      sinceUid,
      beforeUid,
      page,
      cacheLimit,
    });

    // Signal connected clients only for regular syncs (new/refreshed mail
    // landed in the server cache). Older pulls are client-only — nothing
    // changes cache-side, so broadcasting a sync-complete would only
    // trigger needless inbox reloads on every connected tab.
    if (!isOlderPull) {
      signalInboxSyncComplete(user.id, accountCode, result.fetched);
    }

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
 * GET /api/inbox/status
 * Lightweight "is there new mail?" check that doesn't download any message
 * bodies. The client uses this before deciding whether to trigger a full
 * sync — it returns the server's highest UID and total message count.
 *
 *   ?accountCode=XXX&mailbox=INBOX
 */
export const getMailboxStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = getUser(req);
    const accountCode = req.query.accountCode as string;
    const mailbox = (req.query.mailbox as string) || 'INBOX';

    if (!accountCode) {
      return next(new AppError('accountCode is required', 400, true));
    }

    const status = await inboxService.checkMailboxStatus(user.id, accountCode, mailbox);
    res.json({ success: true, data: status });
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
    const inboxCacheLimit = await inboxService.getUserInboxCacheLimit(user.id);

    res.json({
      success: true,
      data: { inboxCacheLimit },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/inbox/settings/preview-eviction?limit=N
 * Predictive count used by the Settings confirm dialog: how many server-side
 * cached mails would be removed if the user lowered the cache limit to N.
 * Query: ?limit=N
 */
export const previewEviction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = getUser(req);
    const raw = parseInt(req.query.limit as string, 10);
    const newLimit = clampInboxCacheLimit(Number.isFinite(raw) ? raw : INBOX_CACHE_LIMIT_DEFAULT);
    const evictable = await inboxService.countEvictableForLimit(user.id, newLimit);

    res.json({
      success: true,
      data: {
        newLimit,
        mailsToBeRemoved: evictable,
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
 *
 * When the limit is DECREASED, the server cache is trimmed immediately:
 * the oldest mails beyond the new limit are evicted per account, keeping
 * the storage bound meaningful (user1=30, user2=50, user3=10 etc.).
 */
export const updateSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = getUser(req);
    const { inboxCacheLimit } = req.body;

    if (inboxCacheLimit !== undefined) {
      const raw = parseInt(inboxCacheLimit, 10);
      const limit = clampInboxCacheLimit(Number.isFinite(raw) ? raw : INBOX_CACHE_LIMIT_DEFAULT);

      // Get the user's PREVIOUS limit so we know if this is a decrease.
      const prevLimit = await inboxService.getUserInboxCacheLimit(user.id);

      await inboxService.setUserSetting(user.id, INBOX_CACHE_LIMIT_SETTING_KEY, String(limit));

      // Storage optimization: lowering the limit evicts the oldest cached
      // mails beyond the new bound right away.
      if (limit < prevLimit) {
        const evicted = await inboxService.enforceCacheLimit(user.id, limit);
        logger.info(`[Inbox] Cache limit decreased ${prevLimit} → ${limit} for user ${user.id}: evicted ${evicted} mail(s)`);
      }

      // Signal connected clients that settings changed
      signalSettingsUpdated(user.id, [INBOX_CACHE_LIMIT_SETTING_KEY]);
    }

    res.json({
      success: true,
      message: 'Settings updated',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/inbox/flag-updates
 * Apply batched read/star updates to inbox_cache.
 * Body: { batchId, updates: [{ cacheId, isRead?, isStarred? }] }
 */
export const applyFlagUpdates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = getUser(req);
    const { batchId, updates } = req.body as { batchId: string; updates: inboxService.FlagUpdateInput[] };

    const ack = await inboxService.applyFlagUpdates(user.id, batchId, updates, user.sessionVersion);
    if (ack.acceptedIds.length > 0) {
      signalInboxUpdate(user.id, ack.timestamp);
    }

    res.json(ack);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/inbox/batch-status/:batchId
 * Check if a flag update batch was already applied (idempotency lookup).
 */
export const getFlagBatchStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = getUser(req);
    const batchIdParam = req.params.batchId;
    const batchId = Array.isArray(batchIdParam) ? batchIdParam[0] : batchIdParam;

    if (!batchId) {
      return next(new AppError('batchId is required', 400, true));
    }

    const ack = await inboxService.getFlagBatchStatus(user.id, batchId);

    res.json({
      success: true,
      applied: !!ack,
      ack: ack || undefined,
    });
  } catch (error) {
    next(error);
  }
};
