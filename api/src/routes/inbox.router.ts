import { Router } from 'express';
import * as inboxController from '../controllers/inbox.controller.js';
import { authenticateToken } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { inboxFlagUpdatesSchema } from '../utils/validationSchemas.js';

const router = Router();

// All inbox routes require authentication
router.use(authenticateToken);

// Get cached mails from server DB (fast initial load)
router.get('/cached', inboxController.getCachedMails);

// Fetch mails from mail server via IMAP (full fetch)
router.get('/fetch', inboxController.fetchMails);

// Sync: fetch from IMAP + update server cache
router.post('/sync', inboxController.syncInbox);

// Lightweight mailbox status check (no message download)
router.get('/status', inboxController.getMailboxStatus);

// Apply read/star flag updates (batched)
router.post('/flag-updates', validateRequest({ body: inboxFlagUpdatesSchema }), inboxController.applyFlagUpdates);

// Check if a flag batch was already applied
router.get('/batch-status/:batchId', inboxController.getFlagBatchStatus);

// Search mails on IMAP server (progressive date-range search)
router.post('/search', inboxController.searchOnServer);

// Get email accounts for inbox dropdown (no SMTP-only)
router.get('/accounts', inboxController.getInboxAccounts);

// User inbox settings
router.get('/settings', inboxController.getSettings);
router.put('/settings', inboxController.updateSettings);

// Predictive eviction count for the cache-limit decrease confirm dialog
router.get('/settings/preview-eviction', inboxController.previewEviction);

export default router;
