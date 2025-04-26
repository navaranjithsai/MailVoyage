import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { User, UserPlus, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiFetch';
import { ThemeSwitcherCapsule as ThemeSwitcher } from '@/components/common/ThemeSwitcherCapsule';

interface RegisterForm {
  username: string;
  email: string;
  password: string;
}

const RegisterPage: React.FC = () => {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterForm>();
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const togglePasswordVisibility = () => setShowPassword((v) => !v);

  const onSubmit = async (data: RegisterForm) => {
    try {
      await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      toast.success('Registration successful! Please log in.');
      navigate('/login');
    } catch (error: any) {
      toast.error(error.message || 'Registration failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <ThemeSwitcher />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white p-8 rounded-lg shadow-md w-96"
      >
        <div className="flex justify-center mb-6">
          <div className="rounded-full bg-blue-600 p-3 text-white">
            <UserPlus size={32} />
          </div>
        </div>
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Create Account</h2>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700" htmlFor="username">Username</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <User size={18} />
              </div>
              <input
                type="text"
                id="username"
                autoComplete="username"
                {...register('username', { required: 'Username is required' })}
                className={`pl-10 mt-1 block w-full border h-[44px] ${errors.username ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:ring focus:ring-blue-500`}
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
            <label className="block text-sm font-medium text-gray-700" htmlFor="email">Email</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Mail size={18} />
              </div>
              <input
                type="email"
                id="email"
                autoComplete="email"
                {...register('email', { required: 'Email is required' })}
                className={`pl-10 mt-1 block w-full border h-[44px] ${errors.email ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:ring focus:ring-blue-500`}
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
            <label className="block text-sm font-medium text-gray-700" htmlFor="password">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Lock size={18} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                autoComplete="new-password"
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 8,
                    message: 'Password must be at least 8 characters',
                  },
                })}
                className={`pl-10 pr-10 mt-1 block w-full border h-[44px] ${errors.password ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:ring focus:ring-blue-500`}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-900 bg-transparent hover:bg-transparent"
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
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-md px-4 py-2 text-white h-[44px]"
          >
            {isSubmitting ? (
              <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <UserPlus size={18} />
                Register
              </>
            )}
          </Button>
        </form>
        <div className="mt-6 text-center text-sm">
          <span className="text-gray-600">Already have an account?</span>{' '}
          <Link to="/login" className="text-blue-600 hover:underline font-medium">
            Login Now
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default RegisterPage;
