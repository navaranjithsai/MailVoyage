import { Router } from 'express';
import { logger } from '../utils/logger.js'; // Import logger
// Update import to point to the standardized controller name
import {
  register,
  login,
  logout, // Import logout
  forgotPassword,
  resetPassword,
  validateToken,
  testSMTP // Add testSMTP import
} from '../controllers/auth.controller.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../utils/validationSchemas.js';
import { authenticateToken } from '../middlewares/auth.js'; // Assuming JWT middleware

const router = Router();

// Add global request logger for auth routes
router.use((req, res, next) => {
  logger.info(`Auth route accessed: ${req.method} ${req.path}`, {
    cookies: req.cookies,
    headers: req.headers,
    query: req.query,
  });
  next();
});

router.post('/register', validateRequest({ body: registerSchema }), register);
router.post('/login', validateRequest({ body: loginSchema }), login);
router.post('/logout', logout); // Logout does not require authenticateToken middleware
router.post('/forgot-password', validateRequest({ body: forgotPasswordSchema }), forgotPassword);
router.post('/reset-password', validateRequest({ body: resetPasswordSchema }), resetPassword);
router.get('/validate-token', authenticateToken, validateToken); // Requires auth

// Development/testing endpoints
if (process.env.NODE_ENV === 'development') {
  router.get('/test-smtp', testSMTP); // Test SMTP connection
}

export default router;
