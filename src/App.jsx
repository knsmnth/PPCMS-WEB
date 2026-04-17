import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { initDB } from './lib/db';
import { Sidebar } from './components/layout/sidebar';
import { useAuth } from './hooks/useAuth';
import { useOfflineSync } from './hooks/useOfflineSync';
import { useCollisionResolver } from './hooks/useCollisionResolver';
import { ConnectivityBadge } from './components/ui/connectivity-badge';
import styles from './components/layout/layout.module.css';

// Pages
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Campuses from './pages/Campuses';
import Facilities from './pages/Facilities';
import Projects from './pages/Projects';
import Schedules from './pages/Schedules';
import SummaryWorkspace from './pages/SummaryWorkspace';
import { MaterialsDescriptionAndPrices, LaborManager } from './pages/MasterData';
import AccessDenied from './pages/AccessDenied';
import AccessManagement from './pages/AccessManagement';
import APIIntegrations from './pages/APIIntegrations';
import DataManagement from './pages/DataManagement';

function AuthenticatedApp() {
  const { user } = useAuth();
  useOfflineSync(); 
  useCollisionResolver();
  
  if (!user?.role || user.role === 'none') {
    return <AccessDenied />;
  }

  return (
    <div className={styles.appContainer}>
      <Sidebar />
      <main className={styles.mainContent}>
        <header className={styles.pageHeader}>
          <div className={styles.breadcrumb}>
            <span className={styles.breadcrumbItem}>Operations</span>
            <span className={styles.breadcrumbItem}>Overview</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <ConnectivityBadge />
          </div>
        </header>
        <div className={styles.pageContent}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/campuses" element={<Campuses />} />
            <Route path="/facilities" element={<Facilities />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/schedules" element={<Schedules />} />
            <Route path="/summary" element={<SummaryWorkspace />} />
            <Route path="/materials" element={<MaterialsDescriptionAndPrices />} />

            <Route path="/labor" element={<LaborManager />} />
            {user.role === 'super_admin' && (
              <>
                <Route path="/access" element={<AccessManagement />} />
                <Route path="/api-integrations" element={<APIIntegrations />} />
                <Route path="/data-management" element={<DataManagement />} />
              </>
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function App() {
  const { user, loading } = useAuth();

  useEffect(() => {
    initDB().catch(console.error);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: 'var(--background)' }}>
        <p style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', fontWeight: 600 }}>Initialising Application...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      {user ? <AuthenticatedApp /> : <Login />}
    </BrowserRouter>
  );
}

export default App;
