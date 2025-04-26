import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'; // Added 'ghost'
  size?: 'small' | 'medium' | 'large' | 'icon'; // Added 'icon'
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'medium',
  children,
  className = '',
  ...props
}) => {
  const baseStyles =
    'rounded focus:outline-none focus:ring-2 focus:ring-opacity-50 transition duration-150 ease-in-out shadow-sm disabled:opacity-50 disabled:cursor-not-allowed';
  const variantStyles = {
    primary: 'bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-300',
    secondary: 'bg-gray-500 text-white hover:bg-gray-600 focus:ring-gray-300',
    outline: 'border border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white focus:ring-blue-300',
    ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-300 dark:text-gray-300 dark:hover:bg-gray-700',
  };
  const sizeStyles = {
    small: 'px-2 py-1 text-sm',
    medium: 'px-4 py-2',
    large: 'px-6 py-3 text-lg',
    icon: '', // icon size controlled via width/height utility classes
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;