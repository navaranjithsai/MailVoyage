import { Router } from 'express';
import * as mailController from '../controllers/mail.controller.js';
import { authenticateToken } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { sendMailSchema, setupMailServerSchema } from '../utils/validationSchemas.js';

const router = Router();

// All mail routes require authentication
router.use(authenticateToken);

// Mail Server Config (SMTP/IMAP)
router.post('/config', validateRequest({ body: setupMailServerSchema }), mailController.setupMailServer);
router.get('/config', mailController.getMailServerConfig);

// Mail Operations
router.post('/send', validateRequest({ body: sendMailSchema }), mailController.sendMail);
router.get('/fetch', mailController.fetchMail); // Add query params validation later
router.get('/folders', mailController.getFolders);
router.post('/folders', mailController.createFolder); // Add body validation later
// Add routes for drafts, attachments, specific messages etc.

export default router;
