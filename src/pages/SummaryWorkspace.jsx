import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useCollection } from '../hooks/useData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogBody, DialogFooter } from '../components/ui/dialog';
import { cascadeCostUpdate, recomputeScheduleCost, recomputeSummaryCost } from '../lib/billing';
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
  
  const { data: workGroupTemplates } = useCollection('workGroupTemplates');
  const { data: groupTemplateItems } = useCollection('workGroupTemplateItems');

  const navigate = useNavigate();
  const [summaryName, setSummaryName] = useState('');
  const [summaryType, setSummaryType] = useState('material');

  const [importTemplateOpen, setImportTemplateOpen] = useState(false);
  const [selectedGroupTemplateId, setSelectedGroupTemplateId] = useState('');

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSummary, setEditingSummary] = useState(null);
  const [editSummaryName, setEditSummaryName] = useState('');
  const [editSummaryType, setEditSummaryType] = useState('material');
  
  const handleCreateSummary = async () => {
    if (!summaryName || !scheduleId) return;
    const id = crypto.randomUUID();
    await createSummary({ 
      id, 
      scheduleOfWorkId: scheduleId, 
      name: summaryName, 
      type: summaryType, 
      unit: '', 
      totalCost: 0,
      laborPercentage: 0,
      toolsPercentage: 0,
      ocmPercentage: 0,
    });
    setSummaryName('');
  };

  const handleImportCategory = async () => {
    if (!selectedGroupTemplateId || !scheduleId) return;
    const template = workGroupTemplates.find(t => t.id === selectedGroupTemplateId);
    if (!template) return;

    const id = crypto.randomUUID();
    const summaryPayload = { 
      id, 
      scheduleOfWorkId: scheduleId, 
      name: template.name, 
      type: template.type, 
      unit: '', 
      totalCost: 0,
      laborPercentage: template.laborPercentage || 0,
      toolsPercentage: template.toolsPercentage || 0,
      ocmPercentage: template.ocmPercentage || 0,
      showLabor: template.showLabor ?? true,
      showTools: template.showTools ?? true,
      showOcm: template.showOcm ?? true,
    };
    
    await createSummary(summaryPayload);

    // Import Items
    const itemsToImport = groupTemplateItems.filter(i => i.templateId === selectedGroupTemplateId);
    if (itemsToImport.length > 0) {
      for (const tplItem of itemsToImport) {
        const isLabor = template.type === 'labor';
        const duration = isLabor ? 1 : 1;
        const totalCost = isLabor
          ? tplItem.unitPrice * duration * tplItem.quantity
          : tplItem.unitPrice * tplItem.quantity;

        await createSummaryItem({
          id: crypto.randomUUID(),
          summaryId: id,
          referenceId: tplItem.referenceId,
          name: tplItem.name,
          unit: tplItem.unit || '',
          quantity: tplItem.quantity,
          ...(isLabor && { duration }),
          unitCostAtTimeOfAdding: tplItem.unitPrice,
          totalCost,
          createdAt: new Date().toISOString()
        });
      }
    }
    
    setImportTemplateOpen(false);
    setSelectedGroupTemplateId('');
    
    // Force recompute to bubble up costs
    await recomputeSummaryCost(id);
    
    alert(`Category "${template.name}" imported with ${itemsToImport.length} items.`);
  };

  const handleEditSummary = async () => {
    if (!editSummaryName || !editingSummary) return;
    const updates = {
      ...editingSummary,
      name: editSummaryName,
      type: editSummaryType,
      unit: ''
    };
    await updateSummary(updates);
    setEditDialogOpen(false);
    setEditingSummary(null);
  };

  const handleDeleteSummary = async (summary) => {
    if (confirm(`Are you sure you want to delete the "${summary.name}" cost group? All underlying items will be deleted.`)) {
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
      case 'bulk': return <LayoutGrid size={16} />;
      default: return <Calculator size={16} />;
    }
  };

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const runningTotal = useMemo(() => {
    return summaries.reduce((sum, s) => sum + (s.totalCost || 0), 0);
  }, [summaries]);

  const sortedSummaries = useMemo(() => {
    return [...summaries].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [summaries]);

  const handleGroupDragStart = (e, index) => {
    e.dataTransfer.setData('text/groupIndex', index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleGroupDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Auto-scroll logic for drag-and-drop
    const buffer = 100;
    const speed = 15;
    if (e.clientY < buffer) {
      window.scrollBy(0, -speed);
    } else if (window.innerHeight - e.clientY < buffer) {
      window.scrollBy(0, speed);
    }
  };

  const handleGroupDrop = async (e, destIndex) => {
    e.preventDefault();
    const srcIndexStr = e.dataTransfer.getData('text/groupIndex');
    if (!srcIndexStr) return; // Means another drag event
    const srcIndex = parseInt(srcIndexStr, 10);
    if (isNaN(srcIndex) || srcIndex === destIndex) return;

    const newGroups = [...sortedSummaries];
    const [moved] = newGroups.splice(srcIndex, 1);
    newGroups.splice(destIndex, 0, moved);

    const reordered = newGroups.map((grp, idx) => ({ ...grp, order: idx }));
    await Promise.all(reordered.map(grp => updateSummary({ id: grp.id, order: grp.order })));
  };

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
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Running Total Work Cost
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.02em' }}>
              ₱{runningTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Group Classification</label>
                  <Select
                    value={summaryType}
                    onChange={(e) => setSummaryType(e.target.value)}
                  >
                    <option value="material">Material Assets</option>
                    <option value="labor">Personnel & Labor</option>
                    <option value="bulk">Bulk / Manual Group</option>
                  </Select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Category Title</label>
                  <Input placeholder="e.g. Site Groundworks" value={summaryName} onChange={(e) => setSummaryName(e.target.value)} />
                </div>
                
                <div style={{ padding: '1rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', backgroundColor: 'var(--secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                   <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', margin: 0 }}>Quick Import from Templates</p>
                   <select
                    value={selectedGroupTemplateId}
                    onChange={e => setSelectedGroupTemplateId(e.target.value)}
                    style={{ width: '100%', height: '2.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '0 0.75rem', fontSize: '0.875rem', background: 'var(--background)', color: 'var(--foreground)' }}
                   >
                     <option value="">-- Choose template group --</option>
                     {workGroupTemplates.map(t => (
                       <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                     ))}
                   </select>
                   <Button variant="outline" size="sm" onClick={handleImportCategory} disabled={!selectedGroupTemplateId}>Import Selected Template</Button>
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild><Button onClick={handleCreateSummary} disabled={!scheduleId}>Initialize Category</Button></DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </header>

      {summaries.length === 0 && (
        <div style={{ textAlign: 'center', padding: '6rem', backgroundColor: '#fff', borderRadius: 'var(--radius)', border: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--muted-foreground)' }}>
          <LayoutGrid size={48} style={{ opacity: 0.1, marginBottom: '1.5rem' }} />
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--primary)' }}>No Work Defined</h3>
          <p style={{ maxWidth: '400px', margin: '0.5rem auto 1.5rem auto' }}>Cost groups allow you to organize materials and labor into logical project buckets.</p>
          <Button variant="outline" onClick={() => setIsDialogOpen(true)}>Create your first work group</Button>
        </div>
      )}

      <div 
        style={{ display: 'flex', flexDirection: 'column', gap: '3rem', minHeight: '50vh' }}
        onDragOver={handleGroupDragOver}
      >
      {sortedSummaries.map((summary, groupIndex) => {
        const groupItems = items.filter(i => i.summaryId === summary.id);
        const showLaborState = (summary.type === 'material' || summary.type === 'bulk') && summary.showLabor !== false;
        const showToolsState = summary.showTools !== false;
        const showOcmState = summary.showOcm !== false;
        const hasAnyContainerObj = showLaborState || showToolsState || showOcmState;
        
        const totalBaseCostObj = groupItems
          .filter(i => !i.isExcluded)
          .reduce((sum, item) => sum + (item.totalCost || 0), 0);
        
        return (
          <div 
            key={summary.id} 
            className="animate-fade-in" 
            draggable
            onDragStart={(e) => handleGroupDragStart(e, groupIndex)}
            onDragOver={handleGroupDragOver}
            onDrop={(e) => handleGroupDrop(e, groupIndex)}
            style={{ backgroundColor: 'var(--background)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden', cursor: 'grab' }}
          >
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
                        const newExcludedState = !summary.isExcluded;
                        await updateSummary({ 
                          ...summary, 
                          isExcluded: newExcludedState,
                          excludeLabor: newExcludedState,
                          excludeTools: newExcludedState,
                          excludeOcm: newExcludedState
                        });
                        await Promise.all(groupItems.map(item => {
                          if (!!item.isExcluded !== newExcludedState) {
                            return updateSummaryItem({ ...item, isExcluded: newExcludedState });
                          }
                          return Promise.resolve();
                        }));
                      }}
                    />
                    EXCLUDE GROUP
                  </label>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', textAlign: 'right' }}>
                  <div>
                    <div style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '0.1rem', textTransform: 'uppercase' }}>
                      {summary.type === 'labor' ? 'BASE LABOR COST' : 'BASE MATERIAL COST'}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--foreground)', letterSpacing: '-0.02em' }}>
                      ₱{totalBaseCostObj.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  {(summary.totalCost !== undefined && (summary.totalCost || 0) > totalBaseCostObj) && (
                    <>
                      <div style={{ fontSize: '1.2rem', color: 'var(--muted-foreground)' }}>+</div>
                      <div>
                        <div style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '0.1rem', textTransform: 'uppercase' }}>
                          INDIRECT COSTS
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--foreground)', letterSpacing: '-0.02em' }}>
                          ₱{((summary.totalCost || 0) - totalBaseCostObj).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </>
                  )}

                  <div style={{ paddingLeft: '1.5rem', borderLeft: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '0.1rem', textTransform: 'uppercase' }}>
                      GRAND TOTAL
                    </div>
                    <div style={{ fontWeight: 900, fontSize: '1.5rem', color: 'var(--primary)', letterSpacing: '-0.03em' }}>
                      ₱{(summary.totalCost || totalBaseCostObj).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', borderLeft: '1px solid var(--border)', paddingLeft: '1.5rem' }}>
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
              MasterDataSelector={MasterDataSelector}              projectContext={projectContext}            />
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
                <option value="labor">Personnel & Labor</option>                <option value="bulk">Bulk / Manual Group</option>              </Select>
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
  
  // States for bulk / manual entry
  const [manualName, setManualName] = useState('');
  const [manualUnit, setManualUnit] = useState('');
  const [manualPrice, setManualPrice] = useState('');

  const isLabor = summary.type === 'labor';
  const isBulk = summary.type === 'bulk';

  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', backgroundColor: 'transparent', padding: '0.5rem 0 0 0', borderTop: '1px dashed var(--border)' }}>
      {isBulk ? (
        <>
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>ITEM SPECIFICATION</span>
            <Input placeholder="Enter description..." value={manualName} onChange={e => setManualName(e.target.value)} style={{ height: '2.5rem' }} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>UNIT</span>
            <Input placeholder="e.g. pcs, lot, sq.m" value={manualUnit} onChange={e => setManualUnit(e.target.value)} style={{ height: '2.5rem' }} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>UNIT PRICE (₱)</span>
            <Input type="number" placeholder="0.00" value={manualPrice} onChange={e => setManualPrice(e.target.value)} style={{ height: '2.5rem' }} />
          </div>
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>SELECT ASSET</span>
          <MasterDataSelector type={summary.type} onSelect={setSelected} selectedId={selected?.id || ''} />
        </div>
      )}
      
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
      <div style={{ alignSelf: 'flex-end', paddingBottom: '2px', display: 'flex', gap: '0.5rem' }}>
        {summary.type === 'material' && (
          <Button size="md" variant="outline" onClick={() => alert('Import content from templates not yet fully implemented.')}>
            Import Content
          </Button>
        )}
        <Button 
          size="md" 
          onClick={() => { 
            if (isBulk) {
              const fakeSelected = {
                id: crypto.randomUUID(),
                name: manualName,
                unit: manualUnit,
                currentPrice: Number(manualPrice) || 0,
                isManual: true,
              };
              onAdd(fakeSelected, qty, duration);
              setManualName(''); setManualUnit(''); setManualPrice(''); setQty('');
            } else {
              onAdd(selected, qty, duration); 
              setSelected(null); setQty(''); setDuration('1');
            }
          }} 
          disabled={isBulk ? (!manualName || !manualPrice || !qty) : (!selected || !qty)}
        >
          Add to Ledger
        </Button>
      </div>
    </div>
  );
}

export function VirtualizedSummaryTable({ summary, groupItems, deleteSummaryItem, createSummaryItem, updateSummaryItem, updateSummary, MasterDataSelector, projectContext }) {
  const parentRef = useRef(null);
  
  const [sortedItems, setSortedItems] = useState(groupItems);
  
  const [isEditItemOpen, setIsEditItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemUnit, setEditItemUnit] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');
  const [editItemQty, setEditItemQty] = useState('');
  const [editItemDuration, setEditItemDuration] = useState('1');
  const [editItemReferenceId, setEditItemReferenceId] = useState('');

  const isBulkType = summary.type === 'bulk';

  const handleOpenEditItem = (item) => {
    setEditingItem(item);
    setEditItemName(item.name || '');
    setEditItemUnit(item.unit || '');
    setEditItemPrice(item.unitCostAtTimeOfAdding !== undefined ? item.unitCostAtTimeOfAdding : '');
    setEditItemQty(item.quantity !== undefined ? item.quantity : 1);
    setIsEditItemOpen(true);
  };

  const handleSaveItemEdit = async () => {
    if (!editingItem) return;
    const qty = Number(editItemQty) || 0;
    const price = Number(editItemPrice) || 0;
    const newTotalCost = price * qty;

    await updateSummaryItem({
      ...editingItem,
      name: editItemName.trim() || editingItem.name,
      unit: editItemUnit.trim(),
      unitCostAtTimeOfAdding: price,
      quantity: qty,
      totalCost: newTotalCost
    });

    if (summary.id) {
      await recomputeSummaryCost(summary.id);
    }

    setIsEditItemOpen(false);
    setEditingItem(null);
  };
  
  useEffect(() => {
    setSortedItems([...groupItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  }, [groupItems]);

  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('text/plain', index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Auto-scroll logic for virtualized table drag-and-drop
    if (!parentRef.current) return;
    const { top, bottom } = parentRef.current.getBoundingClientRect();
    const buffer = 50;
    const speed = 15;
    
    if (e.clientY < top + buffer) {
      parentRef.current.scrollBy(0, -speed);
    } else if (e.clientY > bottom - buffer) {
      parentRef.current.scrollBy(0, speed);
    }
  };

  const handleDrop = async (e, destIndex) => {
    e.preventDefault();
    const srcIndexStr = e.dataTransfer.getData('text/plain');
    if (!srcIndexStr) return;
    const srcIndex = parseInt(srcIndexStr, 10);
    if (isNaN(srcIndex) || srcIndex === destIndex) return;

    const newItems = [...sortedItems];
    const [moved] = newItems.splice(srcIndex, 1);
    newItems.splice(destIndex, 0, moved);

    const reordered = newItems.map((item, idx) => ({ ...item, order: idx }));
    setSortedItems(reordered);
    await Promise.all(reordered.map(item => updateSummaryItem({ ...item })));
  };

  const [laborPercentage, setLaborPercentage] = useState(summary.laborPercentage || 0);
  const [toolsPercentage, setToolsPercentage] = useState(summary.toolsPercentage || 0);
  const [ocmPercentage, setOcmPercentage] = useState(summary.ocmPercentage || 0);

  const [showTools, setShowTools] = useState(summary.showTools !== false);
  const [showOcm, setShowOcm] = useState(summary.showOcm !== false);
  const [showLaborState, setShowLaborState] = useState(summary.showLabor !== false);

  // Sync local state when summary prop changes (e.g. from database)
  useEffect(() => {
    setLaborPercentage(summary.laborPercentage || 0);
    setToolsPercentage(summary.toolsPercentage || 0);
    setOcmPercentage(summary.ocmPercentage || 0);
    setShowTools(summary.showTools !== false);
    setShowOcm(summary.showOcm !== false);
    setShowLaborState(summary.showLabor !== false);
  }, [summary.id, summary.laborPercentage, summary.toolsPercentage, summary.ocmPercentage, summary.showTools, summary.showOcm, summary.showLabor, summary.type]);

  // Calculate costs based on summary type
  const isLaborType = summary.type === 'labor';

  const showLabor = (summary.type === 'material' || summary.type === 'bulk') && showLaborState;

  // Calculate total from items (this is the "base cost" for calculations)
  // For material type: this is the material cost
  // For labor type: this is the labor cost (sum of Qty * Duration * Unit Price)
  const totalBaseCost = groupItems
    .filter(i => !i.isExcluded)
    .reduce((sum, item) => sum + (item.totalCost || 0), 0);

  // For labor type: total labor cost is the base cost (from items)
  // For material type: labor cost is a percentage of material cost (if shown and not excluded)
  const effectiveLaborPerc = laborPercentage || projectContext?.defaultLaborPercentage || 0;
  const effectiveToolsPerc = toolsPercentage || projectContext?.defaultToolsPercentage || 0;
  const effectiveOcmPerc = ocmPercentage || projectContext?.defaultOcmPercentage || 0;

  const totalLaborCost = isLaborType
    ? totalBaseCost
    : (showLabor && !summary.excludeLabor ? totalBaseCost * (effectiveLaborPerc / 100) : 0);

  // Tools and Equipment cost is based on the base cost (if shown and not excluded)
  const totalToolsCost = (showTools && !summary.excludeTools) ? (totalBaseCost * (effectiveToolsPerc / 100)) : 0;

  // OCM cost is based on (base cost + labor cost + tools cost) (if shown and not excluded)
  const ocmBase = isLaborType
    ? totalBaseCost + totalToolsCost
    : totalBaseCost + totalLaborCost + totalToolsCost;

  const totalOcmCost = (showOcm && !summary.excludeOcm) ? (ocmBase * (effectiveOcmPerc / 100)) : 0;

  const groupTotalCost = useMemo(() => {
    if (isLaborType) {
      // For labor type: total cost = labor (totalBaseCost) + tools + OCM
      return totalBaseCost + totalToolsCost + totalOcmCost;
    }
    // For material type: total work cost = materials (totalBaseCost) + labor + tools + OCM
    return totalBaseCost + totalLaborCost + totalToolsCost + totalOcmCost;
  }, [isLaborType, totalBaseCost, totalLaborCost, totalToolsCost, totalOcmCost]);

  // Sync summary.totalCost with groupTotalCost (sum of the 3 boxes)
  // We use a ref to track if we're currently updating to avoid race conditions
  const isUpdatingRef = useRef(false);

  useEffect(() => {
    if (isUpdatingRef.current) return;

    if (Math.abs((summary.totalCost || 0) - groupTotalCost) > 0.01) {
      isUpdatingRef.current = true;
      updateSummary({ ...summary, totalCost: groupTotalCost }).then(() => {
        if (summary.scheduleOfWorkId) {
          recomputeScheduleCost(summary.scheduleOfWorkId);
        }
        isUpdatingRef.current = false;
      }).catch(() => {
        isUpdatingRef.current = false;
      });
    }
  }, [groupTotalCost, summary.totalCost, updateSummary, summary]);

  const handleToggleContainer = async (type) => {
    const updates = { ...summary };
    let newLaborShow = showLaborState;
    let newToolsShow = showTools;
    let newOcmShow = showOcm;
    let newLaborPerc = laborPercentage;
    let newToolsPerc = toolsPercentage;
    let newOcmPerc = ocmPercentage;

    if (type === 'labor') {
      newLaborShow = !showLaborState;
      setShowLaborState(newLaborShow);
      updates.showLabor = newLaborShow;
      if (!newLaborShow) { newLaborPerc = 0; setLaborPercentage(0); updates.laborPercentage = 0; }
      else {
        // When enabling, we keep it 0 so it uses global by default
        newLaborPerc = 0;
        setLaborPercentage(0);
        updates.laborPercentage = 0;
      }
    } else if (type === 'tools') {
      newToolsShow = !showTools;
      setShowTools(newToolsShow);
      updates.showTools = newToolsShow;
      if (!newToolsShow) { newToolsPerc = 0; setToolsPercentage(0); updates.toolsPercentage = 0; }
      else {
        newToolsPerc = 0;
        setToolsPercentage(0);
        updates.toolsPercentage = 0;
      }
    } else if (type === 'ocm') {
      newOcmShow = !showOcm;
      setShowOcm(newOcmShow);
      updates.showOcm = newOcmShow;
      if (!newOcmShow) { newOcmPerc = 0; setOcmPercentage(0); updates.ocmPercentage = 0; }
      else {
        newOcmPerc = 0;
        setOcmPercentage(0);
        updates.ocmPercentage = 0;
      }
    }

    // Recompute total cost with fallback logic
    const effLabor = newLaborPerc || projectContext?.defaultLaborPercentage || 0;
    const effTools = newToolsPerc || projectContext?.defaultToolsPercentage || 0;
    const effOcm = newOcmPerc || projectContext?.defaultOcmPercentage || 0;

    const laborCost = isLaborType ? totalBaseCost : (newLaborShow && !summary.excludeLabor ? totalBaseCost * (effLabor / 100) : 0);
    const toolsCost = (newToolsShow && !summary.excludeTools) ? (totalBaseCost * (effTools / 100)) : 0;
    const ocmBaseVal = isLaborType ? totalBaseCost + toolsCost : totalBaseCost + laborCost + toolsCost;
    const ocmCost = (newOcmShow && !summary.excludeOcm) ? (ocmBaseVal * (effOcm / 100)) : 0;
    const newTotal = isLaborType ? totalBaseCost + toolsCost + ocmCost : totalBaseCost + laborCost + toolsCost + ocmCost;

    updates.totalCost = newTotal;
    isUpdatingRef.current = true;
    await updateSummary(updates);
    if (summary.scheduleOfWorkId) {
      await recomputeScheduleCost(summary.scheduleOfWorkId);
    }
    isUpdatingRef.current = false;
  };

  const handleToggleExcludeContainer = async (type) => {
    const updates = { ...summary };
    let newExclLabor = summary.excludeLabor;
    let newExclTools = summary.excludeTools;
    let newExclOcm = summary.excludeOcm;

    if (type === 'labor') { updates.excludeLabor = !summary.excludeLabor; newExclLabor = updates.excludeLabor; }
    else if (type === 'tools') { updates.excludeTools = !summary.excludeTools; newExclTools = updates.excludeTools; }
    else if (type === 'ocm') { updates.excludeOcm = !summary.excludeOcm; newExclOcm = updates.excludeOcm; }

    // Recompute total cost
    const effLabor = laborPercentage || projectContext?.defaultLaborPercentage || 0;
    const effTools = toolsPercentage || projectContext?.defaultToolsPercentage || 0;
    const effOcm = ocmPercentage || projectContext?.defaultOcmPercentage || 0;

    const laborCost = isLaborType ? totalBaseCost : (showLaborState && !newExclLabor ? totalBaseCost * (effLabor / 100) : 0);
    const toolsCost = (showTools && !newExclTools) ? (totalBaseCost * (effTools / 100)) : 0;
    const ocmBaseVal = isLaborType ? totalBaseCost + toolsCost : totalBaseCost + laborCost + toolsCost;
    const ocmCost = (showOcm && !newExclOcm) ? (ocmBaseVal * (effOcm / 100)) : 0;
    const newTotal = isLaborType ? totalBaseCost + toolsCost + ocmCost : totalBaseCost + laborCost + toolsCost + ocmCost;

    updates.totalCost = newTotal;
    isUpdatingRef.current = true;
    await updateSummary(updates);
    if (summary.scheduleOfWorkId) {
      await recomputeScheduleCost(summary.scheduleOfWorkId);
    }
    isUpdatingRef.current = false;
  };

  const hasAnyContainer = showLabor || showTools || showOcm;

  const handlePercentageChange = async (type, value) => {
    const updates = { ...summary };
    let newLabor = laborPercentage;
    let newTools = toolsPercentage;
    let newOcm = ocmPercentage;

    if (type === 'labor') {
      setLaborPercentage(value);
      newLabor = value;
      updates.laborPercentage = value;
    } else if (type === 'tools') {
      setToolsPercentage(value);
      newTools = value;
      updates.toolsPercentage = value;
    } else if (type === 'ocm') {
      setOcmPercentage(value);
      newOcm = value;
      updates.ocmPercentage = value;
    }

    // Recompute total cost immediately to avoid race condition with useEffect
    const effLabor = newLabor || projectContext?.defaultLaborPercentage || 0;
    const effTools = newTools || projectContext?.defaultToolsPercentage || 0;
    const effOcm = newOcm || projectContext?.defaultOcmPercentage || 0;

    const laborCost = isLaborType ? totalBaseCost : (showLabor && !summary.excludeLabor ? totalBaseCost * (effLabor / 100) : 0);
    const toolsCost = (showTools && !summary.excludeTools) ? (totalBaseCost * (effTools / 100)) : 0;
    const ocmBaseVal = isLaborType ? totalBaseCost + toolsCost : totalBaseCost + laborCost + toolsCost;
    const ocmCost = (showOcm && !summary.excludeOcm) ? (ocmBaseVal * (effOcm / 100)) : 0;
    
    const newTotal = isLaborType ? totalBaseCost + toolsCost + ocmCost : totalBaseCost + laborCost + toolsCost + ocmCost;
    
    updates.totalCost = newTotal;
    isUpdatingRef.current = true;
    await updateSummary(updates);
    if (summary.scheduleOfWorkId) {
      await recomputeScheduleCost(summary.scheduleOfWorkId);
    }
    isUpdatingRef.current = false;
  };

  const rowVirtualizer = useVirtualizer({
    count: sortedItems.length,
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
              <TableHead style={{ textAlign: 'center', width: '80px' }}>Unit</TableHead>
              {isLaborType && (
                <TableHead style={{ textAlign: 'center', width: '120px' }}>Duration (days)</TableHead>
              )}
              <TableHead style={{ textAlign: 'right' }}>Unit Price</TableHead>
              <TableHead style={{ textAlign: 'right' }}>Total Item Cost</TableHead>
              <TableHead style={{ textAlign: 'right', width: isBulkType ? '100px' : '80px' }}>{isBulkType ? 'Actions' : 'Exclude'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paddingTop > 0 && (
              <tr style={{ height: `${paddingTop}px`, border: 'none' }}>
                <td colSpan={isLaborType ? 7 : 6} style={{ padding: 0, border: 0 }}>
                  <div style={{ height: `${paddingTop}px` }} />
                </td>
              </tr>
            )}

            {virtualRows.map((virtualRow) => {
              const item = sortedItems[virtualRow.index];
              return (
                <TableRow
                  key={item.id}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  draggable
                  onDragStart={(e) => handleDragStart(e, virtualRow.index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, virtualRow.index)}
                  style={{ opacity: item.isExcluded ? 0.4 : 1, transition: 'opacity 0.2s', cursor: 'grab' }}
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
                            ? item.unitCostAtTimeOfAdding * duration * newQty
                            : item.unitCostAtTimeOfAdding * newQty;
                          await updateSummaryItem({ ...item, quantity: newQty, totalCost: newTotalCost });
                        }
                      }}
                      style={{ width: '80px', height: '2rem', textAlign: 'center', padding: '0 0.25rem', margin: '0 auto' }}
                    />
                  </TableCell>
                  <TableCell style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                    {item.unit || '-'}
                  </TableCell>
                  {isLaborType && (
                    <TableCell style={{ textAlign: 'center', fontWeight: 600 }}>
                      <Input
                        type="number"
                        value={item.duration || 1}
                        onChange={async (e) => {
                          const newDuration = Number(e.target.value);
                          if (newDuration >= 0) {
                            const newTotalCost = item.unitCostAtTimeOfAdding * newDuration * item.quantity;
                            await updateSummaryItem({ ...item, duration: newDuration, totalCost: newTotalCost });
                          }
                        }}
                        style={{ width: '80px', height: '2rem', textAlign: 'center', padding: '0 0.25rem', margin: '0 auto' }}
                      />
                    </TableCell>
                  )}
                  <TableCell style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>₱{item.unitCostAtTimeOfAdding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
                     ₱{item.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell style={{ textAlign: 'right', display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', alignItems: 'center', height: '100%' }}>
                    {isBulkType && (
                      <button
                        onClick={() => handleOpenEditItem(item)}
                        style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.35rem', transition: 'all 0.2s', display: 'flex', alignItems: 'center' }}
                        onMouseOver={(e) => e.currentTarget.style.color = 'var(--primary)'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#a1a1aa'}
                        title="Edit manual item"
                      >
                        <Edit2 size={15} />
                      </button>
                    )}
                    <label title="Exclude this item" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.2rem' }}>
                      <input
                        type="checkbox"
                        checked={!!item.isExcluded}
                        onChange={async () => {
                          await updateSummaryItem({ ...item, isExcluded: !item.isExcluded });
                        }}
                      />
                    </label>
                    <button
                      onClick={async () => {
                        await deleteSummaryItem(item.id);
                      }}
                      style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.35rem', transition: 'all 0.2s', display: 'flex', alignItems: 'center' }}
                      onMouseOver={(e) => e.currentTarget.style.color = 'var(--destructive)'}
                      onMouseOut={(e) => e.currentTarget.style.color = '#a1a1aa'}
                      title="Delete item"
                    >
                      <Trash2 size={15} />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
            
            {paddingBottom > 0 && (
              <tr style={{ height: `${paddingBottom}px`, border: 'none' }}>
                <td colSpan={isLaborType ? 7 : 6} style={{ padding: 0, border: 0 }}>
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

            const existingItem = groupItems.find(i => i.referenceId === selectedMasterItem.id && i.unitCostAtTimeOfAdding === unitCost);

            if (existingItem) {
              const newQty = existingItem.quantity + quantity;
              const duration = existingItem.duration || 1;
              const newTotalCost = summary.type === 'labor'
                ? existingItem.unitCostAtTimeOfAdding * duration * newQty
                : existingItem.unitCostAtTimeOfAdding * newQty;

              await updateSummaryItem({
                ...existingItem,
                quantity: newQty,
                totalCost: newTotalCost
              });
            } else {
              const isLabor = summary.type === 'labor';
              const duration = isLabor ? (Number(durationInput) || 1) : 1;
              const totalCost = isLabor
                ? unitCost * duration * quantity
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
            }
          }}
          MasterDataSelector={MasterDataSelector}
        />
      </div>

      {/* Cost Breakdown Section with Percentage Rates */}
      {(showLabor || showTools || showOcm) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem', paddingLeft: '1.25rem', paddingRight: '1.25rem', paddingBottom: '1.25rem', marginBottom: '0.5rem' }}>
          {/* Labor Requisition - only show for material type */}
          {(summary.type === 'material' || summary.type === 'bulk') && showLabor && (
            <div style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1rem', backgroundColor: '#fafafa', opacity: summary.excludeLabor ? 0.6 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--foreground)', textTransform: 'uppercase', textDecoration: summary.excludeLabor ? 'line-through' : 'none', margin: 0 }}>
                  LABOR REQUISITION
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                    <input 
                      type="checkbox" 
                      checked={!!summary.excludeLabor} 
                      onChange={() => handleToggleExcludeContainer('labor')}
                    />
                    EXCLUDE
                  </label>
                  <button 
                    onClick={() => handleToggleContainer('labor')}
                    style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 0, display: 'flex' }}
                    onMouseOver={(e) => e.currentTarget.style.color = 'var(--destructive)'}
                    onMouseOut={(e) => e.currentTarget.style.color = '#a1a1aa'}
                    title="Remove Labor Requisition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Input
                    type="number"
                    placeholder={`${projectContext?.defaultLaborPercentage || 0}`}
                    value={laborPercentage === 0 ? '' : laborPercentage}
                    onChange={(e) => handlePercentageChange('labor', Number(e.target.value))}
                    style={{ flex: 1, height: '2.25rem' }}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>%</span>
                  {laborPercentage === 0 && (
                    <span style={{ fontSize: '0.6rem', color: 'var(--primary)', fontWeight: 700, marginLeft: '0.25rem' }}>GLOBAL</span>
                  )}
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
          {showTools && (
            <div style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1rem', backgroundColor: '#fafafa', opacity: summary.excludeTools ? 0.6 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--foreground)', textTransform: 'uppercase', textDecoration: summary.excludeTools ? 'line-through' : 'none', margin: 0 }}>
                  TOOLS AND EQUIPMENT
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                    <input 
                      type="checkbox" 
                      checked={!!summary.excludeTools} 
                      onChange={() => handleToggleExcludeContainer('tools')}
                    />
                    EXCLUDE
                  </label>
                  <button 
                    onClick={() => handleToggleContainer('tools')}
                    style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 0, display: 'flex' }}
                    onMouseOver={(e) => e.currentTarget.style.color = 'var(--destructive)'}
                    onMouseOut={(e) => e.currentTarget.style.color = '#a1a1aa'}
                    title="Remove Tools and Equipment"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Input
                    type="number"
                    placeholder={`${projectContext?.defaultToolsPercentage || 0}`}
                    value={toolsPercentage === 0 ? '' : toolsPercentage}
                    onChange={(e) => handlePercentageChange('tools', Number(e.target.value))}
                    style={{ flex: 1, height: '2.25rem' }}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>%</span>
                  {toolsPercentage === 0 && (
                    <span style={{ fontSize: '0.6rem', color: 'var(--primary)', fontWeight: 700, marginLeft: '0.25rem' }}>GLOBAL</span>
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '0.25rem' }}>TOTAL TOOLS AND EQUIPMENT COST</div>
                <div style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
                  ₱{totalToolsCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          )}

          {/* OCM - Overhead, Contingencies and Miscellaneous */}
          {showOcm && (
            <div style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1rem', backgroundColor: '#fafafa', opacity: summary.excludeOcm ? 0.6 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--foreground)', textTransform: 'uppercase', textDecoration: summary.excludeOcm ? 'line-through' : 'none', margin: 0 }}>
                  OVERHEAD, CONTINGENCIES AND MISCELLANEOUS
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                    <input 
                      type="checkbox" 
                      checked={!!summary.excludeOcm} 
                      onChange={() => handleToggleExcludeContainer('ocm')}
                    />
                    EXCLUDE
                  </label>
                  <button 
                    onClick={() => handleToggleContainer('ocm')}
                    style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 0, display: 'flex' }}
                    onMouseOver={(e) => e.currentTarget.style.color = 'var(--destructive)'}
                    onMouseOut={(e) => e.currentTarget.style.color = '#a1a1aa'}
                    title="Remove OCM"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Input
                    type="number"
                    placeholder={`${projectContext?.defaultOcmPercentage || 0}`}
                    value={ocmPercentage === 0 ? '' : ocmPercentage}
                    onChange={(e) => handlePercentageChange('ocm', Number(e.target.value))}
                    style={{ flex: 1, height: '2.25rem' }}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>%</span>
                  {ocmPercentage === 0 && (
                    <span style={{ fontSize: '0.6rem', color: 'var(--primary)', fontWeight: 700, marginLeft: '0.25rem' }}>GLOBAL</span>
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '0.25rem' }}>TOTAL OCM COST</div>
                <div style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
                  ₱{totalOcmCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {(!showLabor || !showTools || !showOcm) && (
        <div style={{ padding: '0 1.25rem 1.25rem 1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(summary.type === 'material' || summary.type === 'bulk') && !showLabor && (
              <Button variant="outline" size="sm" onClick={() => handleToggleContainer('labor')}>+ Add Labor Requisition</Button>
            )}
            {!showTools && (
              <Button variant="outline" size="sm" onClick={() => handleToggleContainer('tools')}>+ Add Tools & Equipment</Button>
            )}
            {!showOcm && (
              <Button variant="outline" size="sm" onClick={() => handleToggleContainer('ocm')}>+ Add OCM</Button>
            )}
          </div>
        </div>
      )}

      {/* Edit Item Dialog (for Bulk / Manual Group) */}
      {isBulkType && (
        <Dialog open={isEditItemOpen} onOpenChange={setIsEditItemOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Manual Item Specification</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                    Item Specification / Description *
                  </label>
                  <Input
                    value={editItemName}
                    onChange={(e) => setEditItemName(e.target.value)}
                    placeholder="Enter description..."
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                      Unit
                    </label>
                    <Input
                      value={editItemUnit}
                      onChange={(e) => setEditItemUnit(e.target.value)}
                      placeholder="e.g. pcs, lot, sq.m"
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                      Unit Price (₱) *
                    </label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={editItemPrice}
                      onChange={(e) => setEditItemPrice(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                    Quantity *
                  </label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={editItemQty}
                    onChange={(e) => setEditItemQty(e.target.value)}
                    placeholder="1"
                  />
                </div>

                <div style={{ padding: '0.75rem 1rem', background: 'var(--secondary)', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                    Computed Item Total
                  </span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary)' }}>
                    ₱{((Number(editItemPrice) || 0) * (Number(editItemQty) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditItemOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveItemEdit}
                disabled={!editItemName.trim() || editItemPrice === '' || editItemQty === ''}
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
