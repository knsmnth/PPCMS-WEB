import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Auto-migration / clear cache on version upgrade to fix stale sync queues
const CURRENT_VERSION = 'v1.1.0';
try {
  const lastVersion = localStorage.getItem('app_version');
  if (lastVersion && lastVersion !== CURRENT_VERSION) {
    import('./lib/db').then(({ clearAllStores }) => {
      clearAllStores().catch(console.error).finally(() => {
        localStorage.setItem('app_version', CURRENT_VERSION);
        window.location.reload();
      });
    });
  } else if (!lastVersion) {
    localStorage.setItem('app_version', CURRENT_VERSION);
  }
} catch (e) {
  console.error('Migration failed:', e);
}

// Auto-reload page when a new Service Worker takes control (PWA code updates deployed)
if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
