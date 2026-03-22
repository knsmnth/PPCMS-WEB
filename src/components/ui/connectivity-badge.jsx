import React, { useState, useEffect } from 'react';

export function ConnectivityBadge() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return (
      <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', backgroundColor: '#ecfdf5', color: '#059669', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem', transition: 'all 0.3s' }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#059669' }}></div>
        System Live
      </span>
    );
  }

  return (
    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', backgroundColor: '#fffbeb', color: '#d97706', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem', transition: 'all 0.3s' }}>
      <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#d97706' }}></div>
      Offline Mode
    </span>
  );
}
