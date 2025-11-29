import { Router } from 'express';
import * as sentMailsController from '../controllers/sent-mails.controller.js';
import { authenticateToken } from '../middlewares/auth.js';

const router = Router();

// All sent mail routes require authentication
router.use(authenticateToken);

// Get paginated list of sent mails
// GET /api/sent-mails?page=1&limit=20
router.get('/', sentMailsController.getSentMails);

// Get a single sent mail by thread ID
// GET /api/sent-mails/thread/:threadId
router.get('/thread/:threadId', sentMailsController.getSentMailByThreadId);

// Get a single sent mail by ID
// GET /api/sent-mails/:id
router.get('/:id', sentMailsController.getSentMailById);

export default router;
