import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCollection } from '../hooks/useData';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../components/ui/dialog';
import { Calendar, Plus, ArrowLeft, Edit2, Trash2, Search, GripVertical, Copy, Download, Upload, ChevronDown, ChevronRight, CornerDownRight, Settings, Printer } from 'lucide-react';
import { cascadeDelete, cascadeDuplicateSchedule } from '../lib/cascade';
import { recomputeProjectCost, recomputeScheduleCost, recomputeSummaryCost, recomputeProjectCostsDeep } from '../lib/billing'; // ground-truth recompute
import { SelectCombo } from '../components/ui/select-combo';
import { Layers } from 'lucide-react';
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
 *
 * @param {string} projectCode    - The project code (e.g., "26.001")
 * @param {string} parentWorkCode - The parent's work code if it's a sub-schedule (e.g., "26.001.A")
 * @param {Array}  siblings       - Array of sibling works to determine next available letter/number
 * @param {number} currentOrder   - If provided, forces the generation based on this order index
 */
function generateWorkCode(projectCode, parentWorkCode, siblings, currentOrder = null) {
  if (parentWorkCode) {
    // Sub-schedule formatting: YY.NNN.A.1, YY.NNN.A.2
    if (currentOrder !== null) {
      return `${parentWorkCode}.${currentOrder + 1}`;
    }
    const maxOrder = siblings.reduce((m, w) => Math.max(m, w.order ?? 0), -1);
    return `${parentWorkCode}.${maxOrder + 2}`;
  } else {
    // Main schedule formatting: YY.NNN.A, YY.NNN.B
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

/** Re-index `order` on a reordered array. */
function reindex(list) {
  return list.map((item, idx) => ({ ...item, order: idx }));
}

/**
 * Pure function — computes the correct order & workCode for every schedule
 * in a project from a single source-of-truth snapshot.
 *
 * Groups items by parentId tier, sorts each group by current order,
 * assigns contiguous 0-based indices, and generates work codes top-down
 * (root before children so parent codes are resolved first).
 *
 * @param {Array}  allWorks    - Full list of works for this project (no other projects)
 * @param {string} projectCode - e.g. "26.001"
 * @returns {Array} Only the items that need updating (order or workCode changed)
 */
function computeWorkCodeUpdates(allWorks, projectCode) {
  if (!projectCode || !allWorks.length) return [];

  // Build lookup maps
  const resolvedCode = {};           // id -> final workCode
  const updates = [];

  // ── 1. Root-level schedules ────────────────────────────────────────────────
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

  // ── 2. Sub-schedules (children of root items) ──────────────────────────────
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

const labelStyle = { fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' };

// ─── WorkRow ──────────────────────────────────────────────────

function WorkGroup({ mainWork, subWorks, onDragStart, onDragOver, onDrop, onDragEnd, onNavigate, onToggleExclude, onDuplicate, onEdit, onDelete, onCreateSub }) {
  const [expanded, setExpanded] = useState(true); // open by default
  const hasSubs = subWorks.length > 0;

  return (
    <>
      <WorkRow
        work={mainWork}
        isSub={false}
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
      />

      {expanded && subWorks
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((subWork) => (
          <WorkRow
            key={subWork.id}
            work={subWork}
            isSub={true}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            onNavigate={onNavigate}
            onToggleExclude={onToggleExclude}
            onDuplicate={onDuplicate}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))
      }
    </>
  );
}


function WorkRow({ work, isSub, expanded, onToggleExpand, hasSubs, onCreateSub, onDragStart, onDragOver, onDrop, onDragEnd, onNavigate, onToggleExclude, onDuplicate, onEdit, onDelete }) {
  // Track when the last drag ended so we can suppress the subsequent click
  const lastDragEnd = useRef(0);

  return (
    <TableRow
      draggable
      style={{
        cursor: 'pointer',
        backgroundColor: isSub ? '#fcfcfc' : 'white',
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
        e.currentTarget.style.boxShadow = 'inset 0 2px 0 0 var(--primary)';
        e.currentTarget.style.backgroundColor = 'var(--secondary)';
        onDragOver();
      }}
      onDragLeave={e => {
        e.currentTarget.style.boxShadow = '';
        e.currentTarget.style.backgroundColor = isSub ? '#fcfcfc' : '';
      }}
      onDrop={e => {
        e.preventDefault();
        e.currentTarget.style.boxShadow = '';
        e.currentTarget.style.backgroundColor = isSub ? '#fcfcfc' : '';
        onDrop(work.id, work.parentId);
      }}
      onDragEnd={e => {
        e.currentTarget.style.opacity = '1';
        lastDragEnd.current = Date.now();
        onDragEnd();
      }}
      onClick={() => { if (Date.now() - lastDragEnd.current < 300) return; onNavigate(work.id); }}
    >
      {/* ── Drag grip + exclude checkbox ── */}
      <TableCell style={{ padding: '0.75rem 0.5rem', width: 100, paddingLeft: isSub ? '1.5rem' : '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span
            style={{ cursor: 'grab', color: '#a1a1aa', display: 'flex', alignItems: 'center', userSelect: 'none' }}
            title="Drag to reorder"
            onClick={e => e.stopPropagation()}
          >
            <GripVertical size={16} />
          </span>
          {!isSub && (
            <button onClick={e => { e.stopPropagation(); onToggleExpand(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 0, display: 'flex', alignItems: 'center' }}>
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
          {isSub && <CornerDownRight size={14} style={{ color: 'var(--muted-foreground)', marginLeft: '0.25rem' }} />}
          <input
            type="checkbox"
            checked={!!work.isExcluded}
            onChange={() => onToggleExclude(work)}
            onClick={e => e.stopPropagation()}
            title={work.isExcluded ? 'Excluded — click to include' : 'Included — click to exclude'}
            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--primary)', marginLeft: '0.25rem' }}
          />
        </div>
      </TableCell>

      {/* ── Work name ── */}
      <TableCell>
        <div style={{
          fontWeight: isSub ? 600 : 700,
          fontSize: '0.95rem',
          color: work.isExcluded ? 'var(--muted-foreground)' : (isSub ? 'var(--foreground)' : 'var(--primary)'),
          textDecoration: work.isExcluded ? 'line-through' : 'none',
          paddingLeft: isSub ? '0.5rem' : 0
        }}>
          {work.name}
        </div>
      </TableCell>

      {/* ── Specifications ── */}
      <TableCell>
        <div style={{ fontSize: '0.82rem', color: '#52525b', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {work.description || '—'}
        </div>
      </TableCell>

      {/* ── Work code ── */}
      <TableCell style={{ textAlign: 'center', width: 145 }}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--foreground)', letterSpacing: '0.02em', fontFamily: 'monospace' }}>
          {work.workCode ? extractDisplayCode(work.workCode) : '—'}
        </span>
      </TableCell>

      {/* ── Cost ── */}
      <TableCell style={{
        textAlign: 'right',
        width: 160,
        fontWeight: 700,
        color: work.isExcluded ? 'var(--muted-foreground)' : 'var(--foreground)',
        paddingRight: isSub ? '0.5rem' : '1.5rem'
      }}>
        ₱{(work.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </TableCell>

      {/* ── Action buttons (stop propagation so row-click doesn't fire) ── */}
      <TableCell style={{ textAlign: 'right', width: 120 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end', alignItems: 'center' }}>
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

// ─── Page component ───────────────────────────────────────────────────────────

export default function ProgramOfWorks() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId');
  const facilityId = searchParams.get('facilityId');
  const scheduleId = searchParams.get('scheduleId');
  const navigate = useNavigate();

  const query = useMemo(
    () => (projectId ? [{ field: 'projectId', operator: '==', value: projectId }] : []),
    [projectId],
  );

  const { data: works, createItem, updateItem, refresh } = useCollection('schedulesOfWork', query);
  const { createItem: createWorkDirect } = useCollection('schedulesOfWork'); // for direct creation
  const { data: projects } = useCollection('projects');
  const { data: scheduleTemplates } = useCollection('scheduleTemplates');
  const { data: templateWorks } = useCollection('scheduleTemplateWorks');
  const { data: templateWorkGroups } = useCollection('scheduleTemplateWorkGroups');
  const { data: workGroupTemplates } = useCollection('workGroupTemplates');
  const { data: workGroupTemplateItems } = useCollection('workGroupTemplateItems');

  const { createItem: createSummary } = useCollection('scheduleSummaries');
  const { createItem: createSummaryItem } = useCollection('summaryItems');

  // Derive project synchronously on each render — no stale closure issue
  const project = projects.find(p => p.id === projectId) ?? null;

  // ── UI state ──
  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingWork, setEditingWork] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Project Defaults State ──
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [importTemplateOpen, setImportTemplateOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [defaultLabor, setDefaultLabor] = useState('');
  const [defaultTools, setDefaultTools] = useState('');
  const [defaultOcm, setDefaultOcm] = useState('');

  const handleOpenDefaults = () => {
    if (project) {
      setDefaultLabor(project.defaultLaborPercentage ?? 0);
      setDefaultTools(project.defaultToolsPercentage ?? 0);
      setDefaultOcm(project.defaultOcmPercentage ?? 0);
    }
    setDefaultsOpen(true);
  };

  const { updateItem: updateProject } = useCollection('projects');

  const handleSaveDefaults = async () => {
    if (!project) return;
    await updateProject({
      ...project,
      defaultLaborPercentage: Number(defaultLabor) || 0,
      defaultToolsPercentage: Number(defaultTools) || 0,
      defaultOcmPercentage: Number(defaultOcm) || 0,
    });
    setDefaultsOpen(false);

    // Deep recompute all costs in the project based on new defaults
    await recomputeProjectCostsDeep(projectId);
    refresh();
  };

  const handleImportTemplate = async () => {
    if (!selectedTemplateId || !projectId) return;
    const template = scheduleTemplates.find(t => t.id === selectedTemplateId);
    if (!template) return;

    const worksToCreate = templateWorks.filter(w => w.templateId === selectedTemplateId);
    if (worksToCreate.length === 0) {
      alert('This template has no works defined.');
      return;
    }

    if (works.length > 0 && !confirm('Importing a template will append works to your current project. Continue?')) {
      return;
    }

    // Map template IDs to new instance IDs to maintain hierarchy
    const idMap = {};
    const rootWorks = worksToCreate.filter(w => !w.parentId);
    const pCode = projectCodeRef.current;
    const allImportedSummaryIds = [];

    let snapshot = [...worksRef.current];

    // ── Phase 1: Create Works ──
    const persistMappedWork = async (tplWork, parentId = null) => {
      const newId = crypto.randomUUID();
      idMap[tplWork.id] = newId;

      const siblings = snapshot.filter(w => (w.parentId || null) === (parentId || null));
      const maxOrder = siblings.reduce((m, w) => Math.max(m, w.order ?? 0), -1);

      const newWork = {
        id: newId,
        projectId,
        parentId: parentId || null,
        name: tplWork.name,
        description: tplWork.description || '',
        workCode: '',
        order: maxOrder + 1,
        totalCost: 0,
        isExcluded: false,
        createdAt: new Date().toISOString(),
      };

      await createWorkDirect(newWork);
      snapshot.push(newWork);
      return newId;
    };

    for (const root of rootWorks) {
      const newRootId = await persistMappedWork(root);
      const children = worksToCreate.filter(w => w.parentId === root.id);
      for (const child of children) {
        await persistMappedWork(child, newRootId);
      }
    }

    // ── Phase 2: Resolve Work Codes (so they are correct before we touch summaries) ──
    const codeUpdates = computeWorkCodeUpdates(snapshot.filter(w => w.projectId === projectId), pCode);
    if (codeUpdates.length) {
      for (const u of codeUpdates) {
        await updateItem(u);
        // Update snapshot so subsequent logic sees the correct work codes
        const idx = snapshot.findIndex(w => w.id === u.id);
        if (idx !== -1) snapshot[idx] = { ...snapshot[idx], ...u };
      }
    }

    // ── Phase 3: Create Summaries and Items ──
    for (const tplWork of worksToCreate) {
      const newWorkId = idMap[tplWork.id];
      const linkedGroupRefs = templateWorkGroups.filter(lg => lg.scheduleTemplateWorkId === tplWork.id);

      for (const link of linkedGroupRefs) {
        const groupTpl = workGroupTemplates.find(gt => gt.id === link.workGroupTemplateId);
        if (!groupTpl) continue;

        const summaryId = crypto.randomUUID();
        await createSummary({
          id: summaryId,
          scheduleOfWorkId: newWorkId,
          name: groupTpl.name,
          type: groupTpl.type,
          unit: '',
          totalCost: 0,
          laborPercentage: groupTpl.laborPercentage || 0,
          toolsPercentage: groupTpl.toolsPercentage || 0,
          ocmPercentage: groupTpl.ocmPercentage || 0,
          showLabor: groupTpl.showLabor ?? true,
          showTools: groupTpl.showTools ?? true,
          showOcm: groupTpl.showOcm ?? true,
        });

        const tplItems = workGroupTemplateItems.filter(ti => ti.templateId === groupTpl.id);
        for (const ti of tplItems) {
          const isLabor = groupTpl.type === 'labor';
          const duration = isLabor ? 1 : 1;
          const totalCost = isLabor
            ? ti.unitPrice * duration * ti.quantity
            : ti.unitPrice * ti.quantity;

          await createSummaryItem({
            id: crypto.randomUUID(),
            summaryId,
            referenceId: ti.referenceId,
            name: ti.name,
            unit: ti.unit || '',
            quantity: ti.quantity,
            ...(isLabor && { duration }),
            unitCostAtTimeOfAdding: ti.unitPrice,
            totalCost,
            createdAt: new Date().toISOString()
          });
        }
        allImportedSummaryIds.push(summaryId);
      }
    }

    // ── Phase 4: Final Bottom-Up Cost Recomputation ──
    for (const sId of allImportedSummaryIds) {
      await recomputeSummaryCost(sId);
    }

    setImportTemplateOpen(false);
    setSelectedTemplateId('');
    refresh();
    alert('Template imported successfully.');
  };

  // ── Drag refs ──
  const draggingIdx = useRef(null);
  const draggingParentId = useRef(null);

  // ── Memoised sorted list ──
  const sortedWorks = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return works
      .filter(w => !q || w.name?.toLowerCase().includes(q) || w.description?.toLowerCase().includes(q))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [works, searchQuery]);

  const runningTotal = useMemo(
    // Running total reflects only non-excluded MAIN works (sub-schedules are rolled up into main works)
    () => sortedWorks.filter(w => !w.isExcluded && !w.parentId).reduce((s, w) => s + (w.totalCost || 0), 0),
    [sortedWorks],
  );

  // Ref keeps handleDrop's closure fresh without sortedWorks as a useCallback dep.
  const sortedWorksRef = useRef([]);
  React.useEffect(() => { sortedWorksRef.current = sortedWorks; }, [sortedWorks]);

  // Tracks the FULL unfiltered works array — used by computeWorkCodeUpdates
  // so search-filtered views don’t exclude items from reindex operations.
  const worksRef = useRef([]);
  React.useEffect(() => { worksRef.current = works; }, [works]);

  // Same ref pattern for projectCode
  const projectCodeRef = useRef('');
  React.useEffect(() => { projectCodeRef.current = project?.projectCode ?? ''; }, [project]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleCreate = useCallback(async ({ name, description }) => {
    const newId = crypto.randomUUID();
    const pCode = projectCodeRef.current;

    // Compute a temporary order so the new item lands at the bottom of its group
    const siblings = worksRef.current.filter(
      w => (w.parentId || null) === (createParentId || null)
    );
    const tempOrder = siblings.reduce((m, w) => Math.max(m, w.order ?? 0), -1) + 1;

    await createItem({
      id: newId,
      projectId,
      parentId: createParentId || null,
      name,
      description,
      workCode: '', // will be corrected by full reindex below
      totalCost: 0,
      isExcluded: false,
      order: tempOrder,
    });

    // Full reindex: include the new item in the snapshot
    const allAfter = [...worksRef.current, {
      id: newId, projectId, parentId: createParentId || null,
      order: tempOrder, workCode: '',
    }];
    const codeUpdates = computeWorkCodeUpdates(allAfter, pCode);
    if (codeUpdates.length) await Promise.all(codeUpdates.map(u => updateItem(u)));

    setCreateOpen(false);
    setCreateParentId(null);
  }, [projectId, createItem, createParentId, updateItem]);

  const handleEdit = useCallback(async ({ name, description }) => {
    if (!editingWork) return;
    await updateItem({ ...editingWork, name, description });
    setEditOpen(false);
    setEditingWork(null);
  }, [editingWork, updateItem]);

  const handleDelete = useCallback(async (id) => {
    if (!confirm('Delete this work? All cost entries will be permanently removed.')) return;

    // Collect the full subtree IDs so we exclude them from the reindex snapshot
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

    // Full reindex on the remaining items (subtree already removed from IDB)
    const allAfter = allCurrent.filter(w => !subtreeIds.has(w.id));
    const codeUpdates = computeWorkCodeUpdates(allAfter, projectCodeRef.current);
    if (codeUpdates.length) await Promise.all(codeUpdates.map(u => updateItem(u)));

    refresh();
  }, [refresh, updateItem]);

  const handleToggleExclude = useCallback(async (work) => {
    const isNowExcluded = !work.isExcluded;

    // Collect the work itself + any direct children (sub-schedules)
    const toUpdate = [work, ...worksRef.current.filter(w => w.parentId === work.id)];

    // Persist all exclusion flags atomically — awaited so IDB is settled before recompute
    await Promise.all(toUpdate.map(w => updateItem({ ...w, isExcluded: isNowExcluded })));

    // Recompute costs from ground truth — cascades to project / facility / campus
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

    // cascadeDuplicateSchedule now also clones child sub-schedules and returns them
    const { newSubSchedules } = await cascadeDuplicateSchedule({
      sourceScheduleId: work.id,
      newSchedulePayload,
    });

    // ── Step 1: Reindex work codes ─────────────────────────────────────────────
    // cascadeDuplicateSchedule fires notifyUpdate internally, which can cause
    // worksRef.current to refresh *before* we reach here (race condition).
    // Always deduplicate by ID to avoid double-entries → wrong indices → .2,.4,.6.
    if (newSubSchedules.length > 0) {
      const pCode = projectCodeRef.current;
      const newIds = new Set([newSchedulePayload.id, ...newSubSchedules.map(s => s.id)]);
      const allAfter = [
        ...worksRef.current.filter(w => !newIds.has(w.id)), // strip any already-refreshed copies
        newSchedulePayload,                                  // main schedule (correct order/workCode)
        ...newSubSchedules,                                  // sub-schedules (order inherited from source)
      ];
      const codeUpdates = computeWorkCodeUpdates(allAfter, pCode);
      if (codeUpdates.length) await Promise.all(codeUpdates.map(u => updateItem(u)));

      // ── Step 2: Re-run bottom-up cost recompute ──────────────────────────────
      // The reindex above calls updateItem({ ...sub, order, workCode }) where `sub`
      // still carries totalCost: 0 (stale from creation time). This overwrites the
      // correct costs that cascadeDuplicateSchedule's recompute had just stored.
      // Re-running bottom-up ensures costs are always the LAST write → correct totals.
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

  // ─── Drag & drop ──────────────────────────────────────────────────────────

  const handleDragStart = useCallback((id, parentId) => {
    draggingIdx.current = id;
    draggingParentId.current = parentId || null;
  }, []);

  const handleDragOver = useCallback(() => {
    // No state update — visual feedback handled in WorkRow via e.currentTarget.style
  }, []);

  const handleDrop = useCallback(async (targetId, targetParentId) => {
    const fromId = draggingIdx.current;
    const fromParentId = draggingParentId.current;
    draggingIdx.current = null;
    draggingParentId.current = null;

    if (!fromId || fromId === targetId) return;
    if (fromParentId !== (targetParentId || null)) return;

    // Build the current sibling list sorted by their saved order
    const siblings = worksRef.current
      .filter(w => (w.parentId || null) === fromParentId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const fromIndex = siblings.findIndex(w => w.id === fromId);
    const targetIndex = siblings.findIndex(w => w.id === targetId);
    if (fromIndex === -1 || targetIndex === -1) return;
    if (fromIndex === targetIndex) return; // no-op

    // Splice to get new visual order, then immediately assign contiguous 0-based orders
    // so computeWorkCodeUpdates sees the intended order, not the old saved values.
    const spliced = [...siblings];
    const [moved] = spliced.splice(fromIndex, 1);
    spliced.splice(targetIndex, 0, moved);
    const reordered = spliced.map((item, idx) => ({ ...item, order: idx }));

    // Merge reordered siblings back with the rest to build the full project snapshot
    const nonSiblings = worksRef.current.filter(w => (w.parentId || null) !== fromParentId);
    const fullSnapshot = [...nonSiblings, ...reordered];

    // Full reindex from snapshot — corrects root AND sub work codes in one pass
    const codeUpdates = computeWorkCodeUpdates(fullSnapshot, projectCodeRef.current);
    if (codeUpdates.length) await Promise.all(codeUpdates.map(u => updateItem(u)));
  }, [updateItem]);

  const handleDragEnd = useCallback(() => {
    draggingIdx.current = null;
    draggingParentId.current = null;
    // DOM style reset is done inside WorkRow's onDragEnd handler
  }, []);

  const fileInputRef = useRef(null);

  const handleExportExcel = async () => {
    alert('Excel export has been removed. Please use JSON export instead.');
  };

  const handleImportExcel = async (e) => {
    alert('Excel import has been removed. Please use JSON import instead.');
  };

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
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: 'calc(100vh - 10rem)' }}>

      {/* ── Header ── */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', flexShrink: 0 }}>
        <div>
          <button
            id="btn-back-projects"
            onClick={() => navigate('/projects')}
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
              id="input-search-works"
              type="text"
              placeholder="Search works…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.9rem', color: 'var(--foreground)' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
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

          <Button id="btn-new-work" onClick={() => { setCreateParentId(null); setCreateOpen(true); }}>
            <Plus size={18} /> New Work
          </Button>
        </div>
      </header>

      {/* ── Table ── */}
      <div style={{ flex: 1, minHeight: 0, borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <Table wrapperStyle={{ border: 'none', boxShadow: 'none', borderRadius: 0, height: '100%', overflowY: 'auto' }}>
          <TableHeader style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--background)', boxShadow: '0 1px 0 var(--border)' }}>
            <TableRow>
              <TableHead style={{ width: 100 }} />
              <TableHead>WORK NAME</TableHead>
              <TableHead>WORK SPECIFICATIONS</TableHead>
              <TableHead style={{ width: 145, textAlign: 'center' }}>WORK CODE</TableHead>
              <TableHead style={{ textAlign: 'right', width: 160 }}>TOTAL WORK COST</TableHead>
              <TableHead style={{ width: 120 }} />
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

            {sortedWorks.filter(w => !w.parentId).map((mainWork) => (
              <WorkGroup
                key={mainWork.id}
                mainWork={mainWork}
                subWorks={sortedWorks.filter(w => w.parentId === mainWork.id)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onNavigate={(id) => navigate(`/summary?scheduleId=${id}`)}
                onToggleExclude={handleToggleExclude}
                onDuplicate={handleDuplicate}
                onEdit={openEdit}
                onDelete={handleDelete}
                onCreateSub={(parentId) => {
                  setCreateParentId(parentId);
                  setCreateOpen(true);
                }}
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

      <Dialog open={defaultsOpen} onOpenChange={setDefaultsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Project Default Percentages</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={labelStyle}>Default Labor Requisition (%)</label>
                <Input
                  type="number"
                  value={defaultLabor}
                  onChange={e => setDefaultLabor(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={labelStyle}>Default Tools and Equipment (%)</label>
                <Input
                  type="number"
                  value={defaultTools}
                  onChange={e => setDefaultTools(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={labelStyle}>Default OCM (%)</label>
                <Input
                  type="number"
                  value={defaultOcm}
                  onChange={e => setDefaultOcm(e.target.value)}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button onClick={handleSaveDefaults}>Save Defaults</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importTemplateOpen} onOpenChange={setImportTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Schedule Template</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                Select a template to populate this Program of Works with predefined items and hierarchy.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={labelStyle}>Select Template</label>
                <select
                  value={selectedTemplateId}
                  onChange={e => setSelectedTemplateId(e.target.value)}
                  style={{ width: '100%', height: '2.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '0 0.75rem', fontSize: '0.875rem', background: 'var(--background)', color: 'var(--foreground)' }}
                >
                  <option value="">-- Choose a template --</option>
                  {scheduleTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button onClick={handleImportTemplate} disabled={!selectedTemplateId}>Import Structure</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
