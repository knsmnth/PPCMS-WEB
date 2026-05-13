import React, { useState, createContext, useContext, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, useSearchParams } from 'react-router-dom';
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
  LayoutGrid,
  Layers,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../hooks/useAuth';
import { useCollection } from '../../hooks/useData';
import styles from './sidebar.module.css';

export const SidebarContext = createContext({ isCollapsed: false });
export const useSidebar = () => useContext(SidebarContext);

const dashboardItem = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard }
];

const operationsItems = [
  { name: 'Projects', path: '/projects', icon: Folder, type: 'nav' },
  { name: 'Program of Works', path: '/schedules', icon: Calendar, type: 'dep' },
  { name: 'Work Details', path: '/summary', icon: Calculator, type: 'dep' },
];

const locationItems = [
  { name: 'Campuses', path: '/campuses', icon: Building2, type: 'nav' },
  { name: 'Facilities', path: '/facilities', icon: Building, type: 'nav' },
];

const masterDataItems = [
  { name: 'Materials Description & Prices', path: '/materials', icon: Package },
  { name: 'Labor Manager', path: '/labor', icon: Users },
  { name: 'Work Group Templates', path: '/work-group-templates', icon: LayoutGrid },
  { name: 'Schedule Templates', path: '/schedule-templates', icon: Layers },
];

function ProjectNavItem({ item, isCollapsed }) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const currentScheduleId = searchParams.get('scheduleId');
  const isWorkDetails = location.pathname.startsWith('/summary');

  const { data: allSchedules } = useCollection('schedulesOfWork');
  const currentSchedule = currentScheduleId ? allSchedules.find(s => s.id === currentScheduleId) : null;
  const currentProjectId = currentSchedule?.projectId;
  
  const sortedProjectSchedules = React.useMemo(() => {
    if (!currentProjectId) return [];
    const schedules = allSchedules.filter(s => s.projectId === currentProjectId);
    const roots = schedules.filter(s => !s.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const result = [];
    roots.forEach(root => {
      result.push({ ...root, level: 0 });
      const children = schedules.filter(s => s.parentId === root.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      children.forEach(child => {
        result.push({ ...child, level: 1 });
      });
    });
    return result;
  }, [allSchedules, currentProjectId]);

  const shouldShowPopup = isWorkDetails && currentProjectId && sortedProjectSchedules.length > 0;

  // Let the user click it to go back to the project's schedule list
  const targetPath = (isWorkDetails && currentProjectId) ? `${item.path}?projectId=${currentProjectId}` : item.path;
  
  // It is active if we are on its exact path, or if we are pretending it's active
  const isActive = location.pathname.startsWith(item.path);

  // If it's a dependent item, it should typically be disabled if we aren't in it. 
  // However, while in Work Details, we enable "Program of Works" to let user navigate back or hover.
  const isDisabled = item.type === 'dep' && !isActive && !shouldShowPopup;

  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef(null);
  const [popupStyle, setPopupStyle] = useState({});
  const timeoutRef = useRef(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsHovered(true);
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPopupStyle({
        position: 'fixed',
        left: rect.right + 8, // 8px margin
        top: rect.top,
        zIndex: 9999,
      });
    }
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 150);
  };

  if (isDisabled) {
    return (
      <div
        className={clsx(styles.link, styles.link_disabled)}
        title={isCollapsed ? item.name : 'Please select a parent entity first.'}
      >
        <item.icon className={styles.icon} />
        <span className={styles.linkText}>{item.name}</span>
      </div>
    );
  }

  return (
    <div 
      className={styles.popupContainer}
      ref={containerRef}
      onMouseEnter={shouldShowPopup ? handleMouseEnter : undefined}
      onMouseLeave={shouldShowPopup ? handleMouseLeave : undefined}
    >
      <NavLink
        to={targetPath}
        className={clsx(styles.link, isActive && styles.link_active)}
        title={isCollapsed ? item.name : ''}
      >
        <item.icon className={styles.icon} />
        <span className={styles.linkText}>{item.name}</span>
      </NavLink>
      {shouldShowPopup && isHovered && createPortal(
        <div 
          className={styles.popupPortaled} 
          style={popupStyle}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className={styles.popupTitle}>Project Schedules</div>
          <div className={styles.popupList}>
            {sortedProjectSchedules.map(schedule => (
              <NavLink
                key={schedule.id}
                to={`/summary?scheduleId=${schedule.id}`}
                className={clsx(styles.popupItem, schedule.id === currentScheduleId && styles.popupItemActive)}
                style={{ paddingLeft: schedule.level > 0 ? '1.75rem' : '0.5rem', display: 'flex', alignItems: 'center' }}
              >
                {schedule.workCode && (
                  <span style={{ fontSize: '0.70rem', fontWeight: 700, marginRight: '0.5rem', opacity: 0.6 }}>
                    {schedule.workCode}
                  </span>
                )}
                <span style={{ fontWeight: schedule.level === 0 ? 600 : 500 }}>{schedule.name}</span>
              </NavLink>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

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
            {dashboardItem.map((item) => (
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

            <div className={styles.sectionTitle}><span>Operations</span></div>

            {operationsItems.map((item) => {
              if (item.name === 'Program of Works') {
                return <ProjectNavItem key={item.path} item={item} isCollapsed={isCollapsed} />;
              }

              if (item.type === 'nav') {
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => clsx(styles.link, isActive && styles.link_active)}
                    title={isCollapsed ? item.name : ''}
                  >
                    <item.icon className={styles.icon} />
                    <span className={styles.linkText}>{item.name}</span>
                  </NavLink>
                );
              } else {
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
              }
            })}

            <div className={styles.sectionTitle}><span>Infrastructure</span></div>

            {locationItems.map((item) => {
              if (item.type === 'nav') {
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => clsx(styles.link, isActive && styles.link_active)}
                    title={isCollapsed ? item.name : ''}
                  >
                    <item.icon className={styles.icon} />
                    <span className={styles.linkText}>{item.name}</span>
                  </NavLink>
                );
              } else {
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
              }
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
                {/* <NavLink
                  to="/data-management"
                  className={({ isActive }) => clsx(styles.link, isActive && styles.link_active)}
                  title={isCollapsed ? 'Data Management' : ''}
                >
                  <HardDriveDownload className={styles.icon} />
                  <span className={styles.linkText}>Data Management</span>
                </NavLink> */}
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
          Uses sticky positioning to stay fixed while scrolling.
          Wrapped in a container that spans the sidebar height.
        */}
        <div className={styles.toggleWrapper}>
          <button
            className={styles.toggleBtn}
            onClick={toggle}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight size={13} strokeWidth={2.5} /> : <ChevronLeft size={13} strokeWidth={2.5} />}
          </button>
        </div>

      </div>
    </SidebarContext.Provider>
  );
}
