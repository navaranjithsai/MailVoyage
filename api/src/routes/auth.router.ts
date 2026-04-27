import { Router } from 'express';
// Update import to point to the standardized controller name
import {
  register,
  login,
  loginTwoFactorVerify,
  requestLoginTwoFactorOtp,
  verifyLoginTwoFactorOtp,
  verifyLoginTwoFactorRecoveryCode,
  getTwoFactorStatus,
  initTwoFactorSetup,
  verifyTwoFactorSetup,
  disableTwoFactor,
  regenerateTwoFactorRecoveryCodes,
  logout, // Import logout
  forgotPassword,
  resetPassword,
  validateToken,
  testSMTP, // Add testSMTP import
  getWebSocketToken // WebSocket token for real-time sync
} from '../controllers/auth.controller.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  loginTwoFactorVerifySchema,
  loginTwoFactorOtpRequestSchema,
  loginTwoFactorOtpVerifySchema,
  loginTwoFactorRecoveryVerifySchema,
  twoFactorSetupInitSchema,
  twoFactorSetupVerifySchema,
  twoFactorDisableSchema,
  twoFactorRecoveryRegenerateSchema,
} from '../utils/validationSchemas.js';
import { authenticateToken } from '../middlewares/auth.js'; // Assuming JWT middleware

const router = Router();

router.post('/register', validateRequest({ body: registerSchema }), register);
router.post('/login', validateRequest({ body: loginSchema }), login);
router.post('/login/2fa/verify', validateRequest({ body: loginTwoFactorVerifySchema }), loginTwoFactorVerify);
router.post('/login/2fa/otp/request', validateRequest({ body: loginTwoFactorOtpRequestSchema }), requestLoginTwoFactorOtp);
router.post('/login/2fa/otp/verify', validateRequest({ body: loginTwoFactorOtpVerifySchema }), verifyLoginTwoFactorOtp);
router.post('/login/2fa/recovery/verify', validateRequest({ body: loginTwoFactorRecoveryVerifySchema }), verifyLoginTwoFactorRecoveryCode);
router.post('/logout', logout); // Logout does not require authenticateToken middleware
router.post('/forgot-password', validateRequest({ body: forgotPasswordSchema }), forgotPassword);
router.post('/reset-password', validateRequest({ body: resetPasswordSchema }), resetPassword);
router.get('/validate-token', authenticateToken, validateToken); // Requires auth
router.get('/ws-token', authenticateToken, getWebSocketToken); // Get short-lived WebSocket token
router.get('/2fa/status', authenticateToken, getTwoFactorStatus);
router.post('/2fa/setup/init', authenticateToken, validateRequest({ body: twoFactorSetupInitSchema }), initTwoFactorSetup);
router.post('/2fa/setup/verify', authenticateToken, validateRequest({ body: twoFactorSetupVerifySchema }), verifyTwoFactorSetup);
router.post('/2fa/disable', authenticateToken, validateRequest({ body: twoFactorDisableSchema }), disableTwoFactor);
router.post('/2fa/recovery/regenerate', authenticateToken, validateRequest({ body: twoFactorRecoveryRegenerateSchema }), regenerateTwoFactorRecoveryCodes);

// Development/testing endpoints
if (process.env.NODE_ENV === 'development') {
  router.get('/test-smtp', testSMTP); // Test SMTP connection
}

export default router;
