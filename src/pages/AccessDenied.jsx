import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { ShieldAlert, LogOut } from 'lucide-react';

export default function AccessDenied() {
  const { signOut } = useAuth();

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: 'var(--background)' }}>
      <div style={{ maxWidth: '400px', width: '90%', padding: '2rem', backgroundColor: 'var(--card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
        <div style={{ padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%' }}>
          <ShieldAlert size={48} color="#ef4444" />
        </div>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--foreground)', marginBottom: '0.5rem' }}>Access Denied</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Your account does not have authorization to access this workspace. Please contact the system administrator to request access.
          </p>
        </div>
        <button 
          onClick={signOut}
          className="flex items-center justify-center gap-2 w-full"
          style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius)', backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)', fontWeight: 600, border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
        >
          <LogOut size={16} />
          Sign Out & Return
        </button>
      </div>
    </div>
  );
}
