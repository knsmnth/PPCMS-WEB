import React, { useState, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useCollection } from '../hooks/useData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogBody, DialogFooter } from '../components/ui/dialog';
import { cascadeCostUpdate } from '../lib/billing';
import { cascadeDelete } from '../lib/cascade';
import { SelectCombo } from '../components/ui/select-combo';
import { Select } from '../components/ui/select';
import { 
  Plus, 
  Trash2, 
  Package, 
  Wrench, 
  Users, 
  Calculator, 
  ChevronRight, 
  ArrowLeft,
  Search,
  LayoutGrid,
  Edit2
} from 'lucide-react';

export default function SummaryWorkspace() {
  const [searchParams] = useSearchParams();
  const scheduleId = searchParams.get('scheduleId');
  const query = scheduleId ? [{ field: 'scheduleOfWorkId', operator: '==', value: scheduleId }] : [];
  
  const { data: summaries, createItem: createSummary, updateItem: updateSummary, refresh: refreshSummaries } = useCollection('scheduleSummaries', query);
  const { data: items, createItem: createSummaryItem, updateItem: updateSummaryItem, deleteItem: deleteSummaryItem } = useCollection('summaryItems');
  
  const { data: materials } = useCollection('materials');
  const { data: labor } = useCollection('laborTypes');
  
  const { data: allSchedules } = useCollection('schedulesOfWork');
  const scheduleContext = allSchedules.find(s => s.id === scheduleId);
  const { data: projects } = useCollection('projects');
  const projectContext = scheduleContext ? projects.find(p => p.id === scheduleContext.projectId) : null;
  const { data: facilities } = useCollection('facilities');
  const facilityContext = projectContext ? facilities.find(f => f.id === projectContext.facilityId) : null;
  
  const navigate = useNavigate();
  const [summaryName, setSummaryName] = useState('');
  const [summaryType, setSummaryType] = useState('material');

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSummary, setEditingSummary] = useState(null);
  const [editSummaryName, setEditSummaryName] = useState('');
  const [editSummaryType, setEditSummaryType] = useState('material');
  
  const handleCreateSummary = async () => {
    if (!summaryName || !scheduleId) return;
    const id = crypto.randomUUID();
    await createSummary({ id, scheduleOfWorkId: scheduleId, name: summaryName, type: summaryType, totalCost: 0 });
    setSummaryName('');
  };

  const handleEditSummary = async () => {
    if (!editSummaryName || !editingSummary) return;
    await updateSummary({
      ...editingSummary,
      name: editSummaryName,
      type: editSummaryType
    });
    setEditDialogOpen(false);
    setEditingSummary(null);
  };

  const handleDeleteSummary = async (summary) => {
    if (confirm(`Are you sure you want to delete the "${summary.name}" cost group? All underlying items will be deleted.`)) {
      if (summary.totalCost > 0) {
        await cascadeCostUpdate(-summary.totalCost, summary.id);
      }
      await cascadeDelete('summary', summary.id);
      refreshSummaries();
    }
  };

  const MasterDataSelector = ({ type, onSelect, selectedId }) => {
    const list = type === 'material' ? materials : labor;
    const options = list.map(i => ({
      value: i.id,
      label: `${i.name} - ₱${(Number(i.currentPrice) || Number(i.currentRate) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    }));

    return (
      <div style={{ flex: 1, minWidth: '300px' }}>
        <SelectCombo 
          options={options}
          value={selectedId}
          onChange={(val) => {
            onSelect(list.find(i => i.id === val) || null);
          }}
          placeholder="Search and attach specification..."
        />
      </div>
    );
  };

  const getIcon = (type) => {
    switch (type) {
      case 'material': return <Package size={16} />;

      case 'labor': return <Users size={16} />;
      default: return <Calculator size={16} />;
    }
  };

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (!scheduleId) {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem', color: 'var(--muted-foreground)' }}>
        <Calculator size={48} style={{ opacity: 0.2 }} />
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}>Context Required</h2>
        <p>Please select a specific Program of Works to view its financial Work Details.</p>
        <Button onClick={() => navigate('/schedules')} variant="outline" style={{ marginTop: '1rem' }}>
          Return to Program of Works
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <button 
            onClick={() => navigate(`/schedules${scheduleContext ? `?projectId=${scheduleContext.projectId}` : ''}`)}
            style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '0.5rem', fontWeight: 600 }}
          >
            <ArrowLeft size={14} /> Back to Program of Works
          </button>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.03em' }}>
            Schedule of Works
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
            {facilityContext && (
              <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.6rem', backgroundColor: 'var(--secondary)', color: 'var(--primary)', borderRadius: '1rem', textTransform: 'uppercase' }}>
                {facilityContext.name}
              </span>
            )}
            {projectContext && (
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#3f3f46' }}>
                {projectContext.name}
              </span>
            )}
            {scheduleContext && (
              <>
                <span style={{ color: 'var(--muted-foreground)' }}>•</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--muted-foreground)' }}>
                  {scheduleContext.name}
                </span>
              </>
            )}
          </div>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus size={18} />
              Add New Work
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Categorize New Work</DialogTitle></DialogHeader>
            <DialogBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Group Classification</label>
                <Select 
                  value={summaryType} 
                  onChange={(e) => setSummaryType(e.target.value)}
                >
                  <option value="material">Material Assets</option>
                  <option value="labor">Personnel & Labor</option>
                </Select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Category Title</label>
                <Input placeholder="e.g. Site Groundworks" value={summaryName} onChange={(e) => setSummaryName(e.target.value)} />
              </div>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild><Button onClick={handleCreateSummary} disabled={!scheduleId}>Initialize Category</Button></DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {summaries.length === 0 && (
        <div style={{ textAlign: 'center', padding: '6rem', backgroundColor: '#fff', borderRadius: 'var(--radius)', border: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--muted-foreground)' }}>
          <LayoutGrid size={48} style={{ opacity: 0.1, marginBottom: '1.5rem' }} />
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--primary)' }}>No Work Defined</h3>
          <p style={{ maxWidth: '400px', margin: '0.5rem auto 1.5rem auto' }}>Cost groups allow you to organize materials and labor into logical project buckets.</p>
          <Button variant="outline" onClick={() => setIsDialogOpen(true)}>Create your first work group</Button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
      {summaries.map(summary => {
        const groupItems = items.filter(i => i.summaryId === summary.id);
        
        return (
          <div key={summary.id} className="animate-fade-in" style={{ backgroundColor: 'var(--background)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '2px solid var(--border)', backgroundColor: '#fafafa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.625rem', backgroundColor: 'var(--secondary)', borderRadius: '0.5rem', color: 'var(--primary)' }}>
                  {getIcon(summary.type)}
                </div>
                <div>
                  <h3 style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em', color: 'var(--primary)' }}>{summary.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {summary.type} REQUISITION
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '1rem', borderRight: '1px solid var(--border)', paddingRight: '1rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <input 
                      type="checkbox" 
                      checked={!!summary.isExcluded} 
                      onChange={async () => {
                        await updateSummary({ ...summary, isExcluded: !summary.isExcluded });
                        await cascadeCostUpdate(0, summary.id);
                      }} 
                    />
                    EXCLUDE GROUP
                  </label>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '0.1rem' }}>TOTAL WORK COST</div>
                  <div style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--primary)', letterSpacing: '-0.03em' }}>
                    ₱{(summary.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', borderLeft: '1px solid var(--border)', paddingLeft: '1rem' }}>
                  <button 
                    onClick={() => {
                      setEditingSummary(summary);
                      setEditSummaryName(summary.name);
                      setEditSummaryType(summary.type);
                      setEditDialogOpen(true);
                    }}
                    style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.2rem' }}
                    title="Edit Category Name"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    onClick={() => handleDeleteSummary(summary)}
                    style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.2rem' }}
                    onMouseOver={(e) => e.currentTarget.style.color = 'var(--destructive)'}
                    onMouseOut={(e) => e.currentTarget.style.color = '#a1a1aa'}
                    title="Delete Category entirely"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
            
            <VirtualizedSummaryTable 
              summary={summary} 
              groupItems={groupItems} 
              deleteSummaryItem={deleteSummaryItem} 
              createSummaryItem={createSummaryItem}
              updateSummaryItem={updateSummaryItem}
              updateSummary={updateSummary}
              cascadeCostUpdate={cascadeCostUpdate}
              MasterDataSelector={MasterDataSelector}
            />
          </div>
        );
      })}
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Work Component</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Group Classification</label>
              <Select 
                value={editSummaryType} 
                onChange={(e) => setEditSummaryType(e.target.value)}
              >
                <option value="material">Material Assets</option>
                <option value="labor">Personnel & Labor</option>
              </Select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Category Title</label>
              <Input placeholder="e.g. Site Groundworks" value={editSummaryName} onChange={(e) => setEditSummaryName(e.target.value)} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button onClick={handleEditSummary}>Confirm Edits</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddItemForm({ summary, onAdd, MasterDataSelector }) {
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState('');
  const [duration, setDuration] = useState('1');
  const isLabor = summary.type === 'labor';

  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', backgroundColor: 'transparent', padding: '0.5rem 0 0 0', borderTop: '1px dashed var(--border)' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>SELECT ASSET</span>
        <MasterDataSelector type={summary.type} onSelect={setSelected} selectedId={selected?.id || ''} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>QTY</span>
        <Input type="number" placeholder="0" value={qty} onChange={e => setQty(e.target.value)} style={{ width: '80px', height: '2.5rem' }} />
      </div>
      {isLabor && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>DURATION</span>
          <Input type="number" placeholder="1" value={duration} onChange={e => setDuration(e.target.value)} style={{ width: '80px', height: '2.5rem' }} />
        </div>
      )}
      <div style={{ alignSelf: 'flex-end', paddingBottom: '2px' }}>
        <Button size="md" onClick={() => { onAdd(selected, qty, duration); setSelected(null); setQty(''); setDuration('1'); }} disabled={!selected || !qty}>
          Add to Ledger
        </Button>
      </div>
    </div>
  );
}

export function VirtualizedSummaryTable({ summary, groupItems, deleteSummaryItem, createSummaryItem, updateSummaryItem, updateSummary, cascadeCostUpdate, MasterDataSelector }) {
  const parentRef = React.useRef(null);
  const [laborPercentage, setLaborPercentage] = React.useState(summary.laborPercentage || 0);
  const [toolsPercentage, setToolsPercentage] = React.useState(summary.toolsPercentage || 0);
  const [ocmPercentage, setOcmPercentage] = React.useState(summary.ocmPercentage || 0);

  // Calculate costs based on summary type
  const isLaborType = summary.type === 'labor';

  // Calculate total from items (this is the "base cost" for calculations)
  // For material type: this is the material cost
  // For labor type: this is the labor cost (sum of Qty * Duration * Unit Price)
  const totalBaseCost = groupItems
    .filter(i => !i.isExcluded)
    .reduce((sum, item) => sum + (item.totalCost || 0), 0);

  // For labor type: total labor cost is the base cost (from items)
  // For material type: labor cost is a percentage of material cost
  const totalLaborCost = isLaborType
    ? totalBaseCost
    : totalBaseCost * (laborPercentage / 100);

  // Tools and Equipment cost is based on the base cost
  // For material type: base cost = material cost
  // For labor type: base cost = labor cost
  const totalToolsCost = totalBaseCost * (toolsPercentage / 100);

  // OCM cost is based on (base cost + labor cost + tools cost)
  // For material: OCM = (material + labor + tools) * ocm%
  // For labor: OCM = (labor + tools) * ocm% (labor is already the base)
  const ocmBase = isLaborType
    ? totalBaseCost + totalToolsCost  // For labor: base is labor cost, no separate labor cost to add
    : totalBaseCost + totalLaborCost + totalToolsCost;  // For material: material + labor + tools

  const totalOcmCost = ocmBase * (ocmPercentage / 100);

  const handlePercentageChange = async (type, value) => {
    const updates = { ...summary };
    if (type === 'labor') {
      setLaborPercentage(value);
      updates.laborPercentage = value;
    } else if (type === 'tools') {
      setToolsPercentage(value);
      updates.toolsPercentage = value;
    } else if (type === 'ocm') {
      setOcmPercentage(value);
      updates.ocmPercentage = value;
    }
    await updateSummary(updates);
  };

  const rowVirtualizer = useVirtualizer({
    count: groupItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // estimated row height in px
    overscan: 50,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div ref={parentRef} style={{ maxHeight: '500px', overflow: 'auto', borderTop: '1px solid var(--border)' }}>
        <Table wrapperStyle={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
                <TableHeader style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--background)' }}>
            <TableRow>
              <TableHead>Item Name</TableHead>
              <TableHead style={{ textAlign: 'center', width: '120px' }}>Qty</TableHead>
              {isLaborType && (
                <TableHead style={{ textAlign: 'center', width: '80px' }}>Duration</TableHead>
              )}
              <TableHead style={{ textAlign: 'center', width: '80px' }}>Unit</TableHead>
              <TableHead style={{ textAlign: 'right' }}>Unit Price</TableHead>
              <TableHead style={{ textAlign: 'right' }}>Total Item Cost</TableHead>
              <TableHead style={{ textAlign: 'right', width: '80px' }}>Exclude</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paddingTop > 0 && (
              <tr style={{ height: `${paddingTop}px`, border: 'none' }}>
                <td colSpan={5} style={{ padding: 0, border: 0 }}>
                  <div style={{ height: `${paddingTop}px` }} />
                </td>
              </tr>
            )}

            {virtualRows.map((virtualRow) => {
              const item = groupItems[virtualRow.index];
              return (
                <TableRow
                  key={item.id}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  style={{ opacity: item.isExcluded ? 0.4 : 1, transition: 'opacity 0.2s' }}
                >
                  <TableCell>
                    <div style={{ fontWeight: 700, color: 'var(--foreground)' }}>{item.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>PID: {item.id.substring(0, 8)}</div>
                  </TableCell>
                  <TableCell style={{ textAlign: 'center', fontWeight: 600 }}>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={async (e) => {
                        const newQty = Number(e.target.value);
                        if (newQty >= 0) {
                          const duration = item.duration || 1;
                          const newTotalCost = isLaborType
                            ? item.unitCostAtTimeOfAdding * newQty * duration
                            : item.unitCostAtTimeOfAdding * newQty;
                          await updateSummaryItem({ ...item, quantity: newQty, totalCost: newTotalCost });
                          await cascadeCostUpdate(0, summary.id);
                        }
                      }}
                      style={{ width: '80px', height: '2rem', textAlign: 'center', padding: '0 0.25rem', margin: '0 auto' }}
                    />
                  </TableCell>
                  {isLaborType && (
                    <TableCell style={{ textAlign: 'center', fontWeight: 600 }}>
                      <Input
                        type="number"
                        value={item.duration || 1}
                        onChange={async (e) => {
                          const newDuration = Number(e.target.value);
                          if (newDuration >= 0) {
                            const newTotalCost = item.unitCostAtTimeOfAdding * item.quantity * newDuration;
                            await updateSummaryItem({ ...item, duration: newDuration, totalCost: newTotalCost });
                            await cascadeCostUpdate(0, summary.id);
                          }
                        }}
                        style={{ width: '80px', height: '2rem', textAlign: 'center', padding: '0 0.25rem', margin: '0 auto' }}
                      />
                    </TableCell>
                  )}
                  <TableCell style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                     {item.unit || '-'}
                  </TableCell>
                  <TableCell style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>₱{item.unitCostAtTimeOfAdding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
                     ₱{item.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center', height: '100%' }}>
                    <label title="Exclude this item" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!item.isExcluded}
                        onChange={async () => {
                          await updateSummaryItem({ ...item, isExcluded: !item.isExcluded });
                          await cascadeCostUpdate(0, summary.id);
                        }}
                      />
                    </label>
                    <button
                      onClick={async () => {
                        await deleteSummaryItem(item.id);
                        await cascadeCostUpdate(0, summary.id);
                      }}
                      style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.5rem', transition: 'all 0.2s' }}
                      onMouseOver={(e) => e.currentTarget.style.color = 'var(--destructive)'}
                      onMouseOut={(e) => e.currentTarget.style.color = '#a1a1aa'}
                    >
                      <Trash2 size={16} />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
            
            {paddingBottom > 0 && (
              <tr style={{ height: `${paddingBottom}px`, border: 'none' }}>
                <td colSpan={5} style={{ padding: 0, border: 0 }}>
                  <div style={{ height: `${paddingBottom}px` }} />
                </td>
              </tr>
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Footer Form row rendered normally below the virtualized table body */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '1.25rem', backgroundColor: 'var(--background)' }}>
        <AddItemForm
          summary={summary}
          onAdd={async (selectedMasterItem, qty, durationInput) => {
            if (!selectedMasterItem || !qty) return;
            const unitCost = Number(selectedMasterItem.currentPrice || selectedMasterItem.currentRate || 0);
            const quantity = Number(qty);
            const additionalCost = unitCost * quantity;

            const existingItem = groupItems.find(i => i.referenceId === selectedMasterItem.id && i.unitCostAtTimeOfAdding === unitCost);

            if (existingItem) {
              const newQty = existingItem.quantity + quantity;
              const duration = existingItem.duration || 1;
              const newTotalCost = summary.type === 'labor'
                ? existingItem.unitCostAtTimeOfAdding * newQty * duration
                : existingItem.unitCostAtTimeOfAdding * newQty;

              await updateSummaryItem({
                ...existingItem,
                quantity: newQty,
                totalCost: newTotalCost
              });
              await cascadeCostUpdate(0, summary.id);
            } else {
              const isLabor = summary.type === 'labor';
              const duration = isLabor ? (Number(durationInput) || 1) : 1;
              const totalCost = isLabor
                ? unitCost * quantity * duration
                : unitCost * quantity;

              const newItem = {
                id: crypto.randomUUID(),
                summaryId: summary.id,
                referenceId: selectedMasterItem.id,
                name: selectedMasterItem.name,
                unit: selectedMasterItem.unit || '',
                quantity,
                ...(isLabor && { duration }),
                unitCostAtTimeOfAdding: unitCost,
                totalCost,
                createdAt: new Date().toISOString()
              };

              await createSummaryItem(newItem);
              await cascadeCostUpdate(0, summary.id);
            }
          }}
          MasterDataSelector={MasterDataSelector}
        />
      </div>

      {/* Cost Breakdown Section with Percentage Rates */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem', paddingLeft: '1.25rem', paddingRight: '1.25rem', paddingBottom: '1.25rem', marginBottom: '0.5rem' }}>
        {/* Labor Requisition - only show for material type */}
        {summary.type === 'material' && (
          <div style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1rem', backgroundColor: '#fafafa' }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
                LABOR REQUISITION
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Input
                  type="number"
                  placeholder="0"
                  value={laborPercentage}
                  onChange={(e) => handlePercentageChange('labor', Number(e.target.value))}
                  style={{ flex: 1, height: '2.25rem' }}
                />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>%</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '0.25rem' }}>TOTAL LABOR COST</div>
              <div style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
                ₱{totalLaborCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        )}

        {/* Tools and Equipment */}
        <div style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1rem', backgroundColor: '#fafafa' }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
              TOOLS AND EQUIPMENT
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Input
                type="number"
                placeholder="0"
                value={toolsPercentage}
                onChange={(e) => handlePercentageChange('tools', Number(e.target.value))}
                style={{ flex: 1, height: '2.25rem' }}
              />
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>%</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '0.25rem' }}>TOTAL TOOLS AND EQUIPMENT COST</div>
            <div style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
              ₱{totalToolsCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* OCM - Overhead, Contingencies and Miscellaneous */}
        <div style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1rem', backgroundColor: '#fafafa' }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
              OVERHEAD, CONTINGENCIES AND MISCELLANEOUS
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Input
                type="number"
                placeholder="0"
                value={ocmPercentage}
                onChange={(e) => handlePercentageChange('ocm', Number(e.target.value))}
                style={{ flex: 1, height: '2.25rem' }}
              />
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>%</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '0.25rem' }}>TOTAL OCM COST</div>
            <div style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
              ₱{totalOcmCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
