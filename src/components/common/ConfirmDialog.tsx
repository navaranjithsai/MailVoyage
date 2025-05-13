import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import Button from '../ui/Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'danger'
}) => {
  const variantStyles = {
    danger: {
      icon: <AlertTriangle className="h-6 w-6 text-red-600" />,
      button: 'bg-red-600 hover:bg-red-700 text-white' // Added text-white
    },
    warning: {
      icon: <AlertTriangle className="h-6 w-6 text-amber-600" />,
      button: 'bg-amber-600 hover:bg-amber-700 text-white' // Added text-white
    },
    info: {
      icon: <AlertTriangle className="h-6 w-6 text-blue-600" />,
      button: 'bg-blue-600 hover:bg-blue-700 text-white' // Added text-white
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" // Added padding
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md p-6" // Added dark mode bg
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium flex items-center gap-2 text-gray-900 dark:text-white"> {/* Added dark mode text */}
                {variantStyles[variant].icon}
                {title}
              </h3>
              <button
                onClick={onCancel}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-transparent p-1 rounded-full"
                type="button"
              >
                <X size={20} />
              </button>
            </div>

            <div className="py-4">
              <p className="text-gray-700 dark:text-gray-300">{message}</p> {}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700"> {}
              <Button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                {cancelLabel}
              </Button>
              <Button
                type="button"
                onClick={onConfirm}
                className={`px-4 py-2 text-sm font-medium rounded-md ${variantStyles[variant].button}`}
              >
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmDialog;

