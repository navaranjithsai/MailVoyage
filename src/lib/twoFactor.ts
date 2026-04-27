export type TwoFactorMethod = 'authenticator' | 'email_otp' | 'recovery_code';

const ALL_METHODS: TwoFactorMethod[] = ['authenticator', 'email_otp', 'recovery_code'];

export const getDefaultTwoFactorMethods = (): TwoFactorMethod[] => [...ALL_METHODS];

export const sanitizeTwoFactorMethods = (methods: string[] | undefined): TwoFactorMethod[] => {
  if (!methods || methods.length === 0) {
    return getDefaultTwoFactorMethods();
  }

  const safe = methods.filter((method): method is TwoFactorMethod =>
    ALL_METHODS.includes(method as TwoFactorMethod)
  );

  return safe.length > 0 ? safe : getDefaultTwoFactorMethods();
};

export const isAuthenticatorCodeValid = (code: string): boolean => /^\d{6}$/.test(code.trim());

export const isEmailOtpCodeValid = (code: string): boolean => /^[A-Za-z0-9]{6}$/.test(code.trim());

export const normalizeRecoveryCode = (code: string): string =>
  code.toUpperCase().replace(/[^A-Z0-9]/g, '');
