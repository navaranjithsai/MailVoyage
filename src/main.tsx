import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css' // Ensure Tailwind/global styles are imported

ReactDOM.createRoot(document.getElementById('root')!).render(
  // StrictMode is already included in App.tsx
  <App />
)
