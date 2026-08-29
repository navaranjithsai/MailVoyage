import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { AlertCircle, Eye, EyeOff, KeyRound, Lock, LogIn, Mail, ShieldCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import { OtpClassicInput, OtpPinCellsInput } from '@/components/ui/OtpCodeInput';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiFetch';
import { ThemeSwitcherCapsule as ThemeSwitcher } from '@/components/common/ThemeSwitcherCapsule';
import { emailValidation } from '@/lib/validators';
import {
  isAuthenticatorCodeValid,
  isEmailOtpCodeValid,
  normalizeRecoveryCode,
  sanitizeTwoFactorMethods,
  type TwoFactorMethod,
} from '@/lib/twoFactor';

interface LoginForm {
  email: string;
  password: string;
}

interface AuthUser {
  id: number;
  username: string;
  email: string;
}

interface TwoFactorLoginResponse {
  requiresTwoFactor: true;
  twoFactorToken: string;
  twoFactorEmail: string;
  methods: TwoFactorMethod[];
  message: string;
}

interface LoginSuccessResponse {
  user: AuthUser;
  message: string;
}

const isTwoFactorLoginResponse = (
  response: LoginSuccessResponse | TwoFactorLoginResponse
): response is TwoFactorLoginResponse => {
  return (response as TwoFactorLoginResponse).requiresTwoFactor === true;
};

const LoginPage: React.FC = () => {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>();
  const [showPassword, setShowPassword] = useState(false);
  const [isTwoFactorPending, setIsTwoFactorPending] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [twoFactorEmail, setTwoFactorEmail] = useState('');
  const [twoFactorMethods, setTwoFactorMethods] = useState<TwoFactorMethod[]>([]);
  const [activeMethod, setActiveMethod] = useState<TwoFactorMethod>('authenticator');
  const [authenticatorCode, setAuthenticatorCode] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [otpChallengeToken, setOtpChallengeToken] = useState('');
  const [otpResendInSec, setOtpResendInSec] = useState(0);
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [isVerifyingFactor, setIsVerifyingFactor] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const togglePasswordVisibility = () => setShowPassword((v) => !v);

  React.useEffect(() => {
    if (otpResendInSec <= 0) return;

    const intervalId = window.setInterval(() => {
      setOtpResendInSec((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [otpResendInSec]);

  const resetTwoFactorState = () => {
    setIsTwoFactorPending(false);
    setTwoFactorToken('');
    setTwoFactorEmail('');
    setTwoFactorMethods([]);
    setActiveMethod('authenticator');
    setAuthenticatorCode('');
    setEmailOtpCode('');
    setRecoveryCode('');
    setOtpChallengeToken('');
    setOtpResendInSec(0);
    setIsRequestingOtp(false);
    setIsVerifyingFactor(false);
  };

  const completeLogin = (user: AuthUser, message = 'Login successful!') => {
    login(user);
    toast.success(message);
    navigate('/dashboard');
  };

  const startTwoFactorChallenge = (response: TwoFactorLoginResponse) => {
    const methods = sanitizeTwoFactorMethods(response.methods);
    setIsTwoFactorPending(true);
    setTwoFactorToken(response.twoFactorToken);
    setTwoFactorEmail(response.twoFactorEmail);
    setTwoFactorMethods(methods);
    setActiveMethod(methods[0] ?? 'authenticator');
    toast.info(response.message || 'Two-factor verification required.');
  };

  const requestEmailOtp = async () => {
    if (!twoFactorToken) return;

    setIsRequestingOtp(true);
    try {
      const response = await apiFetch('/api/auth/login/2fa/otp/request', {
        method: 'POST',
        body: JSON.stringify({ twoFactorToken }),
      }) as {
        otpChallengeToken: string;
        resendAvailableInSec?: number;
      };

      setOtpChallengeToken(response.otpChallengeToken);
      setOtpResendInSec(response.resendAvailableInSec ?? 30);
      setActiveMethod('email_otp');
      toast.success('Verification code sent to your email.');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Unable to send OTP right now.');
    } finally {
      setIsRequestingOtp(false);
    }
  };

  const verifySecondFactor = async () => {
    if (!twoFactorToken) {
      toast.error('Two-factor session expired. Please login again.');
      resetTwoFactorState();
      return;
    }

    setIsVerifyingFactor(true);
    try {
      let response: LoginSuccessResponse;

      if (activeMethod === 'authenticator') {
        const code = authenticatorCode.trim();
        if (!isAuthenticatorCodeValid(code)) {
          throw new Error('Authenticator code must be 6 digits.');
        }

        response = await apiFetch('/api/auth/login/2fa/verify', {
          method: 'POST',
          body: JSON.stringify({ twoFactorToken, code }),
        }) as LoginSuccessResponse;
      } else if (activeMethod === 'email_otp') {
        const code = emailOtpCode.trim();
        if (!otpChallengeToken) {
          throw new Error('Request an OTP first.');
        }
        if (!isEmailOtpCodeValid(code)) {
          throw new Error('OTP must be 6 alphanumeric characters.');
        }

        response = await apiFetch('/api/auth/login/2fa/otp/verify', {
          method: 'POST',
          body: JSON.stringify({
            twoFactorToken,
            otpChallengeToken,
            code,
          }),
        }) as LoginSuccessResponse;
      } else {
        const code = normalizeRecoveryCode(recoveryCode.trim());
        if (!code) {
          throw new Error('Recovery code is required.');
        }

        response = await apiFetch('/api/auth/login/2fa/recovery/verify', {
          method: 'POST',
          body: JSON.stringify({
            twoFactorToken,
            recoveryCode: code,
          }),
        }) as LoginSuccessResponse;
      }

      resetTwoFactorState();
      completeLogin(response.user, response.message || 'Login successful!');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Two-factor verification failed.');
    } finally {
      setIsVerifyingFactor(false);
    }
  };

  const onSubmit = async (data: LoginForm) => {
    try {
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }) as LoginSuccessResponse | TwoFactorLoginResponse;

      if (isTwoFactorLoginResponse(response)) {
        startTwoFactorChallenge(response);
        return;
      }

      if (response.user) {
        completeLogin(response.user, response.message || 'Login successful!');
        return;
      }

      toast.error('Login failed: No user data received.');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Login failed. Please check your credentials.');
    }
  };

  const methodButtonClass = (method: TwoFactorMethod): string => {
    const active = activeMethod === method;
    return [
      'px-3 py-2 rounded-md text-sm font-medium border transition-colors',
      active
        ? 'bg-blue-600 text-white border-blue-600'
        : 'bg-transparent text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-500',
    ].join(' ');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <ThemeSwitcher />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md w-96"
      >
        <div className="flex justify-center mb-6">
          <div className="rounded-full bg-blue-600 p-3 text-white">
            <Mail size={32} />
          </div>
        </div>
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800 dark:text-gray-200">
          Login to MailVoyage
        </h2>
        {!isTwoFactorPending ? (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="email">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  id="email"
                  autoComplete="email"
                  {...register('email', emailValidation)}
                  className={`pl-10 mt-1 block w-full border h-11 rounded-md shadow-sm focus:ring focus:ring-blue-500 
                    ${errors.email ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} dark:text-gray-300`}
                  placeholder="Enter your email"
                  autoFocus
                />
              </div>
              {errors.email && (
                <p className="text-red-500 text-xs mt-1 flex items-start gap-1">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span>{errors.email.message}</span>
                </p>
              )}
            </div>
            <div className="mb-6">
              <div className="flex justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="password">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  autoComplete="current-password" placeholder="Enter your password"
                  {...register('password', { required: 'Password is required' })}
                  className={`pl-10 pr-10 mt-1 block w-full border h-11 rounded-md shadow-sm focus:ring focus:ring-blue-500 
                    ${errors.password ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} dark:text-gray-300`}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-900 bg-transparent"
                  onClick={togglePasswordVisibility}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-500 text-xs mt-1 flex items-start gap-1">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span>{errors.password.message}</span>
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="submit-button-gradient-border w-full flex items-center justify-center gap-2 rounded-md px-4 py-2 h-11
                bg-blue-500 text-white hover:bg-blue-600 dark:bg-white dark:text-black dark:hover:bg-gray-100 
                dark:border dark:border-gray-300 transition-colors"
            >
              {isSubmitting ? (
                <div className="h-5 w-5 border-2 border-white dark:border-black border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <LogIn size={18} />
                  Login
                </>
              )}
            </Button>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void verifySecondFactor();
            }}
          >
            <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-800 p-3">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                <ShieldCheck size={16} />
                Two-factor verification required
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-200 mt-1">
                Continue sign-in for {twoFactorEmail}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {twoFactorMethods.map((method) => (
                <button
                  key={method}
                  type="button"
                  className={methodButtonClass(method)}
                  onClick={() => setActiveMethod(method)}
                >
                  {method === 'authenticator' && 'Authenticator'}
                  {method === 'email_otp' && 'Email OTP'}
                  {method === 'recovery_code' && 'Recovery Code'}
                </button>
              ))}
            </div>

            {activeMethod === 'authenticator' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="authenticator-code">
                  Authenticator Code
                </label>
                <OtpPinCellsInput
                  id="authenticator-code"
                  value={authenticatorCode}
                  onChange={setAuthenticatorCode}
                  onEnter={() => {
                    void verifySecondFactor();
                  }}
                  mode="numeric"
                  length={6}
                  autoComplete="one-time-code"
                  state={
                    authenticatorCode.length === 6 && isAuthenticatorCodeValid(authenticatorCode)
                      ? 'success'
                      : 'default'
                  }
                  containerClassName="mt-1"
                  autoFocus
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>
            )}

            {activeMethod === 'email_otp' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="email-otp-code">
                    Email OTP
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="small"
                    disabled={isRequestingOtp || otpResendInSec > 0}
                    onClick={requestEmailOtp}
                    className="flex items-center gap-1"
                  >
                    <KeyRound size={14} />
                    {otpChallengeToken ? (otpResendInSec > 0 ? `Resend in ${otpResendInSec}s` : 'Resend OTP') : 'Send OTP'}
                  </Button>
                </div>
                <OtpPinCellsInput
                  id="email-otp-code"
                  value={emailOtpCode}
                  onChange={setEmailOtpCode}
                  onEnter={() => {
                    void verifySecondFactor();
                  }}
                  mode="alphanumeric"
                  length={6}
                  autoComplete="one-time-code"
                  state={
                    emailOtpCode.length === 6 && isEmailOtpCodeValid(emailOtpCode)
                      ? 'success'
                      : 'default'
                  }
                  containerClassName="mt-1"
                />
                {!otpChallengeToken && (
                  <p className="text-xs text-amber-600 dark:text-amber-300">Request an OTP before submitting this method.</p>
                )}
              </div>
            )}

            {activeMethod === 'recovery_code' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="recovery-code">
                  Recovery Code
                </label>
                <OtpClassicInput
                  id="recovery-code"
                  value={recoveryCode}
                  onChange={(nextValue) => setRecoveryCode(nextValue.toUpperCase())}
                  onEnter={() => {
                    void verifySecondFactor();
                  }}
                  mode="alphanumeric"
                  length={9}
                  autoComplete="one-time-code"
                  className="mt-1 text-base tracking-[0.25em] uppercase"
                  placeholder="ABCD-EFGH"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Recovery codes are single-use. A code will be consumed on successful login.
                </p>
              </div>
            )}

            <Button
              type="submit"
              disabled={isVerifyingFactor}
              className="submit-button-gradient-border w-full flex items-center justify-center gap-2 rounded-md px-4 py-2 h-11
                bg-blue-500 text-white hover:bg-blue-600 dark:bg-white dark:text-black dark:hover:bg-gray-100 
                dark:border dark:border-gray-300 transition-colors"
            >
              {isVerifyingFactor ? (
                <div className="h-5 w-5 border-2 border-white dark:border-black border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <ShieldCheck size={18} />
                  Verify & Login
                </>
              )}
            </Button>

            <button
              type="button"
              className="w-full text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
              onClick={resetTwoFactorState}
            >
              Use another account
            </button>
          </form>
        )}
        <div className="mt-6 text-center text-sm">
          <span className="text-gray-600 dark:text-gray-300">Don't have an account?</span>{' '}
          <Link
            to="/register"
            className="text-blue-600 hover:text-blue-700 hover:underline transition-colors font-medium"
          >
            Register here
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginPage;
