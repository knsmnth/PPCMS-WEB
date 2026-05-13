import React, { useState, useMemo, useEffect } from 'react';
import { useCollection } from '../hooks/useData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { SelectCombo } from '../components/ui/select-combo';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogBody, DialogFooter } from '../components/ui/dialog';
import { LayoutGrid, Plus, Trash2, Search, Edit2, ChevronDown, Package, Users as UsersIcon } from 'lucide-react';

// ─── Shared Styles ────────────────────────────────────────────────────────────
const labelStyle = { fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' };
const iconBtnStyle = { background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.4rem', display: 'flex', alignItems: 'center' };

function Badge({ children }) {
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', background: 'var(--secondary)', color: 'var(--primary)', borderRadius: '1rem', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

// ─── Cost Toggle Row ──────────────────────────────────────────────────────────
function CostToggleRow({ label, checked, onCheck, value, onValue }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onCheck(e.target.checked)}
        style={{ accentColor: 'var(--primary)', width: 15, height: 15, cursor: 'pointer' }}
      />
      <span style={{ fontSize: '0.8rem', fontWeight: 600, flex: 1 }}>{label}</span>
      {checked && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Input
            type="number"
            value={value}
            onChange={e => onValue(e.target.value)}
            style={{ width: '72px', height: '2rem' }}
            placeholder="0"
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>%</span>
        </div>
      )}
    </div>
  );
}

// ─── Template Form Dialog ─────────────────────────────────────────────────────
function WorkGroupTemplateDialog({ open, onOpenChange, initial, onSubmit, title }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('material');
  const [showLabor, setShowLabor] = useState(true);
  const [showTools, setShowTools] = useState(true);
  const [showOcm, setShowOcm] = useState(true);
  const [laborPct, setLaborPct] = useState('');
  const [toolsPct, setToolsPct] = useState('');
  const [ocmPct, setOcmPct] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(initial?.name || '');
    setDescription(initial?.description || '');
    setType(initial?.type || 'material');
    setShowLabor(initial?.showLabor ?? true);
    setShowTools(initial?.showTools ?? true);
    setShowOcm(initial?.showOcm ?? true);
    setLaborPct(initial?.laborPercentage ?? '');
    setToolsPct(initial?.toolsPercentage ?? '');
    setOcmPct(initial?.ocmPercentage ?? '');
  }, [open, initial?.id]);

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      type,
      showLabor: type === 'material' ? showLabor : false,
      showTools: type !== 'bulk' ? showTools : false,
      showOcm: type !== 'bulk' ? showOcm : false,
      laborPercentage: Number(laborPct) || 0,
      toolsPercentage: Number(toolsPct) || 0,
      ocmPercentage: Number(ocmPct) || 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <DialogBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={labelStyle}>Template Name *</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Structural Works" autoFocus />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={labelStyle}>Description</label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes..." />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={labelStyle}>Group Type</label>
              <Select value={type} onChange={e => setType(e.target.value)}>
                <option value="material">Material Assets</option>
                <option value="labor">Personnel &amp; Labor</option>
                <option value="bulk">Bulk / Manual Group</option>
              </Select>
            </div>
            {type !== 'bulk' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', background: 'var(--secondary)', borderRadius: 'var(--radius)' }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', margin: 0, letterSpacing: '0.05em' }}>
                  Indirect Cost Defaults
                </p>
                {type === 'material' && (
                  <CostToggleRow label="Labor Requisition" checked={showLabor} onCheck={setShowLabor} value={laborPct} onValue={setLaborPct} />
                )}
                <CostToggleRow label="Tools &amp; Equipment" checked={showTools} onCheck={setShowTools} value={toolsPct} onValue={setToolsPct} />
                <CostToggleRow label="OCM (Overhead, Contingencies &amp; Misc.)" checked={showOcm} onCheck={setShowOcm} value={ocmPct} onValue={setOcmPct} />
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={submit} disabled={!name.trim()}>{title}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Template Items Dialog ──────────────────────────────────────────────────
function TemplateItemsDialog({ open, onOpenChange, template }) {
  const query = useMemo(
    () => (template ? [{ field: 'templateId', operator: '==', value: template.id }] : []),
    [template?.id],
  );
  const { data: items, createItem, updateItem, deleteItem } = useCollection('workGroupTemplateItems', query);
  const { data: materials } = useCollection('materials');
  const { data: labor } = useCollection('laborTypes');

  const [selectedAsset, setSelectedAsset] = useState(null);
  const [qty, setQty] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualUnit, setManualUnit] = useState('');
  const [manualPrice, setManualPrice] = useState('');

  const handleUpdateField = async (item, field, value) => {
    let val = value;
    if (field === 'quantity' || field === 'unitPrice') {
      val = Number(value);
      if (isNaN(val)) return;
    }
    await updateItem({ ...item, [field]: val });
  };

  const assets = template?.type === 'labor' ? labor : materials;
  const options = assets.map(i => ({
    value: i.id,
    label: `${i.name} ${i.itemCode ? `(${i.itemCode})` : ''} - ₱${(Number(i.currentPrice) || Number(i.currentRate) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
  }));

  const handleAddAsset = async () => {
    if (!selectedAsset || !qty || !template) return;
    await createItem({
      id: crypto.randomUUID(),
      templateId: template.id,
      referenceId: selectedAsset.id,
      name: selectedAsset.name,
      unit: selectedAsset.unit || '',
      quantity: Number(qty),
      unitPrice: Number(selectedAsset.currentPrice || selectedAsset.currentRate || 0),
    });
    setSelectedAsset(null);
    setQty('');
  };

  const handleAddManual = async () => {
    if (!manualName || !qty || !template) return;
    await createItem({
      id: crypto.randomUUID(),
      templateId: template.id,
      referenceId: null, // No reference for manual items
      name: manualName,
      unit: manualUnit,
      quantity: Number(qty),
      unitPrice: Number(manualPrice) || 0,
    });
    setManualName('');
    setManualUnit('');
    setManualPrice('');
    setQty('');
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: '680px' }}>
        <DialogHeader><DialogTitle>Template Items — {template.name}</DialogTitle></DialogHeader>
        <DialogBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', maxHeight: '300px', overflowY: 'auto' }}>
              <Table wrapperStyle={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
                <TableHeader style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--background)' }}>
                  <TableRow>
                    <TableHead>Item Details</TableHead>
                    <TableHead style={{ textAlign: 'center', width: 80 }}>Qty</TableHead>
                    <TableHead style={{ textAlign: 'center', width: 80 }}>Unit</TableHead>
                    {template.type === 'bulk' && <TableHead style={{ textAlign: 'center', width: 100 }}>Unit Price</TableHead>}
                    <TableHead style={{ textAlign: 'right', width: 50 }} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={template.type === 'bulk' ? 5 : 4} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
                        No items added to this template.
                      </TableCell>
                    </TableRow>
                  )}
                  {items.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {template.type === 'bulk' ? (
                          <input 
                            value={item.name}
                            onChange={e => handleUpdateField(item, 'name', e.target.value)}
                            style={{ width: '100%', height: '1.8rem', border: 'none', background: 'transparent', fontWeight: 600, fontSize: '0.8rem', outline: 'none' }}
                          />
                        ) : (
                          <span style={{ fontWeight: 600 }}>{item.name}</span>
                        )}
                      </TableCell>
                      <TableCell style={{ textAlign: 'center' }}>
                        <input 
                          type="number"
                          value={item.quantity}
                          onChange={e => handleUpdateField(item, 'quantity', e.target.value)}
                          style={{ width: '60px', height: '1.8rem', textAlign: 'center', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '0.8rem' }}
                        />
                      </TableCell>
                      <TableCell style={{ textAlign: 'center' }}>
                        {template.type === 'bulk' ? (
                          <input 
                            value={item.unit}
                            onChange={e => handleUpdateField(item, 'unit', e.target.value)}
                            style={{ width: '60px', height: '1.8rem', textAlign: 'center', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '0.8rem' }}
                          />
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>{item.unit}</span>
                        )}
                      </TableCell>
                      {template.type === 'bulk' && (
                        <TableCell style={{ textAlign: 'center' }}>
                          <input 
                            type="number"
                            value={item.unitPrice}
                            onChange={e => handleUpdateField(item, 'unitPrice', e.target.value)}
                            style={{ width: '90px', height: '1.8rem', textAlign: 'right', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '0.8rem', paddingRight: '0.4rem' }}
                          />
                        </TableCell>
                      )}
                      <TableCell style={{ textAlign: 'right' }}>
                        <button onClick={() => deleteItem(item.id)} style={iconBtnStyle} onMouseOver={e => e.currentTarget.style.color = 'var(--destructive)'} onMouseOut={e => e.currentTarget.style.color = '#a1a1aa'}>
                          <Trash2 size={14} />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {template.type !== 'bulk' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', background: 'var(--secondary)', borderRadius: 'var(--radius)' }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', margin: 0 }}>Add Registry Item</p>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Select {template.type === 'labor' ? 'Personnel' : 'Material'}</label>
                    <SelectCombo
                      options={options}
                      value={selectedAsset?.id || ''}
                      onChange={val => setSelectedAsset(assets.find(a => a.id === val))}
                      placeholder="Search asset..."
                    />
                  </div>
                  <div style={{ width: '80px' }}>
                    <label style={labelStyle}>Qty</label>
                    <Input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" />
                  </div>
                  <Button onClick={handleAddAsset} disabled={!selectedAsset || !qty}>
                    <Plus size={16} /> Add
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', background: 'var(--secondary)', borderRadius: 'var(--radius)' }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', margin: 0 }}>Add Manual Work Detail</p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 2, minWidth: '150px' }}>
                    <label style={labelStyle}>Item Name / Description</label>
                    <Input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="e.g. Clearing & Grubbing" />
                  </div>
                  <div style={{ width: '80px' }}>
                    <label style={labelStyle}>Unit</label>
                    <Input value={manualUnit} onChange={e => setManualUnit(e.target.value)} placeholder="sqm" />
                  </div>
                  <div style={{ width: '80px' }}>
                    <label style={labelStyle}>Qty</label>
                    <Input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="1" />
                  </div>
                  <div style={{ width: '120px' }}>
                    <label style={labelStyle}>Unit Cost</label>
                    <Input type="number" value={manualPrice} onChange={e => setManualPrice(e.target.value)} placeholder="0.00" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <Button onClick={handleAddManual} disabled={!manualName || !qty}>
                      <Plus size={16} /> Add Detail
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
export default function WorkGroupTemplatesPage() {
  const { data: templates, createItem, updateItem, deleteItem } = useCollection('workGroupTemplates');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  const handleSort = key => setSortConfig(prev => ({
    key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
  }));

  const handleCreate = async payload => {
    await createItem({ id: crypto.randomUUID(), ...payload });
    setCreateOpen(false);
  };

  const handleEdit = async payload => {
    await updateItem({ ...editing, ...payload });
    setEditOpen(false);
    setEditing(null);
  };

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return templates
      .filter(t => !q || t.name?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))
      .sort((a, b) => {
        const cmp = (a[sortConfig.key] || '').toString().localeCompare((b[sortConfig.key] || '').toString(), undefined, { sensitivity: 'base' });
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      });
  }, [templates, searchTerm, sortConfig]);

  const COLS = [
    { key: 'name', label: 'Template Name' },
    { key: 'type', label: 'Type' },
    { key: 'description', label: 'Description' },
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.03em' }}>Work Group Templates</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.925rem', marginTop: '0.25rem' }}>
            Reusable cost group presets — import them when adding work categories in Work Details.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ position: 'relative', width: '240px' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
            <Input style={{ paddingLeft: '2.25rem', height: '2.5rem' }} placeholder="Filter templates..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <Button onClick={() => setCreateOpen(true)}><Plus size={18} /> New Template</Button>
        </div>
      </header>

      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <Table wrapperStyle={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
          <TableHeader style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--background)' }}>
            <TableRow>
              {COLS.map(col => (
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
              <TableHead>Cost Components</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} style={{ textAlign: 'center', padding: '4.5rem', color: 'var(--muted-foreground)' }}>
                  <LayoutGrid size={32} style={{ opacity: 0.1, marginBottom: '1rem' }} />
                  <p>No work group templates yet. Create one to streamline Work Details entries.</p>
                </TableCell>
              </TableRow>
            )}
            {filtered.map(tpl => (
              <TableRow key={tpl.id}>
                <TableCell><span style={{ fontWeight: 700, color: 'var(--primary)' }}>{tpl.name}</span></TableCell>
                <TableCell>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem', background: 'var(--secondary)', color: 'var(--primary)', borderRadius: '1rem', textTransform: 'uppercase' }}>
                    {tpl.type}
                  </span>
                </TableCell>
                <TableCell style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>{tpl.description || '—'}</TableCell>
                <TableCell>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {tpl.type === 'material' && tpl.showLabor !== false && (
                      <Badge>Labor {tpl.laborPercentage ? `${tpl.laborPercentage}%` : '(global)'}</Badge>
                    )}
                    {tpl.type !== 'bulk' && tpl.showTools !== false && (
                      <Badge>Tools {tpl.toolsPercentage ? `${tpl.toolsPercentage}%` : '(global)'}</Badge>
                    )}
                    {tpl.type !== 'bulk' && tpl.showOcm !== false && (
                      <Badge>OCM {tpl.ocmPercentage ? `${tpl.ocmPercentage}%` : '(global)'}</Badge>
                    )}
                    {tpl.type === 'bulk' && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>No indirect costs</span>
                    )}
                  </div>
                </TableCell>
                <TableCell style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <Button variant="outline" size="sm" onClick={() => { setActiveTemplate(tpl); setItemsOpen(true); }}>
                      Manage Items
                    </Button>
                    <button onClick={() => { setEditing(tpl); setEditOpen(true); }} style={iconBtnStyle} title="Edit">
                      <Edit2 size={15} />
                    </button>
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

      <WorkGroupTemplateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        title="Create Template"
      />
      <WorkGroupTemplateDialog
        open={editOpen}
        onOpenChange={v => { setEditOpen(v); if (!v) setEditing(null); }}
        initial={editing}
        onSubmit={handleEdit}
        title="Edit Template"
      />
      <TemplateItemsDialog
        open={itemsOpen}
        onOpenChange={v => { setItemsOpen(v); if (!v) setActiveTemplate(null); }}
        template={activeTemplate}
      />
    </div>
  );
}
