import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mail, 
  User, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowLeft, 
  Shield, 
  CheckCircle, 
  AlertCircle, 
  Loader2 
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { ThemeSwitcherCapsule as ThemeSwitcher } from '@/components/common/ThemeSwitcherCapsule';
import { apiFetch } from '@/lib/apiFetch';
import { toast } from '@/lib/toast';
import { emailValidation, passwordValidation } from '@/lib/validators';

import { sha256 } from '@/lib/crypto';

// Client-side hashing function for OTP verification (using the same algorithm as backend)
const hashOTP = async (otp: string, username: string): Promise<string> => {
  const combined = otp + username;
  return await sha256(combined);
};

interface Step1Form {
  username: string;
  email: string;
}

interface Step2Form {
  otp: string;
  newPassword: string;
  confirmPassword: string;
}

const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  
  // Form management
  const step1Form = useForm<Step1Form>();
  const step2Form = useForm<Step2Form>();
  
  // State management
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [serverHashedOTP, setServerHashedOTP] = useState<string>('');
  const [savedUsername, setSavedUsername] = useState<string>('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPasswordFocused, setNewPasswordFocused] = useState(false);
  
  // Watch form values for validation
  const newPassword = step2Form.watch('newPassword');
  const confirmPassword = step2Form.watch('confirmPassword');
  const otp = step2Form.watch('otp');

  // Password validation state
  const [passwordValidations, setPasswordValidations] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    special: false,
  });

  // Real-time password validation
  useEffect(() => {
    if (newPassword) {
      setPasswordValidations({
        length: newPassword.length >= 8,
        uppercase: /[A-Z]/.test(newPassword),
        lowercase: /[a-z]/.test(newPassword),
        number: /[0-9]/.test(newPassword),
        special: /[^A-Za-z0-9]/.test(newPassword),
      });
    } else {
      setPasswordValidations({
        length: false,
        uppercase: false,
        lowercase: false,
        number: false,
        special: false,
      });
    }
  }, [newPassword]);

  // Handle Step 1: Username & Email Verification
  const handleStep1Submit = async (data: Step1Form) => {
    setIsLoading(true);
    try {
      const response = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      // Store the hashed OTP and username for step 2
      setServerHashedOTP(response.hashedOTP);
      setSavedUsername(response.username);
      
      // Proceed to step 2
      setCurrentStep(2);
      toast.success('OTP sent to your email address');
      
    } catch (error: any) {
      const errorMessage = error.meta?.general || 'Failed to verify user credentials';
      toast.error(errorMessage);
      
      if (error.meta) {
        Object.keys(error.meta).forEach(field => {
          if (field !== 'general') {
            step1Form.setError(field as keyof Step1Form, {
              type: 'server',
              message: error.meta[field]
            });
          }
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle OTP Verification
  const handleOTPVerify = async () => {
    if (!otp || otp.length !== 6) {
      step2Form.setError('otp', {
        type: 'manual',
        message: 'Please enter a 6-character OTP'
      });
      return;
    }

    setIsLoading(true);
    try {
      // Hash the entered OTP with saved username
      const clientHashedOTP = await hashOTP(otp, savedUsername);
      
      // Compare with server-provided hash
      if (clientHashedOTP === serverHashedOTP) {
        setOtpVerified(true);
        step2Form.clearErrors('otp');
        toast.success('OTP verified successfully');
      } else {
        step2Form.setError('otp', {
          type: 'manual',
          message: 'Invalid OTP. Please check and try again.'
        });
        toast.error('Invalid OTP');
      }
    } catch (error) {
      step2Form.setError('otp', {
        type: 'manual',
        message: 'Failed to verify OTP'
      });
      toast.error('Failed to verify OTP');
    } finally {
      setIsLoading(false);
    }
  };
  // Handle Step 2: Password Reset (simplified - no server verification needed)
  const handleStep2Submit = async (data: Step2Form) => {
    if (!otpVerified) {
      step2Form.setError('otp', {
        type: 'manual',
        message: 'Please verify OTP first'
      });
      return;
    }

    if (data.newPassword !== data.confirmPassword) {
      step2Form.setError('confirmPassword', {
        type: 'manual',
        message: 'Passwords do not match'
      });
      return;
    }

    setIsLoading(true);
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: savedUsername,
          newPassword: data.newPassword
        }),
      });

      toast.success('Password updated successfully');
      navigate('/login', { 
        state: { message: 'Password reset successful. Please login with your new password.' }
      });
      
    } catch (error: any) {
      const errorMessage = error.meta?.general || 'Failed to update password';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle back to step 1
  const handleBackToStep1 = () => {
    setCurrentStep(1);
    setOtpVerified(false);
    setServerHashedOTP('');
    setSavedUsername('');
    step2Form.reset();
  };

  // Check if OTP input should show verify button inline or below
  const [showInlineVerify, setShowInlineVerify] = useState(true);
  
  useEffect(() => {
    const checkWidth = () => {
      const otpInput = document.getElementById('otp-input');
      if (otpInput) {
        const inputWidth = otpInput.offsetWidth;
        setShowInlineVerify(inputWidth > 200); // Show inline if width > 200px
      }
    };
    
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, [currentStep]);

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <ThemeSwitcher />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 text-center">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-4"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-4">
                <Shield size={32} className="text-blue-600 dark:text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Reset Password
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                {currentStep === 1 
                  ? "We'll send you an OTP to reset your password" 
                  : "Enter the OTP and set your new password"
                }
              </p>
            </motion.div>
          </div>

          {/* Form Container */}
          <div className="px-8 pb-8">
            <AnimatePresence mode="wait">
              {currentStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <form onSubmit={step1Form.handleSubmit(handleStep1Submit)} className="space-y-6">
                    {/* Username Field */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Username
                      </label>
                      <div className="relative">
                        <User 
                          size={20} 
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" 
                        />
                        <input
                          {...step1Form.register('username', {
                            required: 'Username is required',
                            minLength: { value: 3, message: 'Username must be at least 3 characters' }
                          })}
                          type="text"
                          className={`
                            w-full pl-11 pr-4 py-3 border rounded-lg transition-colors duration-200
                            bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                            placeholder-gray-500 dark:placeholder-gray-400
                            focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                            ${step1Form.formState.errors.username 
                              ? 'border-red-500 dark:border-red-400' 
                              : 'border-gray-300 dark:border-gray-600'
                            }
                          `}
                          placeholder="Enter your username"
                          disabled={isLoading}
                        />
                      </div>
                      {step1Form.formState.errors.username && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                          <AlertCircle size={14} />
                          {step1Form.formState.errors.username.message}
                        </p>
                      )}
                    </div>

                    {/* Email Field */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Email Address
                      </label>
                      <div className="relative">
                        <Mail 
                          size={20} 
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" 
                        />
                        <input
                          {...step1Form.register('email', emailValidation)}
                          type="email"
                          className={`
                            w-full pl-11 pr-4 py-3 border rounded-lg transition-colors duration-200
                            bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                            placeholder-gray-500 dark:placeholder-gray-400
                            focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                            ${step1Form.formState.errors.email 
                              ? 'border-red-500 dark:border-red-400' 
                              : 'border-gray-300 dark:border-gray-600'
                            }
                          `}
                          placeholder="Enter your email address"
                          disabled={isLoading}
                        />
                      </div>
                      {step1Form.formState.errors.email && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                          <AlertCircle size={14} />
                          {step1Form.formState.errors.email.message}
                        </p>
                      )}
                    </div>

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white py-3 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center gap-2"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 size={20} className="animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        <>
                          <Shield size={20} />
                          Send OTP
                        </>
                      )}
                    </Button>
                  </form>
                </motion.div>
              )}

              {currentStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  {/* Back Button */}
                  <button
                    onClick={handleBackToStep1}
                    className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mb-6 transition-colors"
                    disabled={isLoading}
                  >
                    <ArrowLeft size={16} />
                    Back
                  </button>

                  <form onSubmit={step2Form.handleSubmit(handleStep2Submit)} className="space-y-6">
                    {/* OTP Field */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Enter OTP
                      </label>
                      <div className="space-y-3">
                        <div className={`relative ${showInlineVerify ? 'flex gap-2' : ''}`}>
                          <input
                            autoComplete="otp"
                            {...step2Form.register('otp', {
                              required: 'OTP is required',
                              minLength: { value: 6, message: 'OTP must be 6 characters' },
                              maxLength: { value: 6, message: 'OTP must be 6 characters' }
                            })}
                            id="otp-input"
                            type="text"
                            maxLength={6}
                            className={`
                              ${showInlineVerify ? 'flex-1' : 'w-full'} px-4 py-3 border rounded-lg transition-colors duration-200
                              bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                              placeholder-gray-500 dark:placeholder-gray-400
                              focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                              text-center font-mono text-lg tracking-widest
                              ${step2Form.formState.errors.otp 
                                ? 'border-red-500 dark:border-red-400' 
                                : otpVerified
                                ? 'border-green-500 dark:border-green-400'
                                : 'border-gray-300 dark:border-gray-600'
                              }
                            `}
                            placeholder="000000"
                            disabled={isLoading || otpVerified}
                          />
                          
                          {/* Inline Verify Button (for wider screens) */}
                          {showInlineVerify && (
                            <Button
                              type="button"
                              onClick={handleOTPVerify}
                              disabled={isLoading || otpVerified || !otp || otp.length !== 6}
                              className={`
                                px-4 py-3 rounded-lg font-medium transition-all duration-200
                                ${otpVerified 
                                  ? 'bg-green-500 hover:bg-green-600 text-white' 
                                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                                }
                              `}
                            >
                              {isLoading ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : otpVerified ? (
                                <CheckCircle size={16} />
                              ) : (
                                'Verify'
                              )}
                            </Button>
                          )}
                        </div>
                        
                        {/* Below Verify Button (for narrower screens) */}
                        {!showInlineVerify && (
                          <Button
                            type="button"
                            onClick={handleOTPVerify}
                            disabled={isLoading || otpVerified || !otp || otp.length !== 6}
                            className={`
                              w-full py-3 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2
                              ${otpVerified 
                                ? 'bg-green-500 hover:bg-green-600 text-white' 
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                              }
                            `}
                          >
                            {isLoading ? (
                              <>
                                <Loader2 size={16} className="animate-spin" />
                                Verifying...
                              </>
                            ) : otpVerified ? (
                              <>
                                <CheckCircle size={16} />
                                OTP Verified
                              </>
                            ) : (
                              'Verify OTP'
                            )}
                          </Button>
                        )}
                      </div>
                      
                      {step2Form.formState.errors.otp && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                          <AlertCircle size={14} />
                          {step2Form.formState.errors.otp.message}
                        </p>
                      )}
                      
                      {otpVerified && (
                        <p className="mt-1 text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                          <CheckCircle size={14} />
                          OTP verified successfully
                        </p>
                      )}
                    </div>

                    {/* New Password Field */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        New Password
                      </label>
                      <div className="relative">
                        <Lock 
                          size={20} 
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" 
                        />
                        <input
                          {...step2Form.register('newPassword', passwordValidation)}
                          type={showNewPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          className={`
                            w-full pl-11 pr-12 py-3 border rounded-lg transition-colors duration-200
                            bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                            placeholder-gray-500 dark:placeholder-gray-400
                            focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                            ${step2Form.formState.errors.newPassword 
                              ? 'border-red-500 dark:border-red-400' 
                              : 'border-gray-300 dark:border-gray-600'
                            }
                          `}
                          placeholder="Enter new password"
                          disabled={isLoading}
                          onFocus={() => setNewPasswordFocused(true)}
                          onBlur={() => setNewPasswordFocused(false)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                      </div>
                      
                      {/* Password Requirements */}
                      {(newPasswordFocused || newPassword) && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                        >
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Password requirements:
                          </p>
                          <div className="grid grid-cols-1 gap-1">
                            {[
                              { key: 'length', label: 'At least 8 characters' },
                              { key: 'uppercase', label: 'One uppercase letter' },
                              { key: 'lowercase', label: 'One lowercase letter' },
                              { key: 'number', label: 'One number' },
                              { key: 'special', label: 'One special character' },
                            ].map(({ key, label }) => (
                              <div key={key} className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${
                                  passwordValidations[key as keyof typeof passwordValidations]
                                    ? 'bg-green-500' 
                                    : 'bg-gray-300 dark:bg-gray-600'
                                }`} />
                                <span className={`text-xs ${
                                  passwordValidations[key as keyof typeof passwordValidations]
                                    ? 'text-green-600 dark:text-green-400' 
                                    : 'text-gray-500 dark:text-gray-400'
                                }`}>
                                  {label}
                                </span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                      
                      {step2Form.formState.errors.newPassword && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                          <AlertCircle size={14} />
                          {step2Form.formState.errors.newPassword.message}
                        </p>
                      )}
                    </div>

                    {/* Confirm Password Field */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Confirm New Password
                      </label>
                      <div className="relative">
                        <Lock 
                          size={20} 
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" 
                        />
                        <input
                          autoComplete="new-password"
                          {...step2Form.register('confirmPassword', {
                            required: 'Please confirm your password',
                            validate: (value) => 
                              value === newPassword || 'Passwords do not match'
                          })}
                          type={showConfirmPassword ? 'text' : 'password'}
                          className={`
                            w-full pl-11 pr-12 py-3 border rounded-lg transition-colors duration-200
                            bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                            placeholder-gray-500 dark:placeholder-gray-400
                            focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                            ${step2Form.formState.errors.confirmPassword 
                              ? 'border-red-500 dark:border-red-400' 
                              : confirmPassword && confirmPassword === newPassword
                              ? 'border-green-500 dark:border-green-400'
                              : 'border-gray-300 dark:border-gray-600'
                            }
                          `}
                          placeholder="Confirm new password"
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                      </div>
                      
                      {step2Form.formState.errors.confirmPassword && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                          <AlertCircle size={14} />
                          {step2Form.formState.errors.confirmPassword.message}
                        </p>
                      )}
                      
                      {confirmPassword && confirmPassword === newPassword && newPassword && (
                        <p className="mt-1 text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                          <CheckCircle size={14} />
                          Passwords match
                        </p>
                      )}
                    </div>

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white py-3 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center gap-2"
                      disabled={isLoading || !otpVerified}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 size={20} className="animate-spin" />
                          Updating Password...
                        </>
                      ) : (
                        <>
                          <Lock size={20} />
                          Update Password
                        </>
                      )}
                    </Button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="px-8 py-6 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Remember your password?{' '}
              <Link 
                to="/login" 
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ForgotPasswordPage;
