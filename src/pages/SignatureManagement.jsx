import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useCollection } from '../hooks/useData';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogBody, DialogFooter, DialogClose,
} from '../components/ui/dialog';
import { Select } from '../components/ui/select';
import {
  PenLine, Plus, Trash2, Edit2, GripVertical,
  CheckCircle, XCircle, UserCheck, ChevronDown,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const SIGNATURE_TYPES = [
  { value: 'prepared_by', label: 'Prepared By' },
  { value: 'checked_by',  label: 'Checked By'  },
  { value: 'approved_by', label: 'Approved By' },
];

const TYPE_ORDER = { prepared_by: 0, checked_by: 1, approved_by: 2 };

const TYPE_COLORS = {
  prepared_by: { bg: '#f0fdf4', border: '#86efac', text: '#166534', badge: '#16a34a' },
  checked_by:  { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', badge: '#2563eb' },
  approved_by: { bg: '#fdf4ff', border: '#d8b4fe', text: '#6b21a8', badge: '#7c3aed' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeLabel(type) {
  return SIGNATURE_TYPES.find(t => t.value === type)?.label ?? type;
}

const emptyForm = {
  fullName: '',
  position: '',
  department: '',
  signatureType: 'prepared_by',
  isEnabled: true,
};

// ─── SignatureCard ────────────────────────────────────────────────────────────

function SignatureCard({ sig, onEdit, onDelete, onToggle, onDragStart, onDragOver, onDrop, onDragEnd }) {
  const colors = TYPE_COLORS[sig.signatureType] ?? TYPE_COLORS.prepared_by;

  return (
    <div
      draggable
      onDragStart={e => {
        e.currentTarget.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', sig.id);
        onDragStart(sig.id, sig.signatureType);
      }}
      onDragOver={e => {
        e.preventDefault();
        e.currentTarget.style.boxShadow = '0 0 0 2px var(--primary)';
        onDragOver();
      }}
      onDragLeave={e => { e.currentTarget.style.boxShadow = ''; }}
      onDrop={e => {
        e.preventDefault();
        e.currentTarget.style.boxShadow = '';
        onDrop(sig.id, sig.signatureType);
      }}
      onDragEnd={e => {
        e.currentTarget.style.opacity = '1';
        onDragEnd();
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '1rem 1.25rem',
        borderRadius: 'var(--radius)',
        border: `1px solid ${colors.border}`,
        backgroundColor: sig.isEnabled ? colors.bg : '#fafafa',
        opacity: sig.isEnabled ? 1 : 0.6,
        cursor: 'grab',
        transition: 'all 0.15s',
      }}
    >
      {/* Drag handle */}
      <GripVertical size={16} style={{ color: '#a1a1aa', flexShrink: 0 }} />

      {/* Avatar placeholder */}
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        backgroundColor: colors.badge,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <UserCheck size={20} color="white" />
      </div>

      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--primary)', letterSpacing: '-0.01em' }}>
          {sig.fullName || '—'}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#52525b', marginTop: '0.1rem' }}>
          {sig.position}{sig.department ? ` · ${sig.department}` : ''}
        </div>
      </div>

      {/* Type badge */}
      <span style={{
        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.06em', padding: '0.2rem 0.6rem',
        borderRadius: '1rem', backgroundColor: colors.badge, color: 'white',
        flexShrink: 0,
      }}>
        {typeLabel(sig.signatureType)}
      </span>

      {/* Toggle */}
      <button
        onClick={() => onToggle(sig)}
        title={sig.isEnabled ? 'Disable' : 'Enable'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: sig.isEnabled ? '#16a34a' : '#a1a1aa', display: 'flex' }}
      >
        {sig.isEnabled ? <CheckCircle size={18} /> : <XCircle size={18} />}
      </button>

      {/* Edit */}
      <button
        onClick={() => onEdit(sig)}
        title="Edit"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: '#a1a1aa', display: 'flex' }}
        onMouseOver={e => e.currentTarget.style.color = 'var(--primary)'}
        onMouseOut={e => e.currentTarget.style.color = '#a1a1aa'}
      >
        <Edit2 size={16} />
      </button>

      {/* Delete */}
      <button
        onClick={() => onDelete(sig)}
        title="Delete"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: '#a1a1aa', display: 'flex' }}
        onMouseOver={e => e.currentTarget.style.color = 'var(--destructive)'}
        onMouseOut={e => e.currentTarget.style.color = '#a1a1aa'}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

// ─── SignatureForm ────────────────────────────────────────────────────────────

function SignatureForm({ form, setForm }) {
  const labelStyle = { fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' };
  const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '0.4rem' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={fieldStyle}>
        <label style={labelStyle}>Full Name *</label>
        <Input
          placeholder="e.g. Engr. Juan Dela Cruz"
          value={form.fullName}
          onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
          autoFocus
        />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Position / Title *</label>
        <Input
          placeholder="e.g. Project Engineer"
          value={form.position}
          onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
        />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Department / Office</label>
        <Input
          placeholder="e.g. General Services Office"
          value={form.department}
          onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
        />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Signature Type *</label>
        <Select
          value={form.signatureType}
          onChange={e => setForm(f => ({ ...f, signatureType: e.target.value }))}
        >
          {SIGNATURE_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input
          type="checkbox"
          id="sig-enabled"
          checked={form.isEnabled}
          onChange={e => setForm(f => ({ ...f, isEnabled: e.target.checked }))}
          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--primary)' }}
        />
        <label htmlFor="sig-enabled" style={{ ...labelStyle, cursor: 'pointer' }}>
          Enable this signature (appears in print/PDF)
        </label>
      </div>
    </div>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function SignatureManagement() {
  const { data: signatures, createItem, updateItem, deleteItem } = useCollection('signatures');

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingSig, setEditingSig] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [editForm, setEditForm] = useState({ ...emptyForm });

  // Drag state
  const draggingId = useRef(null);
  const draggingType = useRef(null);

  // Sort signatures: by type order then by signatureOrder
  const sortedSignatures = React.useMemo(() => {
    return [...signatures].sort((a, b) => {
      const ta = TYPE_ORDER[a.signatureType] ?? 99;
      const tb = TYPE_ORDER[b.signatureType] ?? 99;
      if (ta !== tb) return ta - tb;
      return (a.signatureOrder ?? 0) - (b.signatureOrder ?? 0);
    });
  }, [signatures]);

  // Group by type
  const grouped = React.useMemo(() => {
    return SIGNATURE_TYPES.reduce((acc, t) => {
      acc[t.value] = sortedSignatures.filter(s => s.signatureType === t.value);
      return acc;
    }, {});
  }, [sortedSignatures]);

  // ── Handlers ──

  const handleCreate = async () => {
    if (!form.fullName.trim() || !form.position.trim()) return;
    const typeGroup = sortedSignatures.filter(s => s.signatureType === form.signatureType);
    await createItem({
      id: crypto.randomUUID(),
      ...form,
      fullName: form.fullName.trim(),
      position: form.position.trim(),
      department: form.department.trim(),
      signatureOrder: typeGroup.length,
      createdAt: new Date().toISOString(),
    });
    setForm({ ...emptyForm });
    setCreateOpen(false);
  };

  const handleEdit = async () => {
    if (!editingSig || !editForm.fullName.trim() || !editForm.position.trim()) return;
    await updateItem({
      ...editingSig,
      ...editForm,
      fullName: editForm.fullName.trim(),
      position: editForm.position.trim(),
      department: editForm.department.trim(),
      updatedAt: new Date().toISOString(),
    });
    setEditOpen(false);
    setEditingSig(null);
  };

  const handleDelete = async (sig) => {
    if (!confirm(`Delete "${sig.fullName}"? This cannot be undone.`)) return;
    await deleteItem(sig.id);
  };

  const handleToggle = async (sig) => {
    await updateItem({ ...sig, isEnabled: !sig.isEnabled, updatedAt: new Date().toISOString() });
  };

  const handleDragStart = useCallback((id, type) => {
    draggingId.current = id;
    draggingType.current = type;
  }, []);

  const handleDragOver = useCallback(() => {}, []);

  const handleDrop = useCallback(async (targetId, targetType) => {
    const fromId = draggingId.current;
    const fromType = draggingType.current;
    draggingId.current = null;
    draggingType.current = null;

    if (!fromId || fromId === targetId) return;
    if (fromType !== targetType) return; // Can only reorder within same type

    const group = sortedSignatures.filter(s => s.signatureType === fromType);
    const fromIdx = group.findIndex(s => s.id === fromId);
    const toIdx = group.findIndex(s => s.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const spliced = [...group];
    const [moved] = spliced.splice(fromIdx, 1);
    spliced.splice(toIdx, 0, moved);

    for (let i = 0; i < spliced.length; i++) {
      await updateItem({ ...spliced[i], signatureOrder: i, updatedAt: new Date().toISOString() });
    }
  }, [sortedSignatures, updateItem]);

  const handleDragEnd = useCallback(() => {
    draggingId.current = null;
    draggingType.current = null;
  }, []);

  const totalEnabled = sortedSignatures.filter(s => s.isEnabled).length;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: 'calc(100vh - 10rem)' }}>

      {/* ── Header ── */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--foreground)', letterSpacing: '-0.02em', margin: 0 }}>
            Signature Management
          </h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.95rem', marginTop: '0.5rem' }}>
            Manage signatories displayed on Cost Estimates print-outs.
            {totalEnabled > 0 && (
              <span style={{ marginLeft: '0.5rem', color: 'var(--primary)', fontWeight: 600 }}>
                {totalEnabled} signature{totalEnabled !== 1 ? 's' : ''} active.
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => { setForm({ ...emptyForm }); setCreateOpen(true); }}>
          <Plus size={18} /> Add Signature
        </Button>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* ── Empty state ── */}
        {sortedSignatures.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '6rem',
          backgroundColor: '#fff', borderRadius: 'var(--radius)',
          border: '2px dashed var(--border)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--muted-foreground)',
        }}>
          <PenLine size={48} style={{ opacity: 0.1, marginBottom: '1.5rem' }} />
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--primary)' }}>No Signatures Configured</h3>
          <p style={{ maxWidth: '400px', margin: '0.5rem auto 1.5rem auto' }}>
            Add signatories that will appear on Cost Estimates print-outs. Group them as Prepared By, Checked By, or Approved By.
          </p>
          <Button variant="outline" onClick={() => { setForm({ ...emptyForm }); setCreateOpen(true); }}>
            Add your first signature
          </Button>
        </div>
      )}

      {/* ── Grouped Sections ── */}
      {SIGNATURE_TYPES.map(typeObj => {
        const group = grouped[typeObj.value] ?? [];
        if (group.length === 0) return null;
        const colors = TYPE_COLORS[typeObj.value];
        return (
          <section key={typeObj.value}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              marginBottom: '1rem', paddingBottom: '0.5rem',
              borderBottom: `2px solid ${colors.border}`,
            }}>
              <span style={{
                fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '0.08em', padding: '0.25rem 0.75rem',
                borderRadius: '1rem', backgroundColor: colors.badge, color: 'white',
              }}>
                {typeObj.label}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                {group.length} signator{group.length !== 1 ? 'ies' : 'y'} · drag to reorder
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {group.map(sig => (
                <SignatureCard
                  key={sig.id}
                  sig={sig}
                  onEdit={s => { setEditingSig(s); setEditForm({ fullName: s.fullName, position: s.position, department: s.department || '', signatureType: s.signatureType, isEnabled: s.isEnabled !== false }); setEditOpen(true); }}
                  onDelete={handleDelete}
                  onToggle={handleToggle}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          </section>
        );
      })}
      </div>

      {/* ── Create Dialog ── */}
      <Dialog open={createOpen} onOpenChange={v => { if (!v) setForm({ ...emptyForm }); setCreateOpen(v); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Signatory</DialogTitle></DialogHeader>
          <DialogBody>
            <SignatureForm form={form} setForm={setForm} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={!form.fullName.trim() || !form.position.trim()}>
              Add Signatory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={editOpen} onOpenChange={v => { if (!v) setEditingSig(null); setEditOpen(v); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Signatory</DialogTitle></DialogHeader>
          <DialogBody>
            <SignatureForm form={editForm} setForm={setEditForm} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={handleEdit} disabled={!editForm.fullName.trim() || !editForm.position.trim()}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
