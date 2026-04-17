import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCollection } from '../hooks/useData';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Calendar, Plus, ArrowLeft, Edit2, Trash2, Search, GripVertical, Copy } from 'lucide-react';
import { cascadeDelete, cascadeDuplicateSchedule } from '../lib/cascade';
import { recomputeProjectCost } from '../lib/billing'; // ground-truth recompute
import { SelectCombo } from '../components/ui/select-combo';

// ─── Pure utility functions (no React deps) ──────────────────────────────────

/**
 * 0 → "A", 1 → "B", 25 → "Z", 26 → "AA" …
 */
function indexToLetter(index) {
  let result = '';
  let n = index;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

/**
 * Produces the next unused work-code for a project.
 *   Format: <projectCode>.<Letter>   e.g. "26.001.A", "26.001.B" …
 *
 * @param {string} projectCode  – e.g. "26.001"
 * @param {Array}  existing     – all schedulesOfWork for this project
 */
function nextWorkCode(projectCode, existing) {
  if (!projectCode) return '';
  const prefix = `${projectCode}.`;
  const used = existing
    .map(w => (w.workCode || '').startsWith(prefix) ? w.workCode.slice(prefix.length) : null)
    .filter(Boolean);

  let i = 0;
  while (used.includes(indexToLetter(i))) i++;
  return prefix + indexToLetter(i);
}

/** Re-index `order` on a reordered array. */
function reindex(list) {
  return list.map((item, idx) => ({ ...item, order: idx }));
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CreateWorkDialog({ open, onOpenChange, projectName, projectId, onSubmit }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const reset = () => { setName(''); setDescription(''); };

  const submit = () => {
    if (!name.trim() || !projectId) return;
    onSubmit({ name: name.trim(), description: description.trim() });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Work</DialogTitle>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={labelStyle}>Project</label>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)', padding: '0.5rem 0.75rem', background: 'var(--secondary)', borderRadius: 'var(--radius)' }}>
              {projectName || '—'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={labelStyle}>Work Name *</label>
            <Input
              placeholder="e.g. Ground Floor Roof Repair"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={labelStyle}>Work Specifications</label>
            <Input
              placeholder="Summary of work to be performed..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <Button onClick={submit} disabled={!name.trim() || !projectId}>
            Register Work
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditWorkDialog({ open, onOpenChange, work, onSubmit }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Sync inputs whenever the work being edited changes
  React.useEffect(() => {
    setName(work?.name ?? '');
    setDescription(work?.description ?? '');
  }, [work?.id]); // key off id so it only re-syncs when a different work is opened

  const submit = () => {
    if (!name.trim() || !work) return;
    onSubmit({ name: name.trim(), description: description.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Work</DialogTitle>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={labelStyle}>Work Name *</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={labelStyle}>Work Specifications</label>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <Button onClick={submit} disabled={!name.trim()}>Save Changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const labelStyle = { fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' };

// ─── WorkRow ──────────────────────────────────────────────────

function WorkRow({ work, idx, onDragStart, onDragOver, onDrop, onDragEnd, onNavigate, onToggleExclude, onDuplicate, onEdit, onDelete }) {
  // Track when the last drag ended so we can suppress the subsequent click
  const lastDragEnd = useRef(0);

  return (
    <TableRow
      draggable
      style={{ cursor: 'pointer' }}
      className="hover:bg-muted/50"
      onDragStart={e => {
        e.currentTarget.style.opacity = '0.35';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', work.id);
        onDragStart(idx, work.id);
      }}
      onDragOver={e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.style.boxShadow = 'inset 0 2px 0 0 var(--primary)';
        e.currentTarget.style.backgroundColor = 'var(--secondary)';
        onDragOver();
      }}
      onDragLeave={e => {
        e.currentTarget.style.boxShadow = '';
        e.currentTarget.style.backgroundColor = '';
      }}
      onDrop={e => {
        e.preventDefault();
        e.currentTarget.style.boxShadow = '';
        e.currentTarget.style.backgroundColor = '';
        onDrop(idx);
      }}
      onDragEnd={e => {
        e.currentTarget.style.opacity = '1';
        lastDragEnd.current = Date.now();
        onDragEnd();
      }}
      onClick={() => { if (Date.now() - lastDragEnd.current < 300) return; onNavigate(work.id); }}
    >
      {/* ── Drag grip + exclude checkbox ── */}
      <TableCell style={{ padding: '0.75rem 0.5rem', width: 60 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{ cursor: 'grab', color: '#a1a1aa', display: 'flex', alignItems: 'center', userSelect: 'none' }}
            title="Drag to reorder"
            onClick={e => e.stopPropagation()}
          >
            <GripVertical size={16} />
          </span>
          <input
            type="checkbox"
            checked={!!work.isExcluded}
            onChange={() => onToggleExclude(work)}
            onClick={e => e.stopPropagation()}
            title={work.isExcluded ? 'Excluded — click to include' : 'Included — click to exclude'}
            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--primary)' }}
          />
        </div>
      </TableCell>

      {/* ── Work name ── */}
      <TableCell>
        <div style={{
          fontWeight: 700,
          fontSize: '0.95rem',
          color: work.isExcluded ? 'var(--muted-foreground)' : 'var(--primary)',
          textDecoration: work.isExcluded ? 'line-through' : 'none',
        }}>
          {work.name}
        </div>
      </TableCell>

      {/* ── Specifications ── */}
      <TableCell>
        <div style={{ fontSize: '0.82rem', color: '#52525b', maxWidth: 320, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {work.description || 'No specifications provided.'}
        </div>
      </TableCell>

      {/* ── Work code ── */}
      <TableCell style={{ textAlign: 'center', width: 145 }}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--foreground)', letterSpacing: '0.02em', fontFamily: 'monospace' }}>
          {work.workCode || '—'}
        </span>
      </TableCell>

      {/* ── Cost ── */}
      <TableCell style={{ textAlign: 'right', width: 160, fontWeight: 700, color: work.isExcluded ? 'var(--muted-foreground)' : 'var(--foreground)' }}>
        ₱{(work.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </TableCell>

      {/* ── Action buttons (stop propagation so row-click doesn't fire) ── */}
      <TableCell style={{ textAlign: 'right', width: 95 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end', alignItems: 'center' }}>
          <ActionBtn onClick={() => onDuplicate(work)} title="Duplicate Work (copies summaries)"><Copy size={15} /></ActionBtn>
          <ActionBtn onClick={() => onEdit(work)} title="Edit Work"><Edit2 size={15} /></ActionBtn>
          <ActionBtn onClick={() => onDelete(work.id)} title="Delete Work" destructive><Trash2 size={15} /></ActionBtn>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ActionBtn({ onClick, title, children, destructive }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem',
        color: hovered && destructive ? 'var(--destructive)' : '#a1a1aa',
        transition: 'color 0.15s',
      }}
    >
      {children}
    </button>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function ProgramOfWorks() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId');
  const navigate = useNavigate();

  const query = useMemo(
    () => (projectId ? [{ field: 'projectId', operator: '==', value: projectId }] : []),
    [projectId],
  );

  const { data: works, createItem, updateItem, refresh } = useCollection('schedulesOfWork', query);
  const { data: projects } = useCollection('projects');

  // Derive project synchronously on each render — no stale closure issue
  const project = projects.find(p => p.id === projectId) ?? null;

  // ── UI state ──
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingWork, setEditingWork] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Drag refs — NO React state: state updates during drag cause re-renders
  // that reset the draggable DOM node, cancelling the native browser drag ──
  const draggingIdx = useRef(null);


  // ── Memoised sorted list ──
  const sortedWorks = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return works
      .filter(w => !q || w.name?.toLowerCase().includes(q) || w.description?.toLowerCase().includes(q))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [works, searchQuery]);

  const runningTotal = useMemo(
    // Running total reflects only non-excluded works (excluded ones removed from project total too)
    () => sortedWorks.filter(w => !w.isExcluded).reduce((s, w) => s + (w.totalCost || 0), 0),
    [sortedWorks],
  );

  // Ref keeps handleDrop's closure fresh without sortedWorks as a useCallback dep.
  // Declared after useMemo so [sortedWorks] dep array doesn't hit the dead zone.
  const sortedWorksRef = useRef([]);
  React.useEffect(() => { sortedWorksRef.current = sortedWorks; }, [sortedWorks]);

  // Same ref pattern for projectCode — needed inside handleDrop to regenerate work codes
  const projectCodeRef = useRef('');
  React.useEffect(() => { projectCodeRef.current = project?.projectCode ?? ''; }, [project]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleCreate = useCallback(async ({ name, description }) => {
    // Read project INSIDE the callback to always get the latest value
    const currentProject = projects.find(p => p.id === projectId);
    const allWorks = works.filter(w => w.projectId === projectId);
    const workCode = nextWorkCode(currentProject?.projectCode ?? '', allWorks);
    const maxOrder = allWorks.reduce((m, w) => Math.max(m, w.order ?? 0), -1);

    await createItem({
      id: crypto.randomUUID(),
      projectId,
      name,
      description,
      workCode,
      totalCost: 0,
      isExcluded: false,
      order: maxOrder + 1,
    });
    setCreateOpen(false);
  }, [projects, works, projectId, createItem]);

  const handleEdit = useCallback(async ({ name, description }) => {
    if (!editingWork) return;
    await updateItem({ ...editingWork, name, description });
    setEditOpen(false);
    setEditingWork(null);
  }, [editingWork, updateItem]);

  const handleDelete = useCallback(async (id) => {
    if (!confirm('Delete this work? All cost entries will be permanently removed.')) return;
    await cascadeDelete('schedule', id);
    refresh();
  }, [refresh]);

  const handleToggleExclude = useCallback(async (work) => {
    const isNowExcluded = !work.isExcluded;
    // Persist the exclusion flag — this is awaited so IDB has the updated
    // isExcluded value before the recompute reads from it
    await updateItem({ ...work, isExcluded: isNowExcluded });
    // Recompute project / facility / campus from ground truth (not delta)
    await recomputeProjectCost(work.projectId);
  }, [updateItem]);

  const handleDuplicate = useCallback(async (work) => {
    const currentProject = projects.find(p => p.id === work.projectId);
    const allWorks = works.filter(w => w.projectId === work.projectId);
    const workCode = nextWorkCode(currentProject?.projectCode ?? '', allWorks);
    const maxOrder = allWorks.reduce((m, w) => Math.max(m, w.order ?? 0), -1);

    await cascadeDuplicateSchedule({
      sourceScheduleId: work.id,
      newSchedulePayload: {
        ...work,
        id: crypto.randomUUID(),
        workCode,
        name: `${work.name} (Copy)`,
        totalCost: 0,
        isExcluded: false,
        order: maxOrder + 1,
        createdAt: new Date().toISOString(),
      },
    });
    // Notify all listeners so the new schedule and its summaries appear
    window.dispatchEvent(new CustomEvent('localDataUpdated', { detail: 'schedulesOfWork' }));
    window.dispatchEvent(new CustomEvent('localDataUpdated', { detail: 'scheduleSummaries' }));
    window.dispatchEvent(new CustomEvent('localDataUpdated', { detail: 'summaryItems' }));
    refresh();
  }, [projects, works, refresh]);

  const openEdit = useCallback((work) => {
    setEditingWork(work);
    setEditOpen(true);
  }, []);

  // ─── Drag & drop ──────────────────────────────────────────────────────────

  const handleDragStart = useCallback((idx, id) => {
    draggingIdx.current = idx;
    // No state update — visual feedback handled in WorkRow via e.currentTarget.style
  }, []);

  const handleDragOver = useCallback(() => {
    // No state update — visual feedback handled in WorkRow via e.currentTarget.style
  }, []);

  const handleDrop = useCallback(async (dropIdx) => {
    const fromIdx = draggingIdx.current;
    draggingIdx.current = null;
    if (fromIdx === null || fromIdx === dropIdx) return;

    const list = sortedWorksRef.current; // ref — never stale
    const reordered = [...list];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(dropIdx, 0, moved);

    // Build a map of original orders for O(1) lookup
    const originalOrder = Object.fromEntries(list.map(w => [w.id, w.order ?? 0]));
    const pCode = projectCodeRef.current;

    // Reindex positions AND regenerate work codes to match new positions
    const reindexed = reindex(reordered).map(item => ({
      ...item,
      // Letter suffix always reflects the item's new position: A=0, B=1, C=2…
      workCode: pCode ? `${pCode}.${indexToLetter(item.order)}` : item.workCode,
    }));

    // Only persist items whose order (and thus work code) actually changed
    await Promise.all(
      reindexed
        .filter(item => item.order !== originalOrder[item.id])
        .map(item => updateItem(item)),
    );
  }, [updateItem]);

  const handleDragEnd = useCallback(() => {
    draggingIdx.current = null;
    // DOM style reset is done inside WorkRow's onDragEnd handler
  }, []);

  // ─── Empty / guard state ──────────────────────────────────────────────────

  if (!projectId) {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem', color: 'var(--muted-foreground)' }}>
        <Calendar size={48} style={{ opacity: 0.2 }} />
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}>Context Required</h2>
        <p>Please select a specific Project to view its Program of Works.</p>
        <Button onClick={() => navigate('/projects')} variant="outline" style={{ marginTop: '1rem' }}>
          Return to Projects
        </Button>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* ── Header ── */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <button
            onClick={() => navigate(`/projects${project ? `?facilityId=${project.facilityId}` : ''}`)}
            style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '0.5rem', fontWeight: 600 }}
          >
            <ArrowLeft size={14} /> Back to Projects
          </button>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.03em' }}>
            {project?.name ?? 'Program of Works'}
          </h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.925rem', marginTop: '0.25rem' }}>
            {project?.description ?? 'Detailed planning and execution of project works.'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Running total */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Running Total
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.02em' }}>
              ₱{runningTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--background)', padding: '0 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', width: 260, height: '2.5rem' }}>
            <Search size={16} color="var(--muted-foreground)" />
            <input
              type="text"
              placeholder="Search works…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.9rem', color: 'var(--foreground)' }}
            />
          </div>

          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={18} /> New Work
          </Button>
        </div>
      </header>

      {/* ── Table ── */}
      <div style={{ borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <Table wrapperStyle={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
          <TableHeader style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--background)' }}>
            <TableRow>
              <TableHead style={{ width: 60 }} />
              <TableHead>WORK NAME</TableHead>
              <TableHead>WORK SPECIFICATIONS</TableHead>
              <TableHead style={{ width: 145, textAlign: 'center' }}>WORK CODE</TableHead>
              <TableHead style={{ textAlign: 'right', width: 160 }}>TOTAL WORK COST</TableHead>
              <TableHead style={{ width: 95 }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedWorks.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} style={{ textAlign: 'center', padding: '4.5rem', color: 'var(--muted-foreground)' }}>
                  <Calendar size={32} style={{ opacity: 0.15, marginBottom: '1.25rem' }} />
                  <p>{searchQuery ? 'No works match your search.' : 'No works found. Add a new work to begin.'}</p>
                </TableCell>
              </TableRow>
            )}

            {sortedWorks.map((work, idx) => (
              <WorkRow
                key={work.id}
                work={work}
                idx={idx}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onNavigate={(id) => navigate(`/summary?scheduleId=${id}`)}
                onToggleExclude={handleToggleExclude}
                onDuplicate={handleDuplicate}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ── Dialogs ── */}
      <CreateWorkDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectName={project?.name}
        projectId={projectId}
        onSubmit={handleCreate}
      />

      <EditWorkDialog
        open={editOpen}
        onOpenChange={v => { setEditOpen(v); if (!v) setEditingWork(null); }}
        work={editingWork}
        onSubmit={handleEdit}
      />
    </div>
  );
}
