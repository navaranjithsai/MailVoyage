import { Router } from 'express';
// Update import to point to the standardized controller name
import {
  register,
  login,
  // logout, // Assuming logout is also in auth.controller.ts if needed
  forgotPassword,
  resetPassword,
  validateToken
} from '../controllers/auth.controller.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../utils/validationSchemas.js';
import { authenticateToken } from '../middlewares/auth.js'; // Assuming JWT middleware

const router = Router();

router.post('/register', validateRequest({ body: registerSchema }), register);
router.post('/login', validateRequest({ body: loginSchema }), login);
// router.post('/logout', authenticateToken, logout); // Requires auth - Uncomment if logout is implemented and imported
router.post('/forgot-password', validateRequest({ body: forgotPasswordSchema }), forgotPassword);
router.post('/reset-password', validateRequest({ body: resetPasswordSchema }), resetPassword);
router.get('/validate-token', authenticateToken, validateToken); // Requires auth

export default router;
