import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  Building2, 
  Building, 
  Folder, 
  Calendar, 
  Calculator, 
  Package, 
  Wrench, 
  Users, 
  LogOut,
  LayoutDashboard,
  ShieldAlert,
  Network,
  HardDriveDownload
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../hooks/useAuth';
import styles from './sidebar.module.css';

const topLevelItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Campuses', path: '/campuses', icon: Building2 },
];

const dependentItems = [
  { name: 'Facilities', path: '/facilities', icon: Building },
  { name: 'Projects', path: '/projects', icon: Folder },
  { name: 'Schedules of Work', path: '/schedules', icon: Calendar },
  { name: 'Summary Workspace', path: '/summary', icon: Calculator },
];

const masterDataItems = [
  { name: 'Material Catalog', path: '/materials', icon: Package },
  { name: 'Equipment Manager', path: '/equipments', icon: Wrench },
  { name: 'Labor Manager', path: '/labor', icon: Users },
];

export function Sidebar({ className }) {
  const { signOut, user } = useAuth();
  const location = useLocation();

  return (
    <aside className={clsx(styles.sidebar, className)}>
      <div className={styles.header}>
        <div className={styles.logoIcon}>
          <Calculator size={20} />
        </div>
        <span>PPOMS</span>
      </div>
      
      <nav className={styles.nav}>
        <div className={styles.sectionTitle}>Operations</div>
        {topLevelItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => clsx(styles.link, isActive && styles.link_active)}
          >
            <item.icon className={styles.icon} />
            {item.name}
          </NavLink>
        ))}
        {dependentItems.map((item) => {
          const active = location.pathname.startsWith(item.path);
          return (
            <div
              key={item.path}
              className={clsx(styles.link, active ? styles.link_active : styles.link_disabled)}
              title={active ? '' : 'Please select a parent entity first to view this level.'}
            >
              <item.icon className={styles.icon} />
              {item.name}
            </div>
          );
        })}

        <div className={styles.sectionTitle}>Master Data</div>
        {masterDataItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => clsx(styles.link, isActive && styles.link_active)}
          >
            <item.icon className={styles.icon} />
            {item.name}
          </NavLink>
        ))}

        {user?.role === 'super_admin' && (
          <React.Fragment>
            <div className={styles.sectionTitle}>Administration</div>
            <NavLink
              to="/access"
              className={({ isActive }) => clsx(styles.link, isActive && styles.link_active)}
            >
              <ShieldAlert className={styles.icon} />
              Access Management
            </NavLink>
            <NavLink
              to="/api-integrations"
              className={({ isActive }) => clsx(styles.link, isActive && styles.link_active)}
            >
              <Network className={styles.icon} />
              API Integrations
            </NavLink>
            <NavLink
              to="/data-management"
              className={({ isActive }) => clsx(styles.link, isActive && styles.link_active)}
            >
              <HardDriveDownload className={styles.icon} />
              Data Management
            </NavLink>
          </React.Fragment>
        )}
      </nav>

      <div className={styles.footer}>
        <div style={{ padding: '0 0.5rem 0.75rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img 
            src={user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.displayName || user?.email || 'User')}`}
            alt="User" 
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.displayName || user?.email || 'User')}`;
            }}
            style={{ width: '2rem', height: '2rem', borderRadius: '50%', border: '1px solid var(--border)', objectFit: 'cover' }}
          />
          <div style={{ overflow: 'hidden' }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.displayName}</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</p>
          </div>
        </div>
        <button className={styles.logoutButton} onClick={signOut}>
          <LogOut className={styles.icon} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
