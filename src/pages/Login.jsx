import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { Calculator } from 'lucide-react';
import styles from './login.module.css';

export default function Login() {
  const { signInWithGoogle, loading } = useAuth();

  if (loading) return null;

  return (
    <div className={styles.container}>
      <div className={styles.brandPanel}>
        <div className={styles.brandHeader}>
          <div className="animate-fade-in">
            <div className={styles.brandLogo}>
              <Calculator size={44} color="#4ade80" />
              PPCMS
            </div>
            <div className={styles.decorLine}></div>
          </div>
          <div className="animate-fade-in-delayed">
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem', color: 'white' }}>Precision in Planning & Costing.</h2>
            <p className={styles.brandSubtitle}>
              Project Program and Costing Management System.
              Built for offline-first reliability on any job site.
            </p>
          </div>
        </div>
        <div className="animate-fade-in-delayed">
          <p style={{ fontSize: '0.8rem', opacity: 0.4, fontWeight: 500 }}>© {new Date().getFullYear()} PPCMS INFRASTRUCTURE DEEP-TECH.</p>
        </div>
      </div>

      <div className={styles.loginPanel}>
        <div className={`${styles.loginCard} animate-slide-up`}>
          <div className={styles.cardHeader}>
            <h1 className={styles.cardTitle}>Admin Login</h1>
            <p className={styles.cardDescription}>Secure access to your enterprise workspace</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <button
              onClick={signInWithGoogle}
              className={styles.googleBtn}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 1.18 4.93l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google
            </button>

            <p className={styles.footerText}>
              Managed institutional portal. Restricted access.
              By signing in, you agree to our Terms and Security Policies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
