import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion, AnimatePresence } from 'framer-motion';
import { User, UserPlus, Mail, Lock, Eye, EyeOff, AlertCircle, Check, X as XIcon } from 'lucide-react';
import Button from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiFetch';
import { ThemeSwitcherCapsule as ThemeSwitcher } from '@/components/common/ThemeSwitcherCapsule';
import {
  emailValidation,
  usernameValidation,
  passwordValidation,
  passwordRules,
} from '@/lib/validators';

interface RegisterForm {
  username: string;
  email: string;
  password: string;
}

const RegisterPage: React.FC = () => {
  const { register, handleSubmit, formState: { errors, isSubmitting }, watch, setFocus, setError } = useForm<RegisterForm>();
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const navigate = useNavigate();

  const passwordValue = watch('password', '');

  const togglePasswordVisibility = () => setShowPassword((v) => !v);

  const onSubmit = async (data: RegisterForm) => {
    try {
      await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      toast.success('Registration successful! Please log in.');
      navigate('/login');
    } catch (error: unknown) {
      const err = error as any;
      if (err.errors && typeof err.errors === 'object') {
        Object.entries(err.errors as Record<string, string>).forEach(([field, msg]) => {
          const message = String(msg);
          setError(field as keyof RegisterForm, { type: 'server', message });
          toast.error(message);
        });
      } else {
        const message = typeof err.message === 'string' ? err.message : 'Registration failed. Please try again.';
        toast.error(message);
      }
    }
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
            <UserPlus size={32} />
          </div>
        </div>
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800 dark:text-gray-200">
          Create Account
        </h2>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="username">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <User size={18} />
              </div>
              <input
                type="text"
                id="username"
                autoComplete="username"
                {...register('username', usernameValidation)}
                className={`pl-10 mt-1 block w-full border h-[44px] rounded-md shadow-sm focus:ring focus:ring-blue-500 
                  ${errors.username ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
              />
            </div>
            {errors.username && (
              <p className="text-red-500 text-xs mt-1 flex items-start gap-1">
                <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                <span>{errors.username.message}</span>
              </p>
            )}
          </div>
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
                className={`pl-10 mt-1 block w-full border h-[44px] rounded-md shadow-sm focus:ring focus:ring-blue-500 
                  ${errors.email ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
              />
            </div>
            {errors.email && (
              <p className="text-red-500 text-xs mt-1 flex items-start gap-1">
                <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                <span>{errors.email.message}</span>
              </p>
            )}
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Lock size={18} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                autoComplete="new-password"
                {...register('password', passwordValidation)}
                className={`pl-10 pr-10 mt-1 block w-full border h-[44px] rounded-md shadow-sm focus:ring focus:ring-blue-500 
                  ${errors.password ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-900 bg-transparent hover:bg-transparent"
                onClick={togglePasswordVisibility}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              {/* Password Tooltip */}
              <AnimatePresence>
                {passwordFocused && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute left-0 top-[110%] w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 z-10"
                  >
                    <div className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Password must contain:</div>
                    <ul className="space-y-1">
                      {passwordRules.map(rule => {
                        const passed = rule.test(passwordValue);
                        return (
                          <li key={rule.label} className="flex items-center gap-2 text-sm">
                            {passed ? (
                              <Check size={16} className="text-green-600 dark:text-green-400" />
                            ) : (
                              <XIcon size={16} className="text-red-500 dark:text-red-400" />
                            )}
                            <span className={passed ? "text-gray-700 dark:text-gray-200" : "text-red-500 dark:text-red-400"}>
                              {rule.label}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {errors.password && (
              <p className="text-red-500 text-xs mt-1 flex items-start gap-1">
                <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                <span>
                  {typeof errors.password.message === 'string'
                    ? errors.password.message
                    : 'Password does not meet requirements'}
                </span>
              </p>
            )}
          </div>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="submit-button-gradient-border w-full flex items-center justify-center gap-2 rounded-md px-4 py-2 h-[44px]
              bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white
              dark:bg-white dark:text-black dark:hover:bg-gray-100 dark:border dark:border-gray-300 transition-colors"
          >
            {isSubmitting ? (
              <div className="h-5 w-5 border-2 border-white dark:border-black border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <UserPlus size={18} />
                Register
              </>
            )}
          </Button>
        </form>
        <div className="mt-6 text-center text-sm">
          <span className="text-gray-600 dark:text-gray-300">Already have an account?</span>{' '}
          <Link
            to="/login"
            className="text-blue-600 hover:text-blue-700 hover:underline transition-colors font-medium"
          >
            Login Now
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default RegisterPage;
