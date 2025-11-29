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
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

// --- User Schemas ---
export const updateUserSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String), // Accept both string and number, convert to string
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
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
  accountCode: z.string().min(3, 'Account code is required'),
  to: z.array(z.string().email('Invalid email address')).min(1, 'At least one recipient is required'),
  cc: z.array(z.string().email('Invalid email address')).optional(),
  bcc: z.array(z.string().email('Invalid email address')).optional(),
  subject: z.string().min(1, 'Subject is required'),
  html: z.string().min(1, 'Email body is required'),
  text: z.string().optional(),
  attachments: z.array(z.object({
    filename: z.string(),
    content: z.string(), // base64 encoded
    contentType: z.string().optional(),
    size: z.number().optional(), // Size in bytes
  })).optional(),
});

// --- Email Account Schemas ---
export const emailAccountSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  autoconfig: z.boolean().optional(),
  incomingType: z.enum(['IMAP', 'POP3']).default('IMAP'),
  incomingHost: z.string().optional(),
  incomingPort: z.number().int().min(1).max(65535, 'Invalid port number').optional(),
  incomingUsername: z.string().optional(),
  incomingSecurity: z.enum(['SSL', 'STARTTLS', 'NONE']).default('SSL'),
  outgoingHost: z.string().optional(),
  outgoingPort: z.number().int().min(1).max(65535, 'Invalid port number').optional(),
  outgoingUsername: z.string().optional(),
  outgoingPassword: z.string().optional(),
  outgoingSecurity: z.enum(['SSL', 'STARTTLS', 'NONE']).default('SSL'),
}).refine((data) => {
  // If autoconfig is false or not provided, require manual setup fields
  if (!data.autoconfig) {
    return data.incomingHost && data.incomingPort && data.outgoingHost && data.outgoingPort;
  }
  return true;
}, {
  message: "Incoming and outgoing host/port are required for manual setup",
});

export const emailAccountUpdateSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  password: z.string().min(1, 'Password is required').optional(),
  autoconfig: z.boolean().optional(),
  incomingType: z.enum(['IMAP', 'POP3']).optional(),
  incomingHost: z.string().optional(),
  incomingPort: z.number().int().min(1).max(65535, 'Invalid port number').optional(),
  incomingUsername: z.string().optional(),
  incomingSecurity: z.enum(['SSL', 'STARTTLS', 'NONE']).optional(),
  outgoingHost: z.string().optional(),
  outgoingPort: z.number().int().min(1).max(65535, 'Invalid port number').optional(),
  outgoingUsername: z.string().optional(),
  outgoingPassword: z.string().optional(),
  outgoingSecurity: z.enum(['SSL', 'STARTTLS', 'NONE']).optional(),
  isPrimary: z.boolean().optional(),
});

// --- SMTP Only Account Schemas ---
export const smtpAccountSchema = z.object({
  email: z.string().email('Invalid email address'),
  host: z.string().min(1, 'SMTP host is required'),
  port: z.number().int().min(1).max(65535, 'Invalid port number'),
  username: z.string().optional(),
  password: z.string().min(1, 'Password is required'),
  security: z.enum(['SSL', 'TLS', 'STARTTLS', 'PLAIN', 'NONE']).default('SSL'),
}).strict();

export const smtpAccountUpdateSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  security: z.enum(['SSL', 'TLS', 'STARTTLS', 'PLAIN', 'NONE']).optional(),
  isActive: z.boolean().optional(),
}).strict();
