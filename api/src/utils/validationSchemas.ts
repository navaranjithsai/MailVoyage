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

export const loginTwoFactorVerifySchema = z.object({
  twoFactorToken: z.string().min(20, 'Two-factor token is required'),
  code: z.string().regex(/^\d{6}$/, 'Authenticator code must be 6 digits'),
});

export const loginTwoFactorOtpRequestSchema = z.object({
  twoFactorToken: z.string().min(20, 'Two-factor token is required'),
});

export const loginTwoFactorOtpVerifySchema = z.object({
  twoFactorToken: z.string().min(20, 'Two-factor token is required'),
  otpChallengeToken: z.string().min(20, 'OTP challenge token is required'),
  code: z.string().length(6, 'OTP must be 6 characters').regex(/^[A-Za-z0-9]{6}$/, 'OTP must be alphanumeric'),
});

export const loginTwoFactorRecoveryVerifySchema = z.object({
  twoFactorToken: z.string().min(20, 'Two-factor token is required'),
  recoveryCode: z.string().min(6, 'Recovery code is required'),
});

export const twoFactorSetupInitSchema = z.object({
  currentPassword: z.string().min(8, 'Current password must be at least 8 characters').optional(),
});

export const twoFactorSetupVerifySchema = z.object({
  setupToken: z.string().min(20, 'Setup token is required'),
  code: z.string().regex(/^\d{6}$/, 'Authenticator code must be 6 digits'),
});

export const twoFactorDisableSchema = z.object({
  currentPassword: z.string().min(8, 'Current password must be at least 8 characters'),
});

export const twoFactorRecoveryRegenerateSchema = z.object({
  currentPassword: z.string().min(8, 'Current password must be at least 8 characters'),
});

export const forgotPasswordSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  otp: z.string().length(6, 'OTP must be 6 characters').regex(/^[A-Za-z0-9]{6}$/, 'OTP must be alphanumeric'),
  resetChallenge: z.string().min(20, 'Reset challenge is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

// --- User Schemas ---
export const updateUserSchema = z.object({
  // SECURITY: The target user identity is derived server-side from the auth
  // token (req.user.id). Do NOT accept an `id` in the body — allowing it
  // would let any authenticated user target someone else's profile.
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
}).strict(); // Disallow extra fields (including any `id`)

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .regex(/[A-Z]/, 'New password must include at least one uppercase letter')
      .regex(/[a-z]/, 'New password must include at least one lowercase letter')
      .regex(/[^A-Za-z0-9]/, 'New password must include at least one special character'),
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Confirm password does not match',
      });
    }

    if (data.currentPassword === data.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['newPassword'],
        message: 'New password must be different from current password',
      });
    }
  });

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
  accountCode: z.string().min(3, 'Account code is required').max(64, 'Account code is too long'),
  to: z.array(z.string().email('Invalid email address')).min(1, 'At least one recipient is required').max(50, 'Too many recipients'),
  cc: z.array(z.string().email('Invalid email address')).max(50, 'Too many CC recipients').optional(),
  bcc: z.array(z.string().email('Invalid email address')).max(50, 'Too many BCC recipients').optional(),
  subject: z.string().min(1, 'Subject is required').max(998, 'Subject is too long'),
  html: z.string().min(1, 'Email body is required').max(1_000_000, 'Email body is too large'),
  text: z.string().optional(),
  attachments: z.array(z.object({
    filename: z.string().min(1).max(255).regex(/^[^\r\n\\/]+$/, 'Invalid attachment filename'),
    content: z.string().min(1), // base64 encoded
    contentType: z.string().max(255).optional(),
    size: z.number().optional(), // Size in bytes
  })).max(20, 'Too many attachments').optional(),
});

export const inboxFlagUpdatesSchema = z.object({
  batchId: z.string().min(8, 'batchId is required'),
  updates: z.array(
    z.object({
      cacheId: z.union([z.string(), z.number()]),
      accountCode: z.string().min(1, 'accountCode is required').optional(),
      mailbox: z.string().min(1).optional(),
      uid: z.union([z.string(), z.number()]).optional(),
      messageId: z.string().optional(),
      isRead: z.boolean().optional(),
      isStarred: z.boolean().optional(),
    }).strict().refine(
      update => update.isRead !== undefined || update.isStarred !== undefined,
      { message: 'isRead or isStarred is required' }
    )
  ).min(1, 'At least one update is required').max(50, 'Too many updates in one batch'),
}).strict();

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
