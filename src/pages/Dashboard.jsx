import React from 'react';
import { useCollection } from '../hooks/useData';
import {
  Building2,
  Folder,
  Calendar,
  TrendingUp,
  Layers,
  ArrowUpRight,
  Calculator,
  Database
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { data: campuses } = useCollection('campuses');
  const { data: projects } = useCollection('projects');
  const { data: facilities } = useCollection('facilities');
  const { data: schedules } = useCollection('schedulesOfWork');
  const navigate = useNavigate();

  const totalCost = campuses.reduce((sum, c) => sum + (c.totalCost || 0), 0);

  const StatCard = ({ title, value, icon: Icon, color }) => (
    <div style={{ backgroundColor: 'var(--background)', padding: '1.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ padding: '0.5rem', backgroundColor: `${color}15`, color: color, borderRadius: '0.5rem' }}>
          <Icon size={20} />
        </div>
        <ArrowUpRight size={16} color="var(--muted-foreground)" />
      </div>
      <div>
        <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>{title}</p>
        <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.02em', marginTop: '0.25rem' }}>{value}</h3>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
      <header>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.04em' }}>Operations Intelligence</h1>
        <p style={{ color: 'var(--muted-foreground)', fontSize: '0.95rem', marginTop: '0.25rem' }}>Real-time oversight of institutional infrastructure and project valuations.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
        <StatCard title="Total Asset Valuation" value={`₱${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={TrendingUp} color="#10b981" />
        <StatCard title="Active Campuses" value={campuses.length} icon={Building2} color="#6366f1" />
        <StatCard title="Total Facilities" value={facilities.length} icon={Layers} color="#f59e0b" />
        <StatCard title="Projected Operations" value={projects.length} icon={Folder} color="#ef4444" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        <div style={{ backgroundColor: 'var(--primary)', color: 'white', padding: '2.5rem', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '300px', backgroundImage: 'radial-gradient(circle at top right, rgba(255,255,255,0.1) 0%, transparent 70%)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <Calculator size={32} color="#4ade80" />
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Quick Estimator</h2>
            </div>
            <p style={{ opacity: 0.8, maxWidth: '320px', fontSize: '0.95rem', lineHeight: 1.6 }}>Draft your itemized cost schedules with offline-first persistence. Synced immediately when online.</p>
          </div>
          <Button style={{ alignSelf: 'flex-start', backgroundColor: '#fff', color: 'var(--primary)', fontWeight: 700 }} onClick={() => navigate('/campuses')}>
            Open Workspace
          </Button>
        </div>

        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Database size={18} />
              Local Synchronisation
            </h3>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', backgroundColor: '#dcfce7', color: '#15803d', borderRadius: '0.5rem' }}>Synced</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <span style={{ color: 'var(--muted-foreground)' }}>IndexedDB Persistence</span>
              <span style={{ fontWeight: 600 }}>Operational</span>
            </div>
            <div style={{ height: '4px', backgroundColor: '#f4f4f5', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', backgroundColor: '#4ade80' }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              <span style={{ color: 'var(--muted-foreground)' }}>Firestore Realtime Sync</span>
              <span style={{ fontWeight: 600 }}>Connected</span>
            </div>
            <div style={{ height: '4px', backgroundColor: '#f4f4f5', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', backgroundColor: '#4ade80' }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
