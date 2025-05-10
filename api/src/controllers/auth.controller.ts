import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service.js';
import { logger } from '../utils/logger.js';

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, email, password } = req.body;
    const result = await authService.registerUser(username, email, password);
    res.status(201).json(result);
  } catch (error) {
    logger.error('Registration error:', error);
    next(error); // Pass error to the global error handler
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser(email, password);
    // Consider setting token in HttpOnly cookie for security
    res.json(result);
  } catch (error) {
    logger.error('Login error:', error);
    next(error);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Implementation depends on how tokens are managed (e.g., blacklist, session)
    // For simple JWT, client just deletes the token.
    // If using refresh tokens stored server-side, invalidate it here.
    res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    logger.error('Logout error:', error);
    next(error);
  }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    await authService.requestPasswordReset(email);
    res.status(200).json({ message: 'Password reset email sent if user exists.' });
  } catch (error) {
    logger.error('Forgot password error:', error);
    next(error);
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, newPassword } = req.body;
    await authService.resetPasswordWithToken(token, newPassword);
    res.status(200).json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    logger.error('Reset password error:', error);
    next(error);
  }
};

export const validateToken = (req: Request, res: Response, next: NextFunction) => {
  // If authenticateToken middleware passed, the token is valid.
  // We can optionally return user info stored in req.user by the middleware.
  // const user = (req as any).user; // Use proper typing
  res.status(200).json({ message: 'Token is valid' /*, user */ });
};
