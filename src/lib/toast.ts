import { toast, ToastContainerProps, ToastOptions } from 'react-toastify';
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
};

// You can export pre-configured toast functions if needed
// e.g., export const toastSuccess = (message: string) => toast.success(message, defaultToastOptions);

// Export the configured toast object and default options
export { toast, defaultToastOptions };

// Export props type for the container if you configure it elsewhere
export type { ToastContainerProps };

// You'll need to render the ToastContainer component in your App.tsx or main layout
// Example:
// import { ToastContainer } from 'react-toastify';
// import { defaultToastOptions } from './lib/toast';
//
// function App() {
//   return (
//     <div>
//       {/* Your app content */}
//       <ToastContainer {...defaultToastOptions} />
//     </div>
//   );
// }
