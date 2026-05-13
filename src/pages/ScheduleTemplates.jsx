import React, { useState, useMemo } from 'react';
import { useCollection } from '../hooks/useData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogClose } from '../components/ui/dialog';
import { Layers, Plus, Trash2, Search, Edit2, ChevronDown, CornerDownRight, LayoutGrid } from 'lucide-react';

const labelStyle = { fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' };
const iconBtnStyle = { background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.4rem', display: 'flex', alignItems: 'center' };

// ─── Work Group Selector for Template Works ───────────────────────────────────
function WorkGroupSelector({ workTemplateId }) {
  const { data: allGroupTemplates } = useCollection('workGroupTemplates');
  const query = useMemo(() => [{ field: 'scheduleTemplateWorkId', operator: '==', value: workTemplateId }], [workTemplateId]);
  const { data: links, createItem, deleteItem } = useCollection('scheduleTemplateWorkGroups', query);

  const linkedGroups = useMemo(() => {
    return links.map(link => {
      const tpl = allGroupTemplates.find(gt => gt.id === link.workGroupTemplateId);
      return { ...link, name: tpl?.name || 'Unknown Template', type: tpl?.type };
    });
  }, [links, allGroupTemplates]);

  const availableTemplates = useMemo(() => {
    const linkedIds = new Set(links.map(l => l.workGroupTemplateId));
    return allGroupTemplates.filter(gt => !linkedIds.has(gt.id));
  }, [allGroupTemplates, links]);

  const [selectedId, setSelectedId] = useState('');

  const handleAdd = async () => {
    if (!selectedId) return;
    await createItem({
      id: crypto.randomUUID(),
      scheduleTemplateWorkId: workTemplateId,
      workGroupTemplateId: selectedId,
    });
    setSelectedId('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {linkedGroups.map(lg => (
          <div key={lg.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.15rem 0.6rem', background: 'var(--secondary)', color: 'var(--primary)', borderRadius: '1rem', fontSize: '0.72rem', fontWeight: 700 }}>
            <span>{lg.name}</span>
            <button 
              onClick={() => deleteItem(lg.id)}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, opacity: 0.6, display: 'flex' }}
              onMouseOver={e => e.currentTarget.style.opacity = 1}
              onMouseOut={e => e.currentTarget.style.opacity = 0.6}
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <select 
          value={selectedId} 
          onChange={e => setSelectedId(e.target.value)}
          style={{ flex: 1, height: '1.8rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '0 0.4rem', fontSize: '0.75rem', background: 'var(--background)' }}
        >
          <option value="">+ Add Work Group Template</option>
          {availableTemplates.map(gt => <option key={gt.id} value={gt.id}>{gt.name} ({gt.type})</option>)}
        </select>
        <button 
          onClick={handleAdd} 
          disabled={!selectedId}
          style={{ height: '1.8rem', padding: '0 0.6rem', borderRadius: 'var(--radius)', background: 'var(--primary)', color: 'white', border: 'none', fontSize: '0.75rem', cursor: 'pointer', opacity: selectedId ? 1 : 0.5 }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ─── Works Editor (inside a Dialog) ──────────────────────────────────────────
function TemplateWorksDialog({ open, onOpenChange, template }) {
  const query = useMemo(
    () => (template ? [{ field: 'templateId', operator: '==', value: template.id }] : []),
    [template?.id],
  );
  const { data: works, createItem, deleteItem } = useCollection('scheduleTemplateWorks', query);

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newParentId, setNewParentId] = useState('');

  // Build hierarchical display
  const sorted = useMemo(() => {
    const roots = works.filter(w => !w.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const result = [];
    roots.forEach(root => {
      result.push({ ...root, _level: 0 });
      works
        .filter(w => w.parentId === root.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .forEach(child => result.push({ ...child, _level: 1 }));
    });
    return result;
  }, [works]);

  const mainWorks = useMemo(
    () => works.filter(w => !w.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [works],
  );

  const handleAdd = async () => {
    if (!newName.trim() || !template) return;
    const parentId = newParentId || null;
    const siblings = works.filter(w => (w.parentId || null) === parentId);
    const maxOrder = siblings.reduce((m, w) => Math.max(m, w.order ?? 0), -1);
    await createItem({
      id: crypto.randomUUID(),
      templateId: template.id,
      parentId,
      name: newName.trim(),
      description: newDesc.trim(),
      order: maxOrder + 1,
    });
    setNewName('');
    setNewDesc('');
  };

  const handleDelete = async work => {
    const children = works.filter(w => w.parentId === work.id);
    await Promise.all(children.map(c => deleteItem(c.id)));
    await deleteItem(work.id);
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: '680px' }}>
        <DialogHeader>
          <DialogTitle>Works — {template.name}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Works list */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', maxHeight: '340px', overflowY: 'auto' }}>
              <Table wrapperStyle={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
                <TableHeader style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--background)' }}>
                  <TableRow>
                    <TableHead>Work Name & Groups</TableHead>
                    <TableHead>Specifications</TableHead>
                    <TableHead style={{ width: 60 }} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
                        No works yet. Add below.
                      </TableCell>
                    </TableRow>
                  )}
                  {sorted.map(work => (
                    <TableRow key={work.id} style={{ backgroundColor: work._level > 0 ? '#fcfcfc' : 'white' }}>
                      <TableCell style={{ paddingLeft: work._level > 0 ? '2.25rem' : '1rem', verticalAlign: 'top', paddingTop: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {work._level > 0 && <CornerDownRight size={13} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />}
                            <span style={{ fontWeight: work._level === 0 ? 700 : 600, color: work._level === 0 ? 'var(--primary)' : 'var(--foreground)' }}>
                              {work.name}
                            </span>
                          </div>
                          <WorkGroupSelector workTemplateId={work.id} />
                        </div>
                      </TableCell>
                      <TableCell style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)', verticalAlign: 'top', paddingTop: '1.25rem' }}>
                        {work.description || '—'}
                      </TableCell>
                      <TableCell style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => handleDelete(work)}
                          style={iconBtnStyle}
                          onMouseOver={e => e.currentTarget.style.color = 'var(--destructive)'}
                          onMouseOut={e => e.currentTarget.style.color = '#a1a1aa'}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Add form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', background: 'var(--secondary)', borderRadius: 'var(--radius)' }}>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', margin: 0, letterSpacing: '0.05em' }}>
                Add Work to Template
              </p>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Work name *" onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ flex: 2 }} />
                <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Specifications (optional)" style={{ flex: 2 }} />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <select
                  value={newParentId}
                  onChange={e => setNewParentId(e.target.value)}
                  style={{ flex: 1, height: '2.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '0 0.75rem', fontSize: '0.875rem', background: 'var(--background)', color: 'var(--foreground)' }}
                >
                  <option value="">Main Work (no parent)</option>
                  {mainWorks.map(w => <option key={w.id} value={w.id}>↳ Sub of: {w.name}</option>)}
                </select>
                <Button onClick={handleAdd} disabled={!newName.trim()}>
                  <Plus size={16} /> Add
                </Button>
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ScheduleTemplatesPage() {
  const { data: templates, createItem, updateItem, deleteItem } = useCollection('scheduleTemplates');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [worksOpen, setWorksOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');

  const openCreate = () => { setFormName(''); setFormDesc(''); setCreateOpen(true); };
  const openEdit = tpl => { setEditing(tpl); setFormName(tpl.name); setFormDesc(tpl.description || ''); setEditOpen(true); };

  const handleCreate = async () => {
    if (!formName.trim()) return;
    await createItem({ id: crypto.randomUUID(), name: formName.trim(), description: formDesc.trim() });
    setCreateOpen(false);
  };

  const handleEdit = async () => {
    if (!formName.trim() || !editing) return;
    await updateItem({ ...editing, name: formName.trim(), description: formDesc.trim() });
    setEditOpen(false);
    setEditing(null);
  };

  const handleSort = key => setSortConfig(prev => ({
    key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
  }));

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return templates
      .filter(t => !q || t.name?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))
      .sort((a, b) => {
        const cmp = (a[sortConfig.key] || '').toString().localeCompare((b[sortConfig.key] || '').toString(), undefined, { sensitivity: 'base' });
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      });
  }, [templates, searchTerm, sortConfig]);

  const TemplateFormDialog = ({ open, onOpenChange, onConfirm, title }) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <DialogBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={labelStyle}>Template Name *</label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Building Renovation Works" autoFocus />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={labelStyle}>Description</label>
              <Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Optional notes..." />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onConfirm} disabled={!formName.trim()}>{title}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.03em' }}>Schedule Templates</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.925rem', marginTop: '0.25rem' }}>
            Reusable work structures — import them to quickly populate a Program of Works.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ position: 'relative', width: '240px' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
            <Input style={{ paddingLeft: '2.25rem', height: '2.5rem' }} placeholder="Filter templates..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <Button onClick={openCreate}><Plus size={18} /> New Template</Button>
        </div>
      </header>

      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <Table wrapperStyle={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
          <TableHeader style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--background)' }}>
            <TableRow>
              {[{ key: 'name', label: 'Template Name' }, { key: 'description', label: 'Description' }].map(col => (
                <TableHead key={col.key} onClick={() => handleSort(col.key)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {col.label}
                    <ChevronDown size={14} style={{
                      transform: sortConfig.key === col.key && sortConfig.direction === 'asc' ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s',
                      color: sortConfig.key === col.key ? '#000' : '#888',
                      opacity: sortConfig.key === col.key ? 1 : 0.4,
                    }} />
                  </div>
                </TableHead>
              ))}
              <TableHead style={{ textAlign: 'right' }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} style={{ textAlign: 'center', padding: '4.5rem', color: 'var(--muted-foreground)' }}>
                  <Layers size={32} style={{ opacity: 0.1, marginBottom: '1rem' }} />
                  <p>No schedule templates yet. Create one to speed up project setup.</p>
                </TableCell>
              </TableRow>
            )}
            {filtered.map(tpl => (
              <TableRow key={tpl.id}>
                <TableCell><span style={{ fontWeight: 700, color: 'var(--primary)' }}>{tpl.name}</span></TableCell>
                <TableCell style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>{tpl.description || '—'}</TableCell>
                <TableCell style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setActiveTemplate(tpl); setWorksOpen(true); }}
                    >
                      Manage Works
                    </Button>
                    <button onClick={() => openEdit(tpl)} style={iconBtnStyle} title="Edit"><Edit2 size={15} /></button>
                    <button
                      onClick={() => deleteItem(tpl.id)}
                      style={iconBtnStyle}
                      onMouseOver={e => e.currentTarget.style.color = 'var(--destructive)'}
                      onMouseOut={e => e.currentTarget.style.color = '#a1a1aa'}
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TemplateFormDialog open={createOpen} onOpenChange={setCreateOpen} onConfirm={handleCreate} title="Create Template" />
      <TemplateFormDialog
        open={editOpen}
        onOpenChange={v => { setEditOpen(v); if (!v) setEditing(null); }}
        onConfirm={handleEdit}
        title="Edit Template"
      />
      <TemplateWorksDialog
        open={worksOpen}
        onOpenChange={v => { setWorksOpen(v); if (!v) setActiveTemplate(null); }}
        template={activeTemplate}
      />
    </div>
  );
}
