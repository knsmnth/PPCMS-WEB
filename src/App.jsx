import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { initDB } from './lib/db';
import { Sidebar } from './components/layout/sidebar';
import { useAuth } from './hooks/useAuth';
import { useOfflineSync } from './hooks/useOfflineSync';
import styles from './components/layout/layout.module.css';

// Pages
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Campuses from './pages/Campuses';
import Facilities from './pages/Facilities';
import Projects from './pages/Projects';
import Schedules from './pages/Schedules';
import SummaryWorkspace from './pages/SummaryWorkspace';
import { MaterialCatalog, EquipmentManager, LaborManager } from './pages/MasterData';

function AuthenticatedApp() {
  useOfflineSync(); 
  
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
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', backgroundColor: '#ecfdf5', color: '#059669', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#059669' }}></div>
              System Live
            </span>
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
            <Route path="/materials" element={<MaterialCatalog />} />
            <Route path="/equipments" element={<EquipmentManager />} />
            <Route path="/labor" element={<LaborManager />} />
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
