import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/auth.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/auth.service.js')>(
    '../../src/services/auth.service.js'
  );

  return {
    ...actual,
    loginUser: vi.fn(),
    verifyLoginTwoFactorAuthenticator: vi.fn(),
    requestLoginTwoFactorOtp: vi.fn(),
    verifyLoginTwoFactorOtp: vi.fn(),
    verifyLoginTwoFactorRecoveryCode: vi.fn(),
  };
});

import app from '../../src/app';
import * as authService from '../../src/services/auth.service.js';

const loginUserMock = vi.mocked(authService.loginUser);
const verifyAuthenticatorMock = vi.mocked(authService.verifyLoginTwoFactorAuthenticator);
const requestOtpMock = vi.mocked(authService.requestLoginTwoFactorOtp);

const hostHeader = { Host: 'localhost' };

describe('phase5 2FA auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 2FA challenge payload when login requires second factor', async () => {
    loginUserMock.mockResolvedValue({
      requiresTwoFactor: true,
      twoFactorToken: 'two-factor-login-token-0123456789',
      twoFactorEmail: 'user@example.com',
      methods: ['authenticator', 'email_otp', 'recovery_code'],
      message: 'Two-factor verification required',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });

    const response = await request(app)
      .post('/api/auth/login')
      .set(hostHeader)
      .send({
        email: 'user@example.com',
        password: 'StrongPass!1',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      requiresTwoFactor: true,
      twoFactorEmail: 'user@example.com',
      message: 'Two-factor verification required',
    });
    expect(response.body.methods).toEqual(['authenticator', 'email_otp', 'recovery_code']);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('returns validation error for malformed 2FA authenticator verify payload', async () => {
    const response = await request(app)
      .post('/api/auth/login/2fa/verify')
      .set(hostHeader)
      .send({ twoFactorToken: 'short-token', code: 'abc' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      status: 'fail',
      message: 'Validation Failed',
    });
    expect(response.body.errors).toHaveProperty('code');
    expect(verifyAuthenticatorMock).not.toHaveBeenCalled();
  });

  it('sets auth cookie after successful 2FA authenticator verification', async () => {
    verifyAuthenticatorMock.mockResolvedValue({
      requiresTwoFactor: false,
      token: 'signed-auth-token-value',
      user: {
        id: 1,
        username: 'mailuser',
        email: 'user@example.com',
      },
      message: 'Login successful',
    });

    const response = await request(app)
      .post('/api/auth/login/2fa/verify')
      .set(hostHeader)
      .send({
        twoFactorToken: 'two-factor-login-token-0123456789',
        code: '123456',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      user: {
        id: 1,
        username: 'mailuser',
        email: 'user@example.com',
      },
      message: 'Login successful',
    });

    expect(response.headers['set-cookie']).toBeDefined();
    expect(response.headers['set-cookie'][0]).toContain('authToken=');
  });

  it('returns OTP challenge for email OTP request endpoint', async () => {
    requestOtpMock.mockResolvedValue({
      otpChallengeToken: 'otp-challenge-token-0123456789',
      email: 'user@example.com',
      resendAvailableInSec: 30,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });

    const response = await request(app)
      .post('/api/auth/login/2fa/otp/request')
      .set(hostHeader)
      .send({ twoFactorToken: 'two-factor-login-token-0123456789' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      otpChallengeToken: 'otp-challenge-token-0123456789',
      email: 'user@example.com',
      resendAvailableInSec: 30,
    });
  });
});
