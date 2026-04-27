import React, { useRef, useState } from 'react';

type OtpInputMode = 'numeric' | 'alphanumeric';
type OtpInputState = 'default' | 'success' | 'error';

interface OtpSharedProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (nextValue: string) => void;
  onBlur?: () => void;
  onEnter?: () => void;
  length?: number;
  mode?: OtpInputMode;
  state?: OtpInputState;
  disabled?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

interface OtpPinCellsInputProps extends OtpSharedProps {
  containerClassName?: string;
  cellClassName?: string;
}

const sanitizeOtpValue = (rawValue: string, mode: OtpInputMode, maxLength: number): string => {
  const normalized =
    mode === 'numeric'
      ? rawValue.replace(/\D/g, '')
      : rawValue.replace(/[^A-Za-z0-9]/g, '');

  return normalized.slice(0, maxLength);
};

const getStateBorderClass = (state: OtpInputState): string => {
  if (state === 'error') return 'border-red-500 dark:border-red-400';
  if (state === 'success') return 'border-green-500 dark:border-green-400';
  return 'border-gray-300 dark:border-gray-600';
};

const getInputMode = (mode: OtpInputMode): React.HTMLAttributes<HTMLInputElement>['inputMode'] =>
  mode === 'numeric' ? 'numeric' : 'text';

export const OtpClassicInput: React.FC<OtpSharedProps> = ({
  id,
  name,
  value,
  onChange,
  onBlur,
  onEnter,
  length = 6,
  mode = 'alphanumeric',
  state = 'default',
  disabled = false,
  autoFocus = false,
  autoComplete = 'one-time-code',
  placeholder,
  className,
  ariaLabel,
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(sanitizeOtpValue(event.target.value, mode, length));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onEnter?.();
    }
  };

  return (
    <input
      id={id}
      name={name}
      type="text"
      maxLength={length}
      inputMode={getInputMode(mode)}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      disabled={disabled}
      value={value}
      onBlur={onBlur}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      aria-label={ariaLabel}
      className={[
        'w-full px-4 py-3 border rounded-lg transition-colors duration-200',
        'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100',
        'placeholder-gray-500 dark:placeholder-gray-400',
        'focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400',
        'text-center font-mono text-lg tracking-widest',
        getStateBorderClass(state),
        className ?? '',
      ]
        .join(' ')
        .trim()}
      placeholder={placeholder}
    />
  );
};

export const OtpPinCellsInput: React.FC<OtpPinCellsInputProps> = ({
  id,
  name,
  value,
  onChange,
  onBlur,
  onEnter,
  length = 6,
  mode = 'numeric',
  state = 'default',
  disabled = false,
  autoFocus = false,
  autoComplete = 'one-time-code',
  ariaLabel,
  containerClassName,
  cellClassName,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const normalizedValue = sanitizeOtpValue(value, mode, length);
  const activeIndex = Math.min(normalizedValue.length, length - 1);

  const focusInput = () => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(sanitizeOtpValue(event.target.value, mode, length));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onEnter?.();
    }
  };

  const resolveCellClass = (index: number): string => {
    if (state === 'error') {
      return 'border-red-500 dark:border-red-400';
    }

    if (state === 'success') {
      return 'border-green-500 dark:border-green-400';
    }

    if (isFocused && index === activeIndex) {
      return 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500/30 dark:ring-blue-400/40';
    }

    return 'border-gray-300 dark:border-gray-600';
  };

  return (
    <div className={containerClassName}>
      <div className="relative" onClick={focusInput}>
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          maxLength={length}
          inputMode={getInputMode(mode)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          disabled={disabled}
          value={normalizedValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setIsFocused(false);
            onBlur?.();
          }}
          onFocus={() => setIsFocused(true)}
          aria-label={ariaLabel}
          className="absolute inset-0 h-full w-full opacity-0 cursor-text"
        />

        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
        >
          {Array.from({ length }).map((_, index) => {
            const char = normalizedValue[index] ?? '';
            const showCursor = isFocused && index === activeIndex && !char;

            return (
              <div
                key={`otp-cell-${index}`}
                className={[
                  'h-12 rounded-lg border flex items-center justify-center',
                  'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100',
                  'font-mono text-lg select-none transition-colors duration-200',
                  resolveCellClass(index),
                  disabled ? 'opacity-60' : '',
                  cellClassName ?? '',
                ]
                  .join(' ')
                  .trim()}
              >
                {char ? (
                  <span className="tracking-[0.12em]">{char}</span>
                ) : showCursor ? (
                  <span className="h-5 w-px bg-blue-500 dark:bg-blue-300 animate-pulse" aria-hidden="true" />
                ) : (
                  <span className="h-5 w-px bg-transparent" aria-hidden="true" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
