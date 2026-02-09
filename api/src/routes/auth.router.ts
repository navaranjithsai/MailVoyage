import { Router } from 'express';
// Update import to point to the standardized controller name
import {
  register,
  login,
  logout, // Import logout
  forgotPassword,
  resetPassword,
  validateToken,
  testSMTP, // Add testSMTP import
  getWebSocketToken // WebSocket token for real-time sync
} from '../controllers/auth.controller.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../utils/validationSchemas.js';
import { authenticateToken } from '../middlewares/auth.js'; // Assuming JWT middleware

const router = Router();

router.post('/register', validateRequest({ body: registerSchema }), register);
router.post('/login', validateRequest({ body: loginSchema }), login);
router.post('/logout', logout); // Logout does not require authenticateToken middleware
router.post('/forgot-password', validateRequest({ body: forgotPasswordSchema }), forgotPassword);
router.post('/reset-password', validateRequest({ body: resetPasswordSchema }), resetPassword);
router.get('/validate-token', authenticateToken, validateToken); // Requires auth
router.get('/ws-token', authenticateToken, getWebSocketToken); // Get short-lived WebSocket token

// Development/testing endpoints
if (process.env.NODE_ENV === 'development') {
  router.get('/test-smtp', testSMTP); // Test SMTP connection
}

export default router;
