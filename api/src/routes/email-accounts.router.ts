import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.js';
import * as emailAccountsController from '../controllers/email-accounts.controller.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { emailAccountSchema, emailAccountUpdateSchema } from '../utils/validationSchemas.js';

const router = Router();

// All email account routes require authentication
router.use(authenticateToken);

// Get all email accounts for user
router.get('/', emailAccountsController.getEmailAccounts);

// Get autoconfig for domain
router.get('/autoconfig/:domain', emailAccountsController.getAutoConfig);

// Add new email account
router.post('/', validateRequest({ body: emailAccountSchema }), emailAccountsController.addEmailAccount);

// Update email account
router.put('/:id', validateRequest({ body: emailAccountUpdateSchema }), emailAccountsController.updateEmailAccount);

// Delete email account
router.delete('/:id', emailAccountsController.deleteEmailAccount);

// Test email account connection
router.post('/:id/test', emailAccountsController.testEmailAccount);

export default router;
