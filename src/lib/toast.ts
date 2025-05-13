import { toast, ToastContainerProps, ToastOptions, Zoom } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Default toast options (optional)
const defaultToastOptions: ToastOptions = {
  position: "top-right",
  autoClose: 5000, // 5 seconds
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  progress: undefined,
  theme: "colored", // Use colored theme based on type (success, error, etc.)
  // Consider adding transition={Slide} or similar from react-toastify
  transition: Zoom,
};

// You can export pre-configured toast functions if needed
// e.g., export const toastSuccess = (message: string) => toast.success(message, defaultToastOptions);

// Export the configured toast object and default options
export { toast, defaultToastOptions };

// Export props type for the container if you configure it elsewhere
export type { ToastContainerProps };
