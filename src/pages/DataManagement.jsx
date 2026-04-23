import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  HardDriveDownload, HardDriveUpload, Trash2, Download, Upload,
  RefreshCw, AlertTriangle, CheckCircle2, XCircle, Loader2, Database,
  ChevronDown, ChevronUp, CheckSquare, Square,
} from 'lucide-react';
import styles from '../components/layout/layout.module.css';
import {
  exportAllData, importAllData, importMissingData, previewImport,
  uploadToFirestore, downloadFromFirestore, deleteAllData, SCOPE_OPTIONS,
} from '../lib/dataManager';
import { getAllFromDB } from '../lib/db';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

function ProgressBar({ progress }) {
  if (!progress) return null;
  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--muted-foreground)', marginBottom: '0.3rem' }}>
        <span>{progress.phase}{progress.storeName ? ` — ${progress.storeName}` : ''}</span>
        <span>{progress.pct}%</span>
      </div>
      <div style={{ height: '6px', borderRadius: '9999px', background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: '9999px', background: 'var(--primary)', width: `${progress.pct}%`, transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  if (!status) return null;
  const map = {
    success: { icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.07)', border: 'rgba(22,163,74,0.25)' },
    error: { icon: XCircle, color: '#dc2626', bg: 'rgba(220,38,38,0.07)', border: 'rgba(220,38,38,0.25)' },
    running: { icon: Loader2, color: 'var(--primary)', bg: 'rgba(0,0,0,0.03)', border: 'var(--border)', spin: true },
  };
  const cfg = map[status.type];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.75rem', padding: '0.6rem 0.9rem', borderRadius: '8px', background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <Icon size={15} color={cfg.color} style={{ flexShrink: 0, ...(cfg.spin ? { animation: 'spin 1s linear infinite' } : {}) }} />
      <span style={{ fontSize: '0.82rem', color: cfg.color }}>{status.message}</span>
    </div>
  );
}

// ─── ConfirmDialog — uses the same Radix Dialog as the rest of the app ─────────

function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, requireText, accentColor = '#dc2626', onConfirm, children }) {
  const [input, setInput] = useState('');

  // Reset input each time the dialog opens
  useEffect(() => { if (open) setInput(''); }, [open]);

  const canConfirm = input.trim() === requireText;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: '480px' }}>
        <DialogHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{ padding: '0.45rem', borderRadius: '8px', background: `${accentColor}18`, flexShrink: 0 }}>
              <AlertTriangle size={18} color={accentColor} />
            </div>
            <DialogTitle>{title}</DialogTitle>
          </div>
        </DialogHeader>

        <DialogBody>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', lineHeight: 1.65, margin: 0 }}>
            {description}
          </p>
          {children && <div>{children}</div>}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)', display: 'block', marginBottom: '0.45rem' }}>
              Type{' '}
              <span style={{ fontFamily: 'monospace', fontWeight: 800, color: accentColor, background: `${accentColor}12`, padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                {requireText}
              </span>{' '}to confirm:
            </label>
            <Input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
              spellCheck={false}
              autoComplete="off"
              placeholder={`Type ${requireText} here…`}
              style={{
                fontFamily: 'monospace',
                borderColor: input.length > 0
                  ? (canConfirm ? '#16a34a' : accentColor + '80')
                  : undefined,
              }}
            />
            {input.length > 0 && !canConfirm && (
              <p style={{ fontSize: '0.75rem', color: accentColor, marginTop: '0.3rem' }}>✕ Doesn't match — check spelling and casing.</p>
            )}
            {canConfirm && (
              <p style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '0.3rem' }}>✓ Confirmed</p>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{ background: canConfirm ? accentColor : undefined, opacity: canConfirm ? 1 : 0.5 }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ icon: Icon, iconBg, title, subtitle, tag, children, status, progress }) {
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: '16px', padding: '1.75rem', background: 'var(--card)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ padding: '0.7rem', borderRadius: '12px', background: iconBg, flexShrink: 0 }}>
            <Icon size={22} color="white" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>{title}</h3>
              {tag && (
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.55rem', borderRadius: '999px', background: tag === 'DESTRUCTIVE' ? 'rgba(220,38,38,0.12)' : 'rgba(0,0,0,0.07)', color: tag === 'DESTRUCTIVE' ? '#dc2626' : 'var(--muted-foreground)', letterSpacing: '0.05em' }}>
                  {tag}
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', margin: '0.25rem 0 0 0', lineHeight: 1.55 }}>{subtitle}</p>
          </div>
        </div>
        {children}
        <ProgressBar progress={progress} />
        <StatusBadge status={status} />
      </div>
    );
  }

// ─── Scope Picker ─────────────────────────────────────────────────────────────

const STORE_MAP = { campus: 'campuses', facility: 'facilities', project: 'projects' };
  const ENTITY_LABEL = { campuses: 'campus', facilities: 'facility', projects: 'project' };

  function ScopePicker({ scope, setScope, selectedIds, setSelectedIds }) {
    const [entities, setEntities] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

    // Load entities whenever scope changes to a non-'all' value
    useEffect(() => {
      if (scope === 'all') { setEntities([]); setSelectedIds(new Set()); return; }
      setLoading(true);
      setOpen(true);
      getAllFromDB(STORE_MAP[scope]).then((items) => {
        setEntities(items);
        setSelectedIds(new Set(items.map((i) => i.id)));
        setLoading(false);
      });
    }, [scope]);

    const toggleId = (id) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    };

    const selectAll = () => setSelectedIds(new Set(entities.map((e) => e.id)));
    const clearAll = () => setSelectedIds(new Set());

    const getEntityName = (entity, scope) => {
      return entity.name || entity.facilityName || entity.projectName || entity.id;
    };

    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', background: 'var(--card)', marginBottom: '0' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ padding: '0.7rem', borderRadius: '12px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', flexShrink: 0 }}>
            <Database size={22} color="white" />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Backup Scope</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', margin: '0.2rem 0 0 0' }}>
              Choose which data to include in Export, Upload, and Download operations.
            </p>
          </div>
        </div>

        {/* Scope buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.6rem' }}>
          {SCOPE_OPTIONS.map((opt) => {
            const active = scope === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setScope(opt.value)}
                style={{
                  padding: '0.6rem 0.85rem', borderRadius: '10px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                  border: active ? '2px solid #6366f1' : '1.5px solid var(--border)',
                  background: active ? 'rgba(99,102,241,0.08)' : 'var(--background)',
                }}
              >
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: active ? '#6366f1' : 'var(--foreground)' }}>{opt.label}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginTop: '0.2rem', lineHeight: 1.4 }}>{opt.description}</div>
              </button>
            );
          })}
        </div>

        {/* Entity selector (not shown for 'all') */}
        {scope !== 'all' && (
          <div style={{ marginTop: '1rem' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none', marginBottom: open ? '0.75rem' : 0 }}
              onClick={() => setOpen((v) => !v)}
            >
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {loading ? 'Loading…' : `Select ${scope}s (${selectedIds.size} / ${entities.length} selected)`}
              </span>
              {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </div>

            {open && (
              <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                {/* Select All / Clear */}
                <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)', background: 'var(--background)' }}>
                  <button onClick={selectAll} style={{ fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: 'transparent', color: '#6366f1', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>Select All</button>
                  <button onClick={clearAll} style={{ fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: 'transparent', color: 'var(--muted-foreground)', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>Clear</button>
                </div>

                {/* Entity list */}
                <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                  {loading && (
                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
                      <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', display: 'inline-block', marginRight: '0.4rem' }} />Loading…
                    </div>
                  )}
                  {!loading && entities.length === 0 && (
                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
                      No {scope}s found in local storage.
                    </div>
                  )}
                  {!loading && entities.map((entity) => {
                    const checked = selectedIds.has(entity.id);
                    return (
                      <label
                        key={entity.id}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.6rem 0.85rem', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: checked ? 'rgba(99,102,241,0.04)' : 'transparent', transition: 'background 0.12s' }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleId(entity.id)}
                          style={{ display: 'none' }}
                        />
                        {checked
                          ? <CheckSquare size={16} color="#6366f1" style={{ flexShrink: 0 }} />
                          : <Square size={16} color="var(--muted-foreground)" style={{ flexShrink: 0 }} />
                        }
                        <span style={{ fontSize: '0.87rem', fontWeight: checked ? 600 : 400, color: 'var(--foreground)' }}>
                          {getEntityName(entity, scope)}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>
                          {entity.id?.slice(0, 8)}…
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── Import preview badge ─────────────────────────────────────────────────────

  function ImportPreviewBadge({ preview }) {
    if (!preview) return null;
    return (
      <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '0.84rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.35rem', color: 'var(--foreground)' }}>
          📦 {preview.total.toLocaleString()} records in backup
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ color: '#16a34a', fontWeight: 600 }}>✚ {preview.newCount.toLocaleString()} new (will be added)</span>
          <span style={{ color: 'var(--muted-foreground)' }}>⊘ {preview.existingCount.toLocaleString()} already exist (will be skipped)</span>
        </div>
      </div>
    );
  }

  // ─── Main Page ────────────────────────────────────────────────────────────────

  export default function DataManagement() {
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState({});
    const [statuses, setStatuses] = useState({});
    const [confirm, setConfirm] = useState(null);
    const importRef = useRef(null);

    // Scope state — shared across Export, Upload, Download
    const [scope, setScope] = useState('all');
    const [selectedIds, setSelectedIds] = useState(new Set());

    // Import mode
    const [importMode, setImportMode] = useState('replace'); // 'replace' | 'addMissing'
    const [importPreview, setImportPreview] = useState(null);

    const setStatus = (key, type, message) =>
      setStatuses((prev) => ({ ...prev, [key]: { type, message } }));

    const setProgressFor = (key, val) =>
      setProgress((prev) => ({ ...prev, [key]: val }));

    const run = useCallback(async (key, fn) => {
      setBusy(true);
      setStatus(key, 'running', 'Operation in progress…');
      setProgressFor(key, null);
      try {
        const result = await fn((p) => setProgressFor(key, p));
        const msg = typeof result === 'number'
          ? `Done — ${result.toLocaleString()} record(s) processed.`
          : 'Completed successfully.';
        setStatus(key, 'success', msg);
      } catch (err) {
        console.error(`[DataManager:${key}]`, err);
        setStatus(key, 'error', err?.message || 'Unexpected error — check console.');
      } finally {
        setBusy(false);
        window.dispatchEvent(new CustomEvent('localDataUpdated'));
      }
    }, []);

    // ── Handlers ────────────────────────────────────────────────────────────────

    const handleExport = () => setConfirm({
      key: 'export',
      title: 'Export Backup',
      description: `Download a JSON snapshot of the selected scope (${SCOPE_OPTIONS.find(o => o.value === scope)?.label}). Sensitive project data will be included.`,
      confirmLabel: 'Export',
      requireText: 'EXPORT',
      accentColor: '#2563eb',
      action: async () => {
        setStatus('export', 'running', 'Building backup file…');
        try {
          const ids = Array.from(selectedIds);
          const { blob, filename } = await exportAllData(scope, ids, (p) => setProgressFor('export', p));
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = filename; a.click();
          URL.revokeObjectURL(url);
          setStatus('export', 'success', `Downloaded as "${filename}".`);
        } catch (err) {
          setStatus('export', 'error', err?.message || 'Export failed.');
        }
      },
    });

    const handleImport = () => {
      setImportPreview(null);
      setConfirm({
        key: 'import',
        title: importMode === 'replace' ? 'Import — Replace All' : 'Import — Add Missing Only',
        description: importMode === 'replace'
          ? 'REPLACES all current local data with the contents of your backup file. Firestore is not affected. This cannot be undone.'
          : 'Reads your backup file and adds only records that do not already exist locally. Existing data is left untouched.',
        confirmLabel: 'Choose File & Import',
        requireText: 'IMPORT',
        accentColor: '#7c3aed',
        action: () => importRef.current?.click(),
      });
    };

    const handleImportFile = async (e) => {
      const file = e.target.files?.[0];
      if (!file || busy) return;
      e.target.value = '';
      const text = await file.text();

      if (importMode === 'addMissing') {
        // Show preview first, then ask again — no, just process and report result
        setImportPreview(null);
        setStatus('import', 'running', 'Analysing backup…');
        try {
          const preview = await previewImport(text);
          setImportPreview(preview);
          // Now actually import missing
          run('import', (onProgress) => importMissingData(text, onProgress));
        } catch (err) {
          setStatus('import', 'error', err?.message || 'Import failed.');
        }
      } else {
        run('import', (onProgress) => importAllData(text, onProgress));
      }
    };

    const handleUpload = () => setConfirm({
      key: 'upload',
      title: 'Upload to Firestore',
      description: `Pushes ${scope === 'all' ? 'all' : 'selected'} local records (${SCOPE_OPTIONS.find(o => o.value === scope)?.label}) to Firestore. Documents with matching IDs are merged. Local data is kept intact.`,
      confirmLabel: 'Upload',
      requireText: 'UPLOAD',
      accentColor: '#059669',
      action: () => run('upload', (onProgress) => uploadToFirestore(onProgress, scope, Array.from(selectedIds))),
    });

    const handleDownload = () => setConfirm({
      key: 'download',
      title: 'Download from Firestore',
      description: `Pulls ${scope === 'all' ? 'all' : 'selected'} Firestore documents (${SCOPE_OPTIONS.find(o => o.value === scope)?.label}) into local IndexedDB. Merges with existing local data.`,
      confirmLabel: 'Download',
      requireText: 'DOWNLOAD',
      accentColor: '#0891b2',
      action: () => run('download', (onProgress) => downloadFromFirestore(onProgress, scope, Array.from(selectedIds))),
    });

    const handleDeleteAll = () => setConfirm({
      key: 'deleteAll',
      title: 'Delete All Data',
      description: 'Permanently deletes every document from ALL Firestore collections AND wipes your local IndexedDB cache. Both layers are erased. This CANNOT be undone — export a backup first.',
      confirmLabel: 'Delete Everything',
      requireText: 'DELETE',
      accentColor: '#dc2626',
      action: () => run('deleteAll', deleteAllData),
    });

    // ── Shared button helper ───────────────────────────────────────────────────

    const btn = (color, outline = false) => ({
      display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.6rem 1.35rem', borderRadius: '10px', fontWeight: 700,
      fontSize: '0.875rem', cursor: busy ? 'not-allowed' : 'pointer',
      opacity: busy ? 0.5 : 1, transition: 'all 0.15s',
      border: outline ? `1.5px solid ${color}` : 'none',
      background: outline ? 'transparent' : color,
      color: outline ? color : 'white',
    });

    const scopeLabel = SCOPE_OPTIONS.find(o => o.value === scope)?.label ?? 'Everything';
    const hasSelection = scope === 'all' || selectedIds.size > 0;

    return (
      <div className={styles.container} style={{ maxWidth: '820px', margin: '0 auto', animation: 'fadeIn 0.35s ease-out' }}>
        <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dialogIn { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ padding: '0.75rem', background: 'var(--primary)', borderRadius: '12px', color: 'white', display: 'flex' }}>
            <Database size={26} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.9rem', fontWeight: 700, margin: 0 }}>Data Management</h1>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '0.95rem', margin: '0.2rem 0 0 0' }}>
              Backup, restore, and synchronise application data between local storage and Firestore.
            </p>
          </div>
        </div>

        {/* Info banner */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '1rem 1.25rem', borderRadius: '12px', background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.28)', marginBottom: '2rem' }}>
          <AlertTriangle size={16} color="#ca8a04" style={{ flexShrink: 0, marginTop: '2px' }} />
          <p style={{ fontSize: '0.85rem', color: 'var(--foreground)', margin: 0, lineHeight: 1.6 }}>
            Upload and Download use chunked writes (≤450 ops/batch) and paginated reads (500 docs/page) to stay within Firebase free-tier limits.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* ══ SCOPE PICKER ══ */}
          <ScopePicker
            scope={scope} setScope={setScope}
            selectedIds={selectedIds} setSelectedIds={setSelectedIds}
          />

          {/* Current scope badge */}
          {!hasSelection && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1rem', borderRadius: '10px', background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', fontSize: '0.84rem', color: '#dc2626' }}>
              <AlertTriangle size={14} />
              No {scope}s selected — select at least one to proceed.
            </div>
          )}

          {/* ══ LOCAL BACKUPS ══ */}
          <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-foreground)', margin: 0 }}>
            Local Backups
          </p>

          {/* Export */}
          <Section
            icon={Download} iconBg="#2563eb"
            title="Export Backup"
            subtitle={`Download a scoped JSON snapshot of local IndexedDB data. Currently: ${scopeLabel}.`}
            status={statuses.export} progress={progress.export}
          >
            <button style={btn('#2563eb', true)} disabled={busy || !hasSelection} onClick={handleExport}>
              <Download size={15} /> Export JSON
            </button>
          </Section>

          {/* Import */}
          <Section
            icon={Upload} iconBg="#7c3aed"
            title="Import Backup"
            subtitle="Restore local data from a previously exported .json file. Does not affect Firestore."
            tag="DESTRUCTIVE"
            status={statuses.import} progress={progress.import}
          >
            {/* Import mode toggle */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', padding: '0.4rem', borderRadius: '10px', background: 'var(--background)', border: '1px solid var(--border)', width: 'fit-content' }}>
              {[
                { value: 'replace', label: '↺ Replace All', title: 'Wipe local data and restore from backup' },
                { value: 'addMissing', label: '✚ Add Missing Only', title: 'Only import records not already in the database' },
              ].map((mode) => (
                <button
                  key={mode.value}
                  title={mode.title}
                  onClick={() => setImportMode(mode.value)}
                  style={{
                    padding: '0.4rem 0.9rem', borderRadius: '7px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                    background: importMode === mode.value ? '#7c3aed' : 'transparent',
                    color: importMode === mode.value ? 'white' : 'var(--muted-foreground)',
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)', margin: '0 0 0.85rem 0' }}>
              {importMode === 'replace'
                ? 'All current local data will be wiped and replaced with the backup contents.'
                : 'Only records not already present locally will be added. Existing data is untouched.'}
            </p>

            {importPreview && <ImportPreviewBadge preview={importPreview} />}

            <input ref={importRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleImportFile} />
            <button style={{ ...btn('#7c3aed', true), marginTop: importPreview ? '0.75rem' : 0 }} disabled={busy} onClick={handleImport}>
              <Upload size={15} /> Import JSON
            </button>
          </Section>

          {/* ══ FIRESTORE SYNC ══ */}
          <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-foreground)', margin: '0.75rem 0 0 0' }}>
            Firebase + Local Sync
          </p>

          {/* Upload */}
          <Section
            icon={HardDriveUpload} iconBg="#059669"
            title="Upload to Firestore"
            subtitle={`Pushes scoped local records (${scopeLabel}) to Firestore using chunked batches. Merges with existing Firestore data.`}
            status={statuses.upload} progress={progress.upload}
          >
            <button style={btn('#059669')} disabled={busy || !hasSelection} onClick={handleUpload}>
              {statuses.upload?.type === 'running'
                ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Uploading…</>
                : <><HardDriveUpload size={15} /> Upload</>}
            </button>
          </Section>

          {/* Download */}
          <Section
            icon={HardDriveDownload} iconBg="#0891b2"
            title="Download from Firestore"
            subtitle={`Pulls scoped Firestore documents (${scopeLabel}) into local IndexedDB using paginated queries. Merges with existing data.`}
            status={statuses.download} progress={progress.download}
          >
            <button style={btn('#0891b2')} disabled={busy || !hasSelection} onClick={handleDownload}>
              {statuses.download?.type === 'running'
                ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Downloading…</>
                : <><RefreshCw size={15} /> Download</>}
            </button>
          </Section>

          {/* Delete All */}
          <Section
            icon={Trash2} iconBg="#dc2626"
            title="Delete All Data"
            subtitle="Permanently deletes every document from all Firestore collections AND clears local IndexedDB. Both layers are wiped. Irreversible — export a backup first."
            tag="DESTRUCTIVE"
            status={statuses.deleteAll} progress={progress.deleteAll}
          >
            <button style={btn('#dc2626')} disabled={busy} onClick={handleDeleteAll}>
              {statuses.deleteAll?.type === 'running'
                ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Deleting…</>
                : <><Trash2 size={15} /> Delete All Data</>}
            </button>
          </Section>

        </div>

        {/* Confirm dialog — always mounted so Radix can animate out */}
        <ConfirmDialog
          open={!!confirm}
          onOpenChange={(open) => { if (!open) setConfirm(null); }}
          title={confirm?.title ?? ''}
          description={confirm?.description ?? ''}
          confirmLabel={confirm?.confirmLabel ?? 'Confirm'}
          requireText={confirm?.requireText ?? ''}
          accentColor={confirm?.accentColor}
          onConfirm={() => { confirm?.action(); setConfirm(null); }}
        >
          {confirm?.key === 'import' && importMode === 'addMissing' && (
            <div style={{ padding: '0.7rem 0.9rem', borderRadius: '8px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '0.82rem', color: 'var(--foreground)' }}>
              ✚ <strong>Add Missing Only</strong> mode — existing records will not be overwritten.
            </div>
          )}
        </ConfirmDialog>
      </div>
    );
  }
