import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCollection } from '../hooks/useData';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../components/ui/dialog';
import { Calendar, Plus, ArrowLeft, Edit2, Trash2, Search, GripVertical, Copy, ChevronDown, ChevronRight, CornerDownRight, Settings, Printer, CheckSquare, Square, FolderPlus, X, Eye, EyeOff, ArrowUpRight, Layers } from 'lucide-react';
import { cascadeDelete, cascadeDuplicateSchedule } from '../lib/cascade';
import { recomputeScheduleCost, recomputeSummaryCost, recomputeProjectCostsDeep } from '../lib/billing';
import { extractDisplayCode } from '../lib/printUtils';

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
 * Generates the correct work code for a schedule or sub-schedule.
 * For main schedules: <projectCode>.<Letter> (e.g., 26.001.A)
 * For sub-schedules:  <parentWorkCode>.<Number> (e.g., 26.001.A.1)
 */
function generateWorkCode(projectCode, parentWorkCode, siblings, currentOrder = null) {
  if (parentWorkCode) {
    if (currentOrder !== null) {
      return `${parentWorkCode}.${currentOrder + 1}`;
    }
    const maxOrder = siblings.reduce((m, w) => Math.max(m, w.order ?? 0), -1);
    return `${parentWorkCode}.${maxOrder + 2}`;
  } else {
    if (!projectCode) return '';
    const prefix = `${projectCode}.`;

    if (currentOrder !== null) {
      return `${prefix}${indexToLetter(currentOrder)}`;
    }

    const used = siblings
      .map(w => (w.workCode || '').startsWith(prefix) ? w.workCode.slice(prefix.length) : null)
      .filter(Boolean);

    let i = 0;
    while (used.includes(indexToLetter(i))) i++;
    return prefix + indexToLetter(i);
  }
}

/**
 * Pure function — computes the correct order & workCode for every schedule
 * in a project from a single source-of-truth snapshot.
 */
function computeWorkCodeUpdates(allWorks, projectCode) {
  if (!projectCode || !allWorks.length) return [];

  const resolvedCode = {};
  const updates = [];

  // 1. Root-level schedules
  const roots = allWorks
    .filter(w => !w.parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  roots.forEach((item, idx) => {
    const expected = `${projectCode}.${indexToLetter(idx)}`;
    resolvedCode[item.id] = expected;
    if (item.order !== idx || item.workCode !== expected) {
      updates.push({ ...item, order: idx, workCode: expected });
    }
  });

  // 2. Sub-schedules (children of root items)
  roots.forEach(parent => {
    const parentCode = resolvedCode[parent.id];
    const children = allWorks
      .filter(w => w.parentId === parent.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    children.forEach((item, idx) => {
      const expected = `${parentCode}.${idx + 1}`;
      resolvedCode[item.id] = expected;
      if (item.order !== idx || item.workCode !== expected) {
        updates.push({ ...item, order: idx, workCode: expected });
      }
    });
  });

  return updates;
}

const labelStyle = { fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' };

// ─── Dialog Components ───────────────────────────────────────────────────────

function GroupWorksDialog({ open, onOpenChange, count, onSubmit }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const reset = () => { setName(''); setDescription(''); };

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), description: description.trim() });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Group Selected Works into Main Project</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', margin: 0 }}>
              You are grouping <strong>{count}</strong> selected main project{count > 1 ? 's' : ''}. A new parent Main Project will be created, and the selected items will become its sub-projects.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={labelStyle}>Main Project Title *</label>
              <Input
                placeholder="e.g. General Construction & Finishes"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={labelStyle}>Specifications / Description</label>
              <Input
                placeholder="Summary description for this main project..."
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={submit} disabled={!name.trim()}>
            Create Main Project &amp; Group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
        <DialogBody>
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
        </DialogBody>
        <DialogFooter>
          <Button onClick={submit} disabled={!name.trim() || !projectId}>
            Register Work
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditWorkDialog({ open, onOpenChange, work, onSubmit }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  React.useEffect(() => {
    setName(work?.name ?? '');
    setDescription(work?.description ?? '');
  }, [work?.id]);

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
        <DialogBody>
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
        </DialogBody>
        <DialogFooter>
          <Button onClick={submit} disabled={!name.trim()}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── WorkRow & WorkGroup ──────────────────────────────────────────────────

function WorkGroup({
  mainWork,
  subWorks,
  selectMode,
  selectedWorkIds,
  onToggleSelect,
  draggingInfo,
  dragOverTarget,
  setDragOverTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onNavigate,
  onToggleExclude,
  onDuplicate,
  onEdit,
  onDelete,
  onCreateSub,
  onPromote
}) {
  const [expanded, setExpanded] = useState(true);
  const hasSubs = subWorks.length > 0;

  return (
    <>
      <WorkRow
        work={mainWork}
        isSub={false}
        selectMode={selectMode}
        isSelected={selectedWorkIds.has(mainWork.id)}
        onToggleSelect={onToggleSelect}
        draggingInfo={draggingInfo}
        dragOverTarget={dragOverTarget}
        setDragOverTarget={setDragOverTarget}
        expanded={expanded}
        onToggleExpand={() => setExpanded(v => !v)}
        hasSubs={hasSubs}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onNavigate={onNavigate}
        onToggleExclude={onToggleExclude}
        onDuplicate={onDuplicate}
        onEdit={onEdit}
        onDelete={onDelete}
        onCreateSub={() => { setExpanded(true); onCreateSub(mainWork.id); }}
        onPromote={onPromote}
      />

      {expanded && subWorks
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((subWork) => (
          <WorkRow
            key={subWork.id}
            work={subWork}
            isSub={true}
            selectMode={selectMode}
            isSelected={false}
            onToggleSelect={() => {}}
            draggingInfo={draggingInfo}
            dragOverTarget={dragOverTarget}
            setDragOverTarget={setDragOverTarget}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            onNavigate={onNavigate}
            onToggleExclude={onToggleExclude}
            onDuplicate={onDuplicate}
            onEdit={onEdit}
            onDelete={onDelete}
            onPromote={onPromote}
          />
        ))
      }
    </>
  );
}

function WorkRow({
  work,
  isSub,
  selectMode,
  isSelected,
  onToggleSelect,
  draggingInfo,
  dragOverTarget,
  setDragOverTarget,
  expanded,
  onToggleExpand,
  hasSubs,
  onCreateSub,
  onPromote,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onNavigate,
  onToggleExclude,
  onDuplicate,
  onEdit,
  onDelete
}) {
  const lastDragEnd = useRef(0);

  const isOverThis = dragOverTarget?.id === work.id;
  const dropPos = isOverThis ? dragOverTarget.position : null;
  const isAttachTarget = dropPos === 'inside';

  return (
    <TableRow
      draggable
      style={{
        cursor: 'pointer',
        backgroundColor: isAttachTarget
          ? 'rgba(34, 197, 94, 0.14)'
          : isSelected
          ? 'rgba(9, 46, 32, 0.08)'
          : isSub
          ? '#f8fafc'
          : 'white',
        borderLeft: isSub ? '4px solid #0284c7' : '4px solid transparent',
        borderTop: dropPos === 'before' ? '3px solid #2563eb' : undefined,
        borderBottom: dropPos === 'after' ? '3px solid #2563eb' : undefined,
        boxShadow: isAttachTarget
          ? 'inset 0 0 0 2px #16a34a'
          : '',
        opacity: work.isExcluded ? 0.6 : 1,
        transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
      }}
      className="hover:bg-muted/50"
      onDragStart={e => {
        e.currentTarget.style.opacity = '0.35';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', work.id);
        onDragStart(work.id, work.parentId);
      }}
      onDragOver={e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const rect = e.currentTarget.getBoundingClientRect();
        const offset = e.clientY - rect.top;
        const height = rect.height;

        let position = 'after';
        // If dragging onto a Main Work, middle area triggers "Attach as Sub-project"
        if (!isSub && draggingInfo?.id && draggingInfo?.id !== work.id) {
          if (offset >= height * 0.28 && offset <= height * 0.72) {
            position = 'inside';
          } else if (offset < height * 0.28) {
            position = 'before';
          } else {
            position = 'after';
          }
        } else {
          // Reordering items
          position = offset < height * 0.5 ? 'before' : 'after';
        }

        setDragOverTarget({ id: work.id, position });
        onDragOver();
      }}
      onDragLeave={e => {
        if (dragOverTarget?.id === work.id) {
          setDragOverTarget(null);
        }
      }}
      onDrop={e => {
        e.preventDefault();
        const finalPos = isOverThis ? dragOverTarget.position : 'after';
        setDragOverTarget(null);
        onDrop(work.id, work.parentId, finalPos);
      }}
      onDragEnd={e => {
        e.currentTarget.style.opacity = '1';
        lastDragEnd.current = Date.now();
        setDragOverTarget(null);
        onDragEnd();
      }}
      onClick={() => { if (Date.now() - lastDragEnd.current < 300) return; onNavigate(work.id); }}
    >
      {/* ── Column 1: MOVE (Reorder Grip & Expand Chevron) ── */}
      <TableCell style={{ width: 54, minWidth: 54, maxWidth: 54, textAlign: 'center', padding: '0.75rem 0.25rem 0.75rem 0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.15rem' }}>
          <span
            style={{ cursor: 'grab', color: '#a1a1aa', display: 'flex', alignItems: 'center', userSelect: 'none' }}
            title={isSub ? "Drag to reorder sub-projects or drag to top banner to promote to Main Project" : "Drag top/bottom to reorder, or center to attach as sub-project"}
            onClick={e => e.stopPropagation()}
          >
            <GripVertical size={16} />
          </span>

          {!isSub && hasSubs ? (
            <button
              onClick={e => { e.stopPropagation(); onToggleExpand(); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 0, display: 'flex', alignItems: 'center' }}
              title={expanded ? "Collapse Sub-Projects" : "Expand Sub-Projects"}
            >
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          ) : !isSub ? (
            <div style={{ width: 14 }} />
          ) : null}

          {isSub && <CornerDownRight size={14} color="#0284c7" style={{ marginLeft: '0.1rem' }} />}
        </div>
      </TableCell>

      {/* ── Column 2: INC. (Cost Inclusion Toggle) ── */}
      <TableCell style={{ width: 34, minWidth: 34, maxWidth: 34, textAlign: 'center', padding: '0.75rem 0.15rem' }} onClick={(e) => { e.stopPropagation(); onToggleExclude(work); }}>
        <div
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title={work.isExcluded ? 'Currently EXCLUDED from totals. Click to include.' : 'Currently INCLUDED in totals. Click to exclude.'}
        >
          {work.isExcluded ? <EyeOff size={17} color="#ef4444" style={{ opacity: 0.8 }} /> : <Eye size={17} color="#10b981" />}
        </div>
      </TableCell>

      {/* ── Column 3: SELECT (Only when selectMode is active) ── */}
      {selectMode && (
        <TableCell style={{ width: 34, minWidth: 34, maxWidth: 34, textAlign: 'center', padding: '0.75rem 0.15rem' }} onClick={e => e.stopPropagation()}>
          {!isSub ? (
            <div
              onClick={(e) => { e.stopPropagation(); onToggleSelect(work.id); }}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Select to group into a Main Project"
            >
              {isSelected ? <CheckSquare size={18} color="var(--primary)" /> : <Square size={18} color="#d1d5db" />}
            </div>
          ) : (
            <div style={{ width: 18 }} />
          )}
        </TableCell>
      )}

      {/* ── Column 4: Work Name & Tags ── */}
      <TableCell style={{ paddingLeft: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{
            fontWeight: isSub ? 600 : 750,
            fontSize: isSub ? '0.92rem' : '1.025rem',
            color: work.isExcluded
              ? 'var(--muted-foreground)'
              : isSub
              ? '#0369a1'
              : 'var(--primary)',
            textDecoration: work.isExcluded ? 'line-through' : 'none',
          }}>
            {work.name}
          </span>

          {isAttachTarget && (
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              backgroundColor: '#16a34a',
              color: '#ffffff',
              padding: '0.15rem 0.5rem',
              borderRadius: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              ↳ Drop to attach as Sub-Project
            </span>
          )}
        </div>
      </TableCell>

      {/* ── Column 5: Specifications ── */}
      <TableCell>
        <div style={{ fontSize: '0.82rem', color: '#52525b', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {work.description || '—'}
        </div>
      </TableCell>

      {/* ── Column 6: Work Code ── */}
      <TableCell style={{ textAlign: 'center', width: 145 }}>
        {isSub ? (
          <span style={{
            fontWeight: 700,
            fontSize: '0.82rem',
            color: '#0369a1',
            backgroundColor: '#e0f2fe',
            padding: '0.2rem 0.5rem',
            borderRadius: '4px',
            fontFamily: 'monospace',
            letterSpacing: '0.02em',
            display: 'inline-block'
          }}>
            {work.workCode ? extractDisplayCode(work.workCode) : '—'}
          </span>
        ) : (
          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#092e20', letterSpacing: '0.02em', fontFamily: 'monospace' }}>
            {work.workCode ? extractDisplayCode(work.workCode) : '—'}
          </span>
        )}
      </TableCell>

      {/* ── Column 7: Cost ── */}
      <TableCell style={{
        textAlign: 'right',
        width: 160,
        fontWeight: isSub ? 600 : 750,
        fontSize: isSub ? '0.92rem' : '1rem',
        color: work.isExcluded ? 'var(--muted-foreground)' : (isSub ? '#334155' : 'var(--foreground)'),
        paddingRight: '1.5rem',
        textDecoration: work.isExcluded ? 'line-through' : 'none'
      }}>
        ₱{(work.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </TableCell>

      {/* ── Column 8: Action Buttons ── */}
      <TableCell style={{ textAlign: 'right', width: 140 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end', alignItems: 'center' }}>
          {isSub && (
            <ActionBtn onClick={() => onPromote(work.id)} title="Detach from Main Project (Make independent Main Project)">
              <ArrowUpRight size={16} color="#2563eb" />
            </ActionBtn>
          )}
          {!isSub && <ActionBtn onClick={() => onCreateSub()} title="Add Sub-Schedule"><Plus size={15} /></ActionBtn>}
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

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function ProgramOfWorks() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId');
  const navigate = useNavigate();

  const [selectMode, setSelectMode] = useState(false);

  const query = useMemo(
    () => (projectId ? [{ field: 'projectId', operator: '==', value: projectId }] : []),
    [projectId],
  );

  const { data: works, createItem, updateItem, refresh } = useCollection('schedulesOfWork', query);
  const { createItem: createWorkDirect } = useCollection('schedulesOfWork');
  const { data: projects } = useCollection('projects');
  const { data: scheduleTemplates } = useCollection('scheduleTemplates');
  const { data: templateWorks } = useCollection('scheduleTemplateWorks');
  const { data: templateWorkGroups } = useCollection('scheduleTemplateWorkGroups');
  const { data: workGroupTemplates } = useCollection('workGroupTemplates');
  const { data: workGroupTemplateItems } = useCollection('workGroupTemplateItems');

  const { createItem: createSummary } = useCollection('scheduleSummaries');
  const { createItem: createSummaryItem } = useCollection('summaryItems');

  const project = projects.find(p => p.id === projectId) ?? null;

  const projectCodeRef = useRef(project?.projectCode);
  projectCodeRef.current = project?.projectCode;

  const worksRef = useRef(works);
  worksRef.current = works;

  // Auto-heal contiguous work codes if any gaps exist
  React.useEffect(() => {
    if (!project?.projectCode || !works.length) return;
    const updates = computeWorkCodeUpdates(works, project.projectCode);
    if (updates.length > 0) {
      Promise.all(updates.map(u => updateItem(u))).then(() => refresh());
    }
  }, [works, project?.projectCode, updateItem, refresh]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingWork, setEditingWork] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [importTemplateOpen, setImportTemplateOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const [selectedWorkIds, setSelectedWorkIds] = useState(new Set());
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);

  const draggingIdx = useRef(null);
  const draggingParentId = useRef(null);
  const [draggingInfo, setDraggingInfo] = useState({ id: null, parentId: null });
  const [dragOverTarget, setDragOverTarget] = useState(null);

  // ── Auto-scroll during drag ──
  const tableWrapperRef = useRef(null);
  const scrollAnimRef = useRef(null);
  const scrollSpeedRef = useRef(0);

  const startAutoScroll = useCallback(() => {
    if (scrollAnimRef.current) return;
    const step = () => {
      if (scrollSpeedRef.current !== 0 && tableWrapperRef.current) {
        tableWrapperRef.current.scrollTop += scrollSpeedRef.current;
      }
      scrollAnimRef.current = requestAnimationFrame(step);
    };
    scrollAnimRef.current = requestAnimationFrame(step);
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (scrollAnimRef.current) {
      cancelAnimationFrame(scrollAnimRef.current);
      scrollAnimRef.current = null;
    }
    scrollSpeedRef.current = 0;
  }, []);

  React.useEffect(() => {
    if (!draggingInfo?.id) {
      stopAutoScroll();
      return;
    }

    const handleWindowDragOver = (e) => {
      if (!tableWrapperRef.current) return;
      const rect = tableWrapperRef.current.getBoundingClientRect();
      const threshold = 80;
      const clientY = e.clientY;

      if (clientY < rect.top + threshold && clientY >= rect.top - 60) {
        const dist = Math.max(1, (rect.top + threshold) - clientY);
        scrollSpeedRef.current = -Math.min(24, Math.max(3, Math.floor(dist * 0.3)));
        startAutoScroll();
      } else if (clientY > rect.bottom - threshold && clientY <= rect.bottom + 60) {
        const dist = Math.max(1, clientY - (rect.bottom - threshold));
        scrollSpeedRef.current = Math.min(24, Math.max(3, Math.floor(dist * 0.3)));
        startAutoScroll();
      } else {
        scrollSpeedRef.current = 0;
      }
    };

    const handleWindowDragEnd = () => {
      stopAutoScroll();
    };

    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragend', handleWindowDragEnd);
    window.addEventListener('drop', handleWindowDragEnd);

    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('dragend', handleWindowDragEnd);
      window.removeEventListener('drop', handleWindowDragEnd);
      stopAutoScroll();
    };
  }, [draggingInfo?.id, startAutoScroll, stopAutoScroll]);

  const [defaultLabor, setDefaultLabor] = useState('0');
  const [defaultTools, setDefaultTools] = useState('0');
  const [defaultOcm, setDefaultOcm] = useState('0');

  const runningTotal = useMemo(() => {
    return works
      .filter(w => !w.parentId && !w.isExcluded)
      .reduce((sum, w) => sum + (w.totalCost || 0), 0);
  }, [works]);

  const mainWorks = useMemo(() => works.filter(w => !w.parentId), [works]);

  const handleToggleSelect = useCallback((id) => {
    setSelectedWorkIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    if (selectedWorkIds.size === mainWorks.length && mainWorks.length > 0) {
      setSelectedWorkIds(new Set());
    } else {
      setSelectedWorkIds(new Set(mainWorks.map(w => w.id)));
    }
  }, [mainWorks, selectedWorkIds]);

  const allMainSelected = mainWorks.length > 0 && selectedWorkIds.size === mainWorks.length;

  const handleGroupSelected = useCallback(async ({ name, description }) => {
    if (selectedWorkIds.size === 0 || !projectId) return;

    const selectedIds = new Set(selectedWorkIds);
    const selectedList = worksRef.current.filter(w => selectedIds.has(w.id));
    if (selectedList.length === 0) return;

    const minSelectedOrder = selectedList.reduce((min, w) => Math.min(min, w.order ?? 0), 0);

    const newParentId = crypto.randomUUID();
    const newParent = {
      id: newParentId,
      projectId,
      name,
      description: description || '',
      parentId: null,
      order: minSelectedOrder,
      workCode: '',
      totalCost: 0,
      isExcluded: false,
      createdAt: new Date().toISOString(),
    };

    const updates = [];
    let subOrder = 0;
    for (const item of selectedList) {
      updates.push({
        ...item,
        parentId: newParentId,
        order: subOrder++,
      });

      const existingChildren = worksRef.current.filter(w => w.parentId === item.id);
      for (const child of existingChildren) {
        updates.push({
          ...child,
          parentId: newParentId,
          order: subOrder++,
        });
      }
    }

    await createWorkDirect(newParent);
    await Promise.all(updates.map(u => updateItem(u)));

    const updatedMap = new Map(updates.map(u => [u.id, u]));
    const allAfter = [
      newParent,
      ...worksRef.current.map(w => updatedMap.get(w.id) || w)
    ];

    const codeUpdates = computeWorkCodeUpdates(allAfter.filter(w => w.projectId === projectId), projectCodeRef.current);
    if (codeUpdates.length) {
      await Promise.all(codeUpdates.map(u => updateItem(u)));
    }

    await recomputeScheduleCost(newParentId);
    await recomputeProjectCostsDeep(projectId);

    setSelectedWorkIds(new Set());
    setGroupDialogOpen(false);
    refresh();
  }, [selectedWorkIds, projectId, createWorkDirect, updateItem, refresh]);

  const handleCreate = useCallback(async ({ name, description }) => {
    if (!projectId) return;
    const isSub = !!createParentId;
    const siblings = worksRef.current.filter(w => isSub ? w.parentId === createParentId : !w.parentId);
    const tempOrder = siblings.reduce((m, w) => Math.max(m, w.order ?? 0), -1) + 1;

    const newWork = {
      projectId,
      name,
      description: description || '',
      parentId: createParentId || null,
      order: tempOrder,
      workCode: '',
      totalCost: 0,
      isExcluded: false,
      createdAt: new Date().toISOString(),
    };

    const created = await createWorkDirect(newWork);
    const allAfter = [...worksRef.current, { ...newWork, id: created?.id || crypto.randomUUID() }];
    const codeUpdates = computeWorkCodeUpdates(allAfter, projectCodeRef.current);
    if (codeUpdates.length) await Promise.all(codeUpdates.map(u => updateItem(u)));

    setCreateOpen(false);
    setCreateParentId(null);
  }, [projectId, createWorkDirect, createParentId, updateItem]);

  const handleEdit = useCallback(async ({ name, description }) => {
    if (!editingWork) return;
    await updateItem({ ...editingWork, name, description });
    setEditOpen(false);
    setEditingWork(null);
  }, [editingWork, updateItem]);

  const handleDelete = useCallback(async (id) => {
    if (!confirm('Delete this work? All cost entries will be permanently removed.')) return;

    const allCurrent = worksRef.current;
    const subtreeIds = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      allCurrent.forEach(w => {
        if (w.parentId && subtreeIds.has(w.parentId) && !subtreeIds.has(w.id)) {
          subtreeIds.add(w.id); changed = true;
        }
      });
    }

    await cascadeDelete('schedule', id);

    const allAfter = allCurrent.filter(w => !subtreeIds.has(w.id));
    const codeUpdates = computeWorkCodeUpdates(allAfter, projectCodeRef.current);
    if (codeUpdates.length) await Promise.all(codeUpdates.map(u => updateItem(u)));

    refresh();
  }, [refresh, updateItem]);

  const handleToggleExclude = useCallback(async (work) => {
    const isNowExcluded = !work.isExcluded;
    const toUpdate = [work, ...worksRef.current.filter(w => w.parentId === work.id)];
    await Promise.all(toUpdate.map(w => updateItem({ ...w, isExcluded: isNowExcluded })));
    await recomputeScheduleCost(work.id);
  }, [updateItem]);

  const handleDuplicate = useCallback(async (work) => {
    const currentProject = projects.find(p => p.id === work.projectId);
    const siblings = works.filter(w => w.projectId === work.projectId && (w.parentId || null) === (work.parentId || null));
    const parent = works.find(w => w.id === work.parentId);
    const workCode = generateWorkCode(currentProject?.projectCode, parent?.workCode, siblings);
    const maxOrder = siblings.reduce((m, w) => Math.max(m, w.order ?? 0), -1);

    const newScheduleId = crypto.randomUUID();
    const newSchedulePayload = {
      ...work,
      id: newScheduleId,
      workCode,
      name: `${work.name} (Copy)`,
      totalCost: 0,
      isExcluded: false,
      order: maxOrder + 1,
      createdAt: new Date().toISOString(),
    };

    const { newSubSchedules } = await cascadeDuplicateSchedule({
      sourceScheduleId: work.id,
      newSchedulePayload,
    });

    if (newSubSchedules.length > 0) {
      const pCode = projectCodeRef.current;
      const newIds = new Set([newSchedulePayload.id, ...newSubSchedules.map(s => s.id)]);
      const allAfter = [
        ...worksRef.current.filter(w => !newIds.has(w.id)),
        newSchedulePayload,
        ...newSubSchedules,
      ];
      const codeUpdates = computeWorkCodeUpdates(allAfter, pCode);
      if (codeUpdates.length) await Promise.all(codeUpdates.map(u => updateItem(u)));

      for (const sub of newSubSchedules) {
        await recomputeScheduleCost(sub.id);
      }
      await recomputeScheduleCost(newSchedulePayload.id);
    }

    refresh();
  }, [projects, works, refresh, updateItem]);

  const openEdit = useCallback((work) => {
    setEditingWork(work);
    setEditOpen(true);
  }, []);

  // ─── Promote / Detach Sub-Work to independent Main Project ────────────────
  const handlePromoteToMain = useCallback(async (workId) => {
    const currentWorks = [...worksRef.current];
    const workToPromote = currentWorks.find(w => w.id === workId);
    if (!workToPromote || !workToPromote.parentId) return;

    const oldParentId = workToPromote.parentId;
    const mainRoots = currentWorks
      .filter(w => !w.parentId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const updatedPromoted = {
      ...workToPromote,
      parentId: null,
      order: mainRoots.length,
    };

    const remainingOldSubs = currentWorks
      .filter(w => w.parentId === oldParentId && w.id !== workId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const reorderedOldSubs = remainingOldSubs.map((item, idx) => ({ ...item, order: idx }));

    const allDirectUpdates = [updatedPromoted, ...reorderedOldSubs];
    await Promise.all(allDirectUpdates.map(u => updateItem(u)));

    const updatedMap = new Map(allDirectUpdates.map(u => [u.id, u]));
    const fullSnapshot = currentWorks.map(w => updatedMap.get(w.id) || w);

    const codeUpdates = computeWorkCodeUpdates(fullSnapshot.filter(w => w.projectId === projectId), projectCodeRef.current);
    if (codeUpdates.length) {
      await Promise.all(codeUpdates.map(u => updateItem(u)));
    }

    await recomputeScheduleCost(oldParentId);
    await recomputeProjectCostsDeep(projectId);
    refresh();
  }, [projectId, updateItem, refresh]);

  const handleDragStart = useCallback((id, parentId) => {
    draggingIdx.current = id;
    draggingParentId.current = parentId || null;
    setDraggingInfo({ id, parentId: parentId || null });
  }, []);

  const handleDragOver = useCallback(() => {}, []);

  const handleDrop = useCallback(async (targetId, targetParentId, dropPosition = 'after') => {
    stopAutoScroll();
    const fromId = draggingIdx.current;
    const fromParentId = draggingParentId.current;
    draggingIdx.current = null;
    draggingParentId.current = null;
    setDraggingInfo({ id: null, parentId: null });
    setDragOverTarget(null);

    if (!fromId || fromId === targetId) return;

    const currentWorks = [...worksRef.current];
    const draggedItem = currentWorks.find(w => w.id === fromId);
    const targetItem = currentWorks.find(w => w.id === targetId);

    if (!draggedItem || !targetItem) return;

    const pCode = projectCodeRef.current;
    const oldParentId = draggedItem.parentId || null;

    // ── CASE 1: dropPosition === 'inside' (Attach onto a Main Work) ─────────
    if (dropPosition === 'inside' && !targetItem.parentId) {
      const targetMainId = targetItem.id;
      const targetSubs = currentWorks
        .filter(w => w.parentId === targetMainId && w.id !== fromId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const updatedDragged = {
        ...draggedItem,
        parentId: targetMainId,
        order: targetSubs.length,
      };

      const draggedChildren = currentWorks.filter(w => w.parentId === fromId);
      const childUpdates = draggedChildren.map((child, cIdx) => ({
        ...child,
        parentId: targetMainId,
        order: targetSubs.length + 1 + cIdx,
      }));

      let oldSiblingsUpdates = [];
      if (oldParentId && oldParentId !== targetMainId) {
        const remainingOldSubs = currentWorks
          .filter(w => w.parentId === oldParentId && w.id !== fromId)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        oldSiblingsUpdates = remainingOldSubs.map((item, idx) => ({ ...item, order: idx }));
      }

      let mainRootsUpdates = [];
      if (!oldParentId) {
        const remainingRoots = currentWorks
          .filter(w => !w.parentId && w.id !== fromId)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        mainRootsUpdates = remainingRoots.map((item, idx) => ({ ...item, order: idx }));
      }

      const allDirectUpdates = [
        updatedDragged,
        ...childUpdates,
        ...oldSiblingsUpdates,
        ...mainRootsUpdates,
      ];

      await Promise.all(allDirectUpdates.map(u => updateItem(u)));

      const updatedMap = new Map(allDirectUpdates.map(u => [u.id, u]));
      const fullSnapshot = currentWorks.map(w => updatedMap.get(w.id) || w);

      const codeUpdates = computeWorkCodeUpdates(fullSnapshot.filter(w => w.projectId === projectId), pCode);
      if (codeUpdates.length) {
        await Promise.all(codeUpdates.map(u => updateItem(u)));
      }

      if (oldParentId) await recomputeScheduleCost(oldParentId);
      await recomputeScheduleCost(targetMainId);
      await recomputeProjectCostsDeep(projectId);
      refresh();
      return;
    }

    // ── CASE 2: Dragging a Sub-Work (oldParentId !== null) onto/between Main Projects (targetParentId === null) ──
    if (oldParentId !== null && !targetItem.parentId) {
      const roots = currentWorks
        .filter(w => !w.parentId && w.id !== fromId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const targetIdx = roots.findIndex(w => w.id === targetId);
      const insertIdx = dropPosition === 'before' ? targetIdx : targetIdx + 1;

      const promotedItem = {
        ...draggedItem,
        parentId: null,
      };

      const newRoots = [...roots];
      newRoots.splice(insertIdx, 0, promotedItem);
      const reorderedRoots = newRoots.map((item, idx) => ({ ...item, order: idx }));

      const remainingOldSubs = currentWorks
        .filter(w => w.parentId === oldParentId && w.id !== fromId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const reorderedOldSubs = remainingOldSubs.map((item, idx) => ({ ...item, order: idx }));

      const allDirectUpdates = [...reorderedRoots, ...reorderedOldSubs];
      await Promise.all(allDirectUpdates.map(u => updateItem(u)));

      const updatedMap = new Map(allDirectUpdates.map(u => [u.id, u]));
      const fullSnapshot = currentWorks.map(w => updatedMap.get(w.id) || w);

      const codeUpdates = computeWorkCodeUpdates(fullSnapshot.filter(w => w.projectId === projectId), pCode);
      if (codeUpdates.length) {
        await Promise.all(codeUpdates.map(u => updateItem(u)));
      }

      await recomputeScheduleCost(oldParentId);
      await recomputeProjectCostsDeep(projectId);
      refresh();
      return;
    }

    // ── CASE 3: Dragging a Sub-Work across to a different Main Project's sub-list ──
    if (oldParentId !== null && targetParentId !== null && oldParentId !== targetParentId) {
      const targetSiblings = currentWorks
        .filter(w => w.parentId === targetParentId && w.id !== fromId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const targetIdx = targetSiblings.findIndex(w => w.id === targetId);
      const insertIdx = dropPosition === 'before' ? targetIdx : targetIdx + 1;

      const movedItem = {
        ...draggedItem,
        parentId: targetParentId,
      };

      const newSiblings = [...targetSiblings];
      newSiblings.splice(insertIdx, 0, movedItem);
      const reorderedNewSubs = newSiblings.map((item, idx) => ({ ...item, order: idx }));

      const remainingOldSubs = currentWorks
        .filter(w => w.parentId === oldParentId && w.id !== fromId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const reorderedOldSubs = remainingOldSubs.map((item, idx) => ({ ...item, order: idx }));

      const allDirectUpdates = [...reorderedNewSubs, ...reorderedOldSubs];
      await Promise.all(allDirectUpdates.map(u => updateItem(u)));

      const updatedMap = new Map(allDirectUpdates.map(u => [u.id, u]));
      const fullSnapshot = currentWorks.map(w => updatedMap.get(w.id) || w);

      const codeUpdates = computeWorkCodeUpdates(fullSnapshot.filter(w => w.projectId === projectId), pCode);
      if (codeUpdates.length) {
        await Promise.all(codeUpdates.map(u => updateItem(u)));
      }

      await recomputeScheduleCost(oldParentId);
      await recomputeScheduleCost(targetParentId);
      await recomputeProjectCostsDeep(projectId);
      refresh();
      return;
    }

    // ── CASE 4: Sibling Reordering (Main with Main, or Sub-Work with Sub-Work under SAME parent) ──
    const siblings = currentWorks
      .filter(w => (w.parentId || null) === (oldParentId || null))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const fromIdx = siblings.findIndex(w => w.id === fromId);
    if (fromIdx === -1) return;

    const spliced = [...siblings];
    const [moved] = spliced.splice(fromIdx, 1);
    const newTargetIdx = spliced.findIndex(w => w.id === targetId);
    if (newTargetIdx === -1) {
      spliced.push(moved);
    } else {
      const insertIdx = dropPosition === 'before' ? newTargetIdx : newTargetIdx + 1;
      spliced.splice(insertIdx, 0, moved);
    }

    const reorderedSiblings = spliced.map((item, idx) => ({ ...item, order: idx }));
    // Persist reordered order to IndexedDB!
    await Promise.all(reorderedSiblings.map(u => updateItem(u)));

    const updatedMap = new Map(reorderedSiblings.map(u => [u.id, u]));
    const fullSnapshot = currentWorks.map(w => updatedMap.get(w.id) || w);

    const codeUpdates = computeWorkCodeUpdates(fullSnapshot.filter(w => w.projectId === projectId), pCode);
    if (codeUpdates.length) {
      await Promise.all(codeUpdates.map(u => updateItem(u)));
    }
    refresh();
  }, [projectId, updateItem, refresh]);

  const handleDragEnd = useCallback(() => {
    stopAutoScroll();
    draggingIdx.current = null;
    draggingParentId.current = null;
    setDraggingInfo({ id: null, parentId: null });
    setDragOverTarget(null);
  }, [stopAutoScroll]);

  const sortedWorks = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return works
      .filter(w => !q || w.name?.toLowerCase().includes(q) || w.description?.toLowerCase().includes(q))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [works, searchQuery]);

  const handleOpenDefaults = useCallback(() => {
    if (project) {
      setDefaultLabor(String(project.defaultLaborPercentage ?? 0));
      setDefaultTools(String(project.defaultToolsPercentage ?? 0));
      setDefaultOcm(String(project.defaultOcmPercentage ?? 0));
    }
    setDefaultsOpen(true);
  }, [project]);

  const handleSaveDefaults = useCallback(async () => {
    if (!project) return;
    const { updateItem: updateProject } = useCollection('projects');
    await updateProject({
      ...project,
      defaultLaborPercentage: parseFloat(defaultLabor) || 0,
      defaultToolsPercentage: parseFloat(defaultTools) || 0,
      defaultOcmPercentage: parseFloat(defaultOcm) || 0,
    });
    setDefaultsOpen(false);
  }, [project, defaultLabor, defaultTools, defaultOcm]);

  const handleImportTemplate = useCallback(async () => {
    if (!selectedTemplateId || !projectId) return;
    const tWorks = templateWorks.filter(tw => tw.templateId === selectedTemplateId);
    const tWorkGroups = templateWorkGroups.filter(twg => twg.templateId === selectedTemplateId);
    const rootTemplateWorks = tWorks.filter(tw => !tw.parentId);
    const subTemplateWorks = tWorks.filter(tw => tw.parentId);
    const existingMainWorks = works.filter(w => !w.parentId);
    let currentMaxOrder = existingMainWorks.reduce((m, w) => Math.max(m, w.order ?? 0), -1);

    const templateIdToScheduleId = {};
    const schedulesToCreate = [];

    rootTemplateWorks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const tw of rootTemplateWorks) {
      currentMaxOrder++;
      const newScheduleId = crypto.randomUUID();
      templateIdToScheduleId[tw.id] = newScheduleId;
      schedulesToCreate.push({ id: newScheduleId, projectId, name: tw.name, description: tw.description || '', order: currentMaxOrder, parentId: null, workCode: '', totalCost: 0, isExcluded: false, createdAt: new Date().toISOString() });
    }

    subTemplateWorks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const stw of subTemplateWorks) {
      const parentScheduleId = templateIdToScheduleId[stw.parentId];
      if (!parentScheduleId) continue;
      const newScheduleId = crypto.randomUUID();
      templateIdToScheduleId[stw.id] = newScheduleId;
      schedulesToCreate.push({ id: newScheduleId, projectId, name: stw.name, description: stw.description || '', order: 0, parentId: parentScheduleId, workCode: '', totalCost: 0, isExcluded: false, createdAt: new Date().toISOString() });
    }

    for (const s of schedulesToCreate) await createWorkDirect(s);
    for (const tw of tWorks) {
      const scheduleId = templateIdToScheduleId[tw.id];
      if (!scheduleId) continue;
      const matchingTwgs = tWorkGroups.filter(twg => twg.templateWorkId === tw.id);
      for (const twg of matchingTwgs) {
        const wgTemplate = workGroupTemplates.find(wgt => wgt.id === twg.workGroupTemplateId);
        if (!wgTemplate) continue;
        const newSummaryId = crypto.randomUUID();
        await createSummary({ id: newSummaryId, scheduleId, projectId, name: wgTemplate.name, totalDirectCost: 0, totalEstimatedCost: 0, totalContractCost: 0, createdAt: new Date().toISOString() });
        const templateItems = workGroupTemplateItems.filter(item => item.workGroupTemplateId === wgTemplate.id);
        for (const tItem of templateItems) await createSummaryItem({ id: crypto.randomUUID(), scheduleSummaryId: newSummaryId, scheduleId, projectId, name: tItem.name, quantity: tItem.quantity, unitCost: tItem.unitCost, directCost: (tItem.quantity || 1) * (tItem.unitCost || 0), createdAt: new Date().toISOString() });
        await recomputeSummaryCost(newSummaryId);
      }
      await recomputeScheduleCost(scheduleId);
    }
    await recomputeProjectCostsDeep(projectId);
    setImportTemplateOpen(false);
    setSelectedTemplateId('');
    refresh();
  }, [selectedTemplateId, projectId, templateWorks, templateWorkGroups, works, workGroupTemplates, workGroupTemplateItems, createWorkDirect, createSummary, createSummaryItem, refresh]);

  if (!projectId) return null;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: 'calc(100vh - 10rem)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', flexShrink: 0 }}>
        <div>
          <button onClick={() => navigate('/projects')} style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '0.5rem', fontWeight: 600 }}>
            <ArrowLeft size={14} /> Back to Projects
          </button>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.03em' }}>{project?.name ?? 'Program of Works'}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right', marginRight: '0.5rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Running Total</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.02em' }}>₱{runningTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--background)', padding: '0 0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', width: 220, height: '2.5rem' }}>
            <Search size={16} color="var(--muted-foreground)" />
            <input type="text" placeholder="Search works…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.9rem', color: 'var(--foreground)' }} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              id="btn-toggle-select-mode"
              variant={selectMode ? "default" : "outline"}
              onClick={() => {
                setSelectMode(v => {
                  if (v) setSelectedWorkIds(new Set());
                  return !v;
                });
              }}
              style={{
                backgroundColor: selectMode ? '#092e20' : undefined,
                color: selectMode ? '#ffffff' : undefined,
              }}
              title={selectMode ? "Done Selecting (Exit Selection Mode)" : "Select & Group Main Projects"}
            >
              <CheckSquare size={18} color={selectMode ? '#4ade80' : 'currentColor'} />
            </Button>
            <Button variant="outline" onClick={() => navigate(`/print/cost-estimates?projectId=${projectId}`)} title="Print Project Cost Estimates">
              <Printer size={18} />
            </Button>
            <Button id="btn-project-defaults" variant="outline" onClick={handleOpenDefaults} title="Project Cost Defaults">
              <Settings size={18} />
            </Button>
            <Button id="btn-import-template" variant="outline" onClick={() => setImportTemplateOpen(true)} title="Import Template">
              <Layers size={18} />
            </Button>
          </div>
          <Button onClick={() => { setCreateParentId(null); setCreateOpen(true); }}><Plus size={18} /> New Work</Button>
        </div>
      </header>

      {/* ── Sub-Work Promotion Drop Zone (appears when dragging a sub-work) ── */}
      {draggingInfo?.id && draggingInfo?.parentId !== null && (
        <div
          onDragOver={e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            e.currentTarget.style.backgroundColor = '#dbeafe';
            e.currentTarget.style.borderColor = '#2563eb';
          }}
          onDragLeave={e => {
            e.currentTarget.style.backgroundColor = '#eff6ff';
            e.currentTarget.style.borderColor = '#3b82f6';
          }}
          onDrop={e => {
            e.preventDefault();
            const idToPromote = draggingInfo?.id || draggingIdx.current;
            if (idToPromote) {
              handlePromoteToMain(idToPromote);
            }
          }}
          style={{
            padding: '0.85rem',
            backgroundColor: '#eff6ff',
            border: '2px dashed #3b82f6',
            borderRadius: 'var(--radius)',
            textAlign: 'center',
            color: '#1d4ed8',
            fontWeight: 700,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            animation: 'fade-in 0.2s ease'
          }}
        >
          <ArrowUpRight size={18} />
          <span>Drop here to promote this Sub-Project to an independent Main Project</span>
        </div>
      )}

      {/* ── Table ── */}
      <div style={{ flex: 1, minHeight: 0, borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <Table wrapperRef={tableWrapperRef} wrapperStyle={{ border: 'none', boxShadow: 'none', borderRadius: 0, height: '100%', overflowY: 'auto' }}>
          <TableHeader style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--background)', boxShadow: '0 1px 0 var(--border)' }}>
            <TableRow>
              <TableHead style={{ width: 54, minWidth: 54, maxWidth: 54, textAlign: 'center', padding: '0 0.25rem 0 0.75rem', fontSize: '0.65rem', fontWeight: 800, color: 'var(--muted-foreground)' }}>
                MOVE
              </TableHead>
              <TableHead style={{ width: 34, minWidth: 34, maxWidth: 34, textAlign: 'center', padding: '0 0.15rem', fontSize: '0.65rem', fontWeight: 800, color: 'var(--muted-foreground)' }}>
                INC.
              </TableHead>
              {selectMode && (
                <TableHead style={{ width: 34, minWidth: 34, maxWidth: 34, textAlign: 'center', padding: '0 0.15rem' }}>
                  <div 
                    style={{ cursor: 'pointer', display: 'flex', justifyContent: 'center' }} 
                    onClick={handleToggleSelectAll}
                    title={allMainSelected ? "Deselect all main works" : "Select all main works to group"}
                  >
                    {allMainSelected ? <CheckSquare size={18} color="var(--primary)" /> : <Square size={18} color="var(--muted-foreground)" />}
                  </div>
                </TableHead>
              )}
              <TableHead style={{ paddingLeft: '0.5rem' }}>WORK NAME</TableHead>
              <TableHead>WORK SPECIFICATIONS</TableHead>
              <TableHead style={{ width: 145, textAlign: 'center' }}>WORK CODE</TableHead>
              <TableHead style={{ textAlign: 'right', width: 160 }}>TOTAL WORK COST</TableHead>
              <TableHead style={{ width: 140 }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedWorks.length === 0 && (
              <TableRow>
                <TableCell colSpan={selectMode ? 9 : 8} style={{ textAlign: 'center', padding: '4.5rem', color: 'var(--muted-foreground)' }}>
                  <Calendar size={32} style={{ opacity: 0.15, marginBottom: '1.25rem' }} />
                  <p>{searchQuery ? 'No works match your search.' : 'No works found. Add a new work to begin.'}</p>
                </TableCell>
              </TableRow>
            )}

            {sortedWorks.filter(w => !w.parentId).map((mainWork) => (
              <WorkGroup
                key={mainWork.id}
                mainWork={mainWork}
                subWorks={sortedWorks.filter(w => w.parentId === mainWork.id)}
                selectMode={selectMode}
                selectedWorkIds={selectedWorkIds}
                onToggleSelect={handleToggleSelect}
                draggingInfo={draggingInfo}
                dragOverTarget={dragOverTarget}
                setDragOverTarget={setDragOverTarget}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onNavigate={(id) => navigate(`/summary?scheduleId=${id}`)}
                onToggleExclude={handleToggleExclude}
                onDuplicate={handleDuplicate}
                onEdit={openEdit}
                onDelete={handleDelete}
                onCreateSub={(parentId) => { setCreateParentId(parentId); setCreateOpen(true); }}
                onPromote={handlePromoteToMain}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ── Floating Action Bar for Grouping ── */}
      {selectedWorkIds.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '2.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          backgroundColor: '#092e20',
          color: 'white',
          padding: '0.65rem 1.25rem',
          borderRadius: '9999px',
          boxShadow: '0 12px 30px -4px rgba(0, 0, 0, 0.4), 0 4px 12px -2px rgba(0, 0, 0, 0.2)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          animation: 'fade-in 0.2s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>
            <CheckSquare size={18} color="#4ade80" />
            <span>{selectedWorkIds.size} Main Project{selectedWorkIds.size > 1 ? 's' : ''} Selected</span>
          </div>
          <div style={{ height: '1.25rem', width: '1px', backgroundColor: 'rgba(255,255,255,0.2)' }} />
          <Button
            size="sm"
            onClick={() => setGroupDialogOpen(true)}
            style={{
              backgroundColor: '#22c55e',
              color: '#092e20',
              fontWeight: 700,
              borderRadius: '9999px',
              height: '2rem',
              padding: '0 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <FolderPlus size={15} />
            Group as Main Project
          </Button>
          <button
            onClick={() => setSelectedWorkIds(new Set())}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center' }}
            title="Clear selection"
          >
            <X size={18} />
          </button>
        </div>
      )}

      <GroupWorksDialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen} count={selectedWorkIds.size} onSubmit={handleGroupSelected} />
      <CreateWorkDialog open={createOpen} onOpenChange={setCreateOpen} projectName={project?.name} projectId={projectId} onSubmit={handleCreate} />
      <EditWorkDialog open={editOpen} onOpenChange={v => { setEditOpen(v); if (!v) setEditingWork(null); }} work={editingWork} onSubmit={handleEdit} />
      
      <Dialog open={defaultsOpen} onOpenChange={setDefaultsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Project Default Percentages</DialogTitle></DialogHeader>
          <DialogBody>
            <Input type="number" value={defaultLabor} onChange={e => setDefaultLabor(e.target.value)} />
            <Input type="number" value={defaultTools} onChange={e => setDefaultTools(e.target.value)} />
            <Input type="number" value={defaultOcm} onChange={e => setDefaultOcm(e.target.value)} />
          </DialogBody>
          <DialogFooter><Button onClick={handleSaveDefaults}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importTemplateOpen} onOpenChange={setImportTemplateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Import Template</DialogTitle></DialogHeader>
          <DialogBody>
            <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}>
              <option value="">-- Select --</option>
              {scheduleTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </DialogBody>
          <DialogFooter><Button onClick={handleImportTemplate}>Import</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
