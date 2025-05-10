import { z } from 'zod';

// --- Auth Schemas ---
export const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'), // Basic check, actual validation is via bcrypt
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

// --- User Schemas ---
export const updateUserSchema = z.object({
  username: z.string().min(3).optional(),
  // Add other updatable profile fields
}).strict(); // Disallow extra fields

export const updatePreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  notificationsEnabled: z.boolean().optional(),
  // Add other preferences
}).strict();

// --- Mail Schemas ---
export const setupMailServerSchema = z.object({
  // Define structure for SMTP/IMAP config
  smtp: z.object({
    host: z.string().min(1),
    port: z.number().positive(),
    user: z.string().min(1),
    password: z.string().min(1),
    secure: z.boolean().default(true),
  }).optional(),
  imap: z.object({
    host: z.string().min(1),
    port: z.number().positive(),
    user: z.string().min(1),
    password: z.string().min(1),
    secure: z.boolean().default(true),
  }).optional(),
  // Add POP3 if needed
}).refine(data => data.smtp || data.imap, {
  message: 'At least one mail server configuration (SMTP or IMAP) is required.',
});

export const sendMailSchema = z.object({
  to: z.string().email().or(z.array(z.string().email()).min(1)), // Single email or array
  subject: z.string().optional(),
  text: z.string().optional(),
  html: z.string().optional(),
  // Add cc, bcc, attachments later
}).refine(data => data.text || data.html, {
  message: 'Either text or html body must be provided.',
});
