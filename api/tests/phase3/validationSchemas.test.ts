import { describe, expect, it } from 'vitest';
import {
  emailAccountSchema,
  forgotPasswordSchema,
  registerSchema,
  resetPasswordSchema,
  smtpAccountSchema,
  updateUserSchema,
} from '../../src/utils/validationSchemas';

describe('api validation schemas', () => {
  it('registerSchema accepts valid payload', () => {
    const parsed = registerSchema.safeParse({
      username: 'mailuser',
      email: 'user@example.com',
      password: 'StrongPass!1',
    });

    expect(parsed.success).toBe(true);
  });

  it('forgotPasswordSchema rejects invalid email', () => {
    const parsed = forgotPasswordSchema.safeParse({
      username: 'mailuser',
      email: 'not-an-email',
    });

    expect(parsed.success).toBe(false);
  });

  it('resetPasswordSchema requires OTP and resetChallenge', () => {
    const parsed = resetPasswordSchema.safeParse({
      username: 'mailuser',
      newPassword: 'StrongPass!1',
    });

    expect(parsed.success).toBe(false);
  });

  it('resetPasswordSchema accepts full secure payload', () => {
    const parsed = resetPasswordSchema.safeParse({
      username: 'mailuser',
      otp: 'A1b2C3',
      resetChallenge: 'signed-reset-challenge-token-value',
      newPassword: 'StrongPass!1',
    });

    expect(parsed.success).toBe(true);
  });

  it('emailAccountSchema requires manual host/port when autoconfig is false', () => {
    const parsed = emailAccountSchema.safeParse({
      email: 'user@example.com',
      password: 'app-password',
      autoconfig: false,
      incomingType: 'IMAP',
    });

    expect(parsed.success).toBe(false);
  });

  it('emailAccountSchema allows autoconfig flow without manual host/port', () => {
    const parsed = emailAccountSchema.safeParse({
      email: 'user@example.com',
      password: 'app-password',
      autoconfig: true,
      incomingType: 'IMAP',
    });

    expect(parsed.success).toBe(true);
  });

  it('smtpAccountSchema requires valid security value', () => {
    const parsed = smtpAccountSchema.safeParse({
      email: 'user@example.com',
      host: 'smtp.example.com',
      port: 587,
      password: 'app-password',
      security: 'STARTTLS',
    });

    expect(parsed.success).toBe(true);
  });

  it('updateUserSchema rejects unknown fields (strict schema)', () => {
    const parsed = updateUserSchema.safeParse({
      id: '1',
      username: 'mailuser',
      email: 'user@example.com',
      role: 'admin',
    });

    expect(parsed.success).toBe(false);
  });
});