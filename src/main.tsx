import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css' // Ensure Tailwind/global styles are imported
import { registerServiceWorker } from './lib/serviceWorker'

// Register service worker for offline support
if (import.meta.env.PROD) {
  registerServiceWorker().then(registration => {
    if (registration) {
      console.log('[App] Service worker registered')
    }
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  // StrictMode is already included in App.tsx
  <App />
)
