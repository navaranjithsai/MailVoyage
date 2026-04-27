import { describe, expect, it } from 'vitest';
import {
  getDefaultTwoFactorMethods,
  isAuthenticatorCodeValid,
  isEmailOtpCodeValid,
  normalizeRecoveryCode,
  sanitizeTwoFactorMethods,
} from '../../src/lib/twoFactor';

describe('phase5 twoFactor helpers', () => {
  it('returns stable default method order', () => {
    expect(getDefaultTwoFactorMethods()).toEqual(['authenticator', 'email_otp', 'recovery_code']);
  });

  it('sanitizes unsupported methods', () => {
    expect(sanitizeTwoFactorMethods(['email_otp', 'sms', 'authenticator'])).toEqual([
      'email_otp',
      'authenticator',
    ]);
  });

  it('falls back to defaults when methods are empty', () => {
    expect(sanitizeTwoFactorMethods([])).toEqual(['authenticator', 'email_otp', 'recovery_code']);
  });

  it('validates authenticator and email OTP codes', () => {
    expect(isAuthenticatorCodeValid('123456')).toBe(true);
    expect(isAuthenticatorCodeValid('A23456')).toBe(false);

    expect(isEmailOtpCodeValid('A1B2C3')).toBe(true);
    expect(isEmailOtpCodeValid('12-3456')).toBe(false);
  });

  it('normalizes recovery code format', () => {
    expect(normalizeRecoveryCode('abCD-12 34')).toBe('ABCD1234');
  });
});
