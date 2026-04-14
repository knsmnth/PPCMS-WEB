import React, { useState, createContext, useContext } from 'react';
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
  HardDriveDownload,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../hooks/useAuth';
import styles from './sidebar.module.css';

export const SidebarContext = createContext({ isCollapsed: false });
export const useSidebar = () => useContext(SidebarContext);

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
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggle = () => setIsCollapsed((v) => !v);

  return (
    <SidebarContext.Provider value={{ isCollapsed }}>
      {/*
        Wrapper is position:relative so the circle toggle can be placed
        at right:-12px without being clipped by the aside's overflow:hidden
      */}
      <div className={clsx(styles.sidebarWrapper, isCollapsed && styles.wrapperCollapsed)}>

        <aside className={clsx(styles.sidebar, isCollapsed && styles.collapsed, className)}>

          {/* ── Header / Brand ── */}
          <div className={styles.header}>
            <div className={styles.logoIcon}>
              <Calculator size={18} />
            </div>
            <span className={styles.brandText}>PPCMS</span>
          </div>

          {/* ── Navigation ── */}
          <nav className={styles.nav}>
            <div className={styles.sectionTitle}><span>Operations</span></div>

            {topLevelItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => clsx(styles.link, isActive && styles.link_active)}
                title={isCollapsed ? item.name : ''}
              >
                <item.icon className={styles.icon} />
                <span className={styles.linkText}>{item.name}</span>
              </NavLink>
            ))}

            {dependentItems.map((item) => {
              const active = location.pathname.startsWith(item.path);
              return (
                <div
                  key={item.path}
                  className={clsx(styles.link, active ? styles.link_active : styles.link_disabled)}
                  title={isCollapsed ? item.name : (!active ? 'Please select a parent entity first.' : '')}
                >
                  <item.icon className={styles.icon} />
                  <span className={styles.linkText}>{item.name}</span>
                </div>
              );
            })}

            <div className={styles.sectionTitle}><span>Master Data</span></div>

            {masterDataItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => clsx(styles.link, isActive && styles.link_active)}
                title={isCollapsed ? item.name : ''}
              >
                <item.icon className={styles.icon} />
                <span className={styles.linkText}>{item.name}</span>
              </NavLink>
            ))}

            {user?.role === 'super_admin' && (
              <>
                <div className={styles.sectionTitle}><span>Administration</span></div>
                <NavLink
                  to="/access"
                  className={({ isActive }) => clsx(styles.link, isActive && styles.link_active)}
                  title={isCollapsed ? 'Access Management' : ''}
                >
                  <ShieldAlert className={styles.icon} />
                  <span className={styles.linkText}>Access Management</span>
                </NavLink>
                <NavLink
                  to="/api-integrations"
                  className={({ isActive }) => clsx(styles.link, isActive && styles.link_active)}
                  title={isCollapsed ? 'API Integrations' : ''}
                >
                  <Network className={styles.icon} />
                  <span className={styles.linkText}>API Integrations</span>
                </NavLink>
                <NavLink
                  to="/data-management"
                  className={({ isActive }) => clsx(styles.link, isActive && styles.link_active)}
                  title={isCollapsed ? 'Data Management' : ''}
                >
                  <HardDriveDownload className={styles.icon} />
                  <span className={styles.linkText}>Data Management</span>
                </NavLink>
              </>
            )}
          </nav>

          {/* ── Footer / User ── */}
          <div className={styles.footer}>
            <div className={styles.userRow}>
              <img
                src={user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.displayName || user?.email || 'User')}&background=0a1c10&color=fff`}
                alt="User"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.displayName || user?.email || 'User')}&background=0a1c10&color=fff`;
                }}
                className={styles.avatar}
                title={isCollapsed ? (user?.displayName || user?.email) : ''}
              />
              <div className={styles.userInfo}>
                <p className={styles.userName}>{user?.displayName}</p>
                <p className={styles.userEmail}>{user?.email}</p>
              </div>
            </div>
            <button className={styles.logoutButton} onClick={signOut} title={isCollapsed ? 'Sign Out' : ''}>
              <LogOut className={styles.icon} />
              <span className={styles.linkText}>Sign Out</span>
            </button>
          </div>
        </aside>

        {/*
          ── Floating circle toggle ──
          Lives OUTSIDE the aside so overflow:hidden won't clip it.
          Positioned at the sidebar's right edge, vertically centered in the header.
        */}
        <button
          className={styles.toggleBtn}
          onClick={toggle}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight size={13} strokeWidth={2.5} /> : <ChevronLeft size={13} strokeWidth={2.5} />}
        </button>

      </div>
    </SidebarContext.Provider>
  );
}
