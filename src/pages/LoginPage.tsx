import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiFetch';
import { ThemeSwitcherCapsule as ThemeSwitcher } from '@/components/common/ThemeSwitcherCapsule';
import { emailValidation } from '@/lib/validators';

interface LoginForm {
  email: string;
  password: string;
}

const LoginPage: React.FC = () => {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>();
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const togglePasswordVisibility = () => setShowPassword((v) => !v);

  const onSubmit = async (data: LoginForm) => {
    try {
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      const { token, user } = response;
      login(user, token);
      toast.success('Login successful!');
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Login failed. Please check your credentials.');
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
            <Mail size={32} />
          </div>
        </div>
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800 dark:text-gray-200">
          Login to MailVoyage
        </h2>
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
            <div className="flex justify-between">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="password">
                Password
              </label>
              <Link
                to="/auth/forgot-password"
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
                autoComplete="current-password"
                {...register('password', { required: 'Password is required' })}
                className={`pl-10 pr-10 mt-1 block w-full border h-[44px] rounded-md shadow-sm focus:ring focus:ring-blue-500 
                  ${errors.password ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
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
                <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                <span>{errors.password.message}</span>
              </p>
            )}
          </div>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="submit-button-gradient-border w-full flex items-center justify-center gap-2 rounded-md px-4 py-2 h-[44px]
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
