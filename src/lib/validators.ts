// Email regex (simple, but covers most cases)
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Email validator for react-hook-form
export const emailValidation = {
  required: 'Email is required',
  pattern: {
    value: emailPattern,
    message: 'Enter a valid email address',
  },
};

// Username validator for react-hook-form
export const usernameValidation = {
  required: 'Username is required',
  minLength: { value: 6, message: 'Username must be at least 6 characters' },
};

// Password rules for UI display and validation
export const passwordRules = [
  {
    label: 'At least 8 characters',
    test: (v: string) => v.length >= 8,
    key: 'minLength',
  },
  {
    label: 'At least 1 uppercase letter',
    test: (v: string) => /[A-Z]/.test(v),
    key: 'upper',
  },
  {
    label: 'At least 1 lowercase letter',
    test: (v: string) => /[a-z]/.test(v),
    key: 'lower',
  },
  {
    label: 'At least 1 special character',
    test: (v: string) => /[^A-Za-z0-9]/.test(v),
    key: 'special',
  },
];

// Password validator for react-hook-form
export const passwordValidation = {
  required: 'Password is required',
  validate: {
    minLength: (v: string) => v.length >= 8 || 'At least 8 characters',
    upper: (v: string) => /[A-Z]/.test(v) || 'At least 1 uppercase letter',
    lower: (v: string) => /[a-z]/.test(v) || 'At least 1 lowercase letter',
    special: (v: string) => /[^A-Za-z0-9]/.test(v) || 'At least 1 special character',
  },
};