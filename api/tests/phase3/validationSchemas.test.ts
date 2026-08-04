import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  emailAccountSchema,
  forgotPasswordSchema,
  loginTwoFactorOtpRequestSchema,
  loginTwoFactorOtpVerifySchema,
  loginTwoFactorRecoveryVerifySchema,
  loginTwoFactorVerifySchema,
  registerSchema,
  resetPasswordSchema,
  sendMailSchema,
  smtpAccountSchema,
  twoFactorDisableSchema,
  twoFactorRecoveryRegenerateSchema,
  twoFactorSetupInitSchema,
  twoFactorSetupVerifySchema,
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

  it('sendMailSchema rejects unsafe attachment filenames', () => {
    const parsed = sendMailSchema.safeParse({
      accountCode: 'ABC',
      to: ['recipient@example.com'],
      subject: 'Hello',
      html: '<p>Hello</p>',
      attachments: [
        {
          filename: '../.env',
          content: 'SGVsbG8=',
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it('sendMailSchema accepts a bounded secure payload', () => {
    const parsed = sendMailSchema.safeParse({
      accountCode: 'ABC',
      to: ['recipient@example.com'],
      cc: ['copy@example.com'],
      bcc: ['blind@example.com'],
      subject: 'Hello',
      html: '<p>Hello</p>',
      attachments: [
        {
          filename: 'report.pdf',
          content: 'SGVsbG8=',
          contentType: 'application/pdf',
          size: 5,
        },
      ],
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

  it('changePasswordSchema accepts valid password update payload', () => {
    const parsed = changePasswordSchema.safeParse({
      currentPassword: 'CurrentPass!1',
      newPassword: 'UpdatedPass!1',
      confirmPassword: 'UpdatedPass!1',
    });

    expect(parsed.success).toBe(true);
  });

  it('changePasswordSchema rejects non-matching confirm password', () => {
    const parsed = changePasswordSchema.safeParse({
      currentPassword: 'CurrentPass!1',
      newPassword: 'UpdatedPass!1',
      confirmPassword: 'MismatchPass!1',
    });

    expect(parsed.success).toBe(false);
  });

  it('changePasswordSchema rejects new password equal to current password', () => {
    const parsed = changePasswordSchema.safeParse({
      currentPassword: 'SamePass!1',
      newPassword: 'SamePass!1',
      confirmPassword: 'SamePass!1',
    });

    expect(parsed.success).toBe(false);
  });

  it('loginTwoFactorVerifySchema accepts valid authenticator payload', () => {
    const parsed = loginTwoFactorVerifySchema.safeParse({
      twoFactorToken: 'signed-login-token-value-0123456789',
      code: '123456',
    });

    expect(parsed.success).toBe(true);
  });

  it('loginTwoFactorVerifySchema rejects non-numeric authenticator code', () => {
    const parsed = loginTwoFactorVerifySchema.safeParse({
      twoFactorToken: 'signed-login-token-value-0123456789',
      code: 'A23456',
    });

    expect(parsed.success).toBe(false);
  });

  it('loginTwoFactorOtpRequestSchema requires twoFactorToken', () => {
    const parsed = loginTwoFactorOtpRequestSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it('loginTwoFactorOtpVerifySchema validates otp challenge payload', () => {
    const parsed = loginTwoFactorOtpVerifySchema.safeParse({
      twoFactorToken: 'signed-login-token-value-0123456789',
      otpChallengeToken: 'signed-otp-challenge-token-value-9876543210',
      code: 'A1B2C3',
    });

    expect(parsed.success).toBe(true);
  });

  it('loginTwoFactorRecoveryVerifySchema requires recoveryCode', () => {
    const parsed = loginTwoFactorRecoveryVerifySchema.safeParse({
      twoFactorToken: 'signed-login-token-value-0123456789',
    });

    expect(parsed.success).toBe(false);
  });

  it('twoFactorSetupInitSchema allows empty body for first-time setup', () => {
    const parsed = twoFactorSetupInitSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('twoFactorSetupVerifySchema requires numeric code', () => {
    const parsed = twoFactorSetupVerifySchema.safeParse({
      setupToken: 'signed-setup-token-value-0123456789',
      code: '654321',
    });

    expect(parsed.success).toBe(true);
  });

  it('twoFactorDisableSchema requires current password', () => {
    const parsed = twoFactorDisableSchema.safeParse({ currentPassword: '' });
    expect(parsed.success).toBe(false);
  });

  it('twoFactorRecoveryRegenerateSchema accepts current password payload', () => {
    const parsed = twoFactorRecoveryRegenerateSchema.safeParse({ currentPassword: 'StrongPass!1' });
    expect(parsed.success).toBe(true);
  });
});