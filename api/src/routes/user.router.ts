import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { authenticateToken } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { updateUserSchema, updatePreferencesSchema } from '../utils/validationSchemas.js';

const router = Router();

// All user routes require authentication
router.use(authenticateToken);

router.get('/profile', userController.getProfile);
router.put('/profileUpdate', validateRequest({ body: updateUserSchema }), userController.updateProfile);
router.get('/preferences', userController.getPreferences);
router.put('/preferences', validateRequest({ body: updatePreferencesSchema }), userController.updatePreferences);

export default router;
