import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.js';
import * as controller from '../controllers/smtp-accounts.controller.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { smtpAccountSchema, smtpAccountUpdateSchema } from '../utils/validationSchemas.js';

const router = Router();
router.use(authenticateToken);

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', validateRequest({ body: smtpAccountSchema }), controller.create);
router.put('/:id', validateRequest({ body: smtpAccountUpdateSchema }), controller.update);
router.delete('/:id', controller.remove);
router.post('/:id/test', controller.test);

export default router;
