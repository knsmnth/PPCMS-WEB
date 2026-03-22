import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useCollection } from '../hooks/useData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '../components/ui/dialog';
import { cascadeCostUpdate } from '../lib/billing';
import { cascadeDelete } from '../lib/cascade';
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
  const { data: items, createItem: createSummaryItem, deleteItem: deleteSummaryItem } = useCollection('summaryItems');
  
  const { data: materials } = useCollection('materials');
  const { data: equipments } = useCollection('equipments');
  const { data: labor } = useCollection('laborTypes');
  
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

  const MasterDataSelector = ({ type, onSelect }) => {
    const list = type === 'material' ? materials : type === 'equipment' ? equipments : labor;
    return (
      <select 
        onChange={(e) => onSelect(list.find(i => i.id === e.target.value))} 
        style={{ height: '2.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', padding: '0 0.75rem', fontSize: '0.85rem', flex: 1, backgroundColor: '#fff' }}
      >
        <option value="">Select an Item...</option>
        {list.map(i => <option key={i.id} value={i.id}>{i.name} - ₱{(i.currentPrice || i.currentRate).toLocaleString()}</option>)}
      </select>
    );
  };

  const getIcon = (type) => {
    switch (type) {
      case 'material': return <Package size={16} />;
      case 'equipment': return <Wrench size={16} />;
      case 'labor': return <Users size={16} />;
      default: return <Calculator size={16} />;
    }
  };

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <button 
            onClick={() => navigate('/schedules')}
            style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '0.5rem', fontWeight: 600 }}
          >
            <ArrowLeft size={14} /> Back to Schedules
          </button>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.03em' }}>Workspace Summary</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.925rem', marginTop: '0.25rem' }}>Management of individual cost items and material acquisitions.</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus size={18} />
              Add Cost Group
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Categorize Cost Group</DialogTitle></DialogHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Group Classification</label>
                <select 
                  value={summaryType} 
                  onChange={(e) => setSummaryType(e.target.value)} 
                  style={{ height: '2.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', padding: '0.75rem', fontSize: '0.875rem', outline: 'none', backgroundColor: '#fff' }}
                >
                  <option value="material">Material Assets</option>
                  <option value="equipment">Equipment Operations</option>
                  <option value="labor">Personnel & Labor</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Category Title</label>
                <Input placeholder="e.g. Site Groundworks" value={summaryName} onChange={(e) => setSummaryName(e.target.value)} />
              </div>
              <DialogClose asChild><Button onClick={handleCreateSummary} disabled={!scheduleId}>Initialize Category</Button></DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      {summaries.length === 0 && (
        <div style={{ textAlign: 'center', padding: '6rem', backgroundColor: '#fff', borderRadius: 'var(--radius)', border: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--muted-foreground)' }}>
          <LayoutGrid size={48} style={{ opacity: 0.1, marginBottom: '1.5rem' }} />
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--primary)' }}>No Cost Groups Defined</h3>
          <p style={{ maxWidth: '400px', margin: '0.5rem auto 1.5rem auto' }}>Cost groups allow you to organize materials, equipment, and labor into logical project buckets.</p>
          <Button variant="outline" onClick={() => setIsDialogOpen(true)}>Create your first group</Button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
      {summaries.map(summary => {
        const groupItems = items.filter(i => i.summaryId === summary.id);
        
        return (
          <div key={summary.id} className="animate-fade-in" style={{ backgroundColor: 'var(--background)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
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
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '0.1rem' }}>CATEGORY TOTAL</div>
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
            
            <Table style={{ border: 'none', boxShadow: 'none' }}>
              <TableHeader>
                <TableRow>
                  <TableHead>Specification & Asset</TableHead>
                  <TableHead style={{ textAlign: 'center' }}>Qty</TableHead>
                  <TableHead style={{ textAlign: 'right' }}>Unit Rate</TableHead>
                  <TableHead style={{ textAlign: 'right' }}>Line Extension</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupItems.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div style={{ fontWeight: 700, color: 'var(--foreground)' }}>{item.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>PID: {item.id.substring(0, 8)}</div>
                    </TableCell>
                    <TableCell style={{ textAlign: 'center', fontWeight: 600 }}>{item.quantity}</TableCell>
                    <TableCell style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>₱{item.unitCostAtTimeOfAdding.toLocaleString()}</TableCell>
                    <TableCell style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
                       ₱{item.totalCost.toLocaleString()}
                    </TableCell>
                    <TableCell style={{ textAlign: 'right' }}>
                      <button 
                        onClick={async () => {
                          await deleteSummaryItem(item.id);
                          await cascadeCostUpdate(-item.totalCost, summary.id);
                        }}
                        style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.5rem', transition: 'all 0.2s' }}
                        onMouseOver={(e) => e.currentTarget.style.color = 'var(--destructive)'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#a1a1aa'}
                      >
                        <Trash2 size={16} />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                
                <TableRow>
                  <TableCell colSpan={5} style={{ padding: '1.25rem' }}>
                    <AddItemForm 
                      summary={summary} 
                      onAdd={async (selectedMasterItem, qty) => {
                        if (!selectedMasterItem || !qty) return;
                        const unitCost = Number(selectedMasterItem.currentPrice || selectedMasterItem.currentRate || 0);
                        const quantity = Number(qty);
                        const totalCost = unitCost * quantity;
                        
                        const newItem = {
                          id: crypto.randomUUID(),
                          summaryId: summary.id,
                          referenceId: selectedMasterItem.id,
                          name: selectedMasterItem.name,
                          quantity,
                          unitCostAtTimeOfAdding: unitCost,
                          totalCost,
                          createdAt: new Date().toISOString()
                        };
                        
                        await createSummaryItem(newItem);
                        await cascadeCostUpdate(totalCost, summary.id);
                      }} 
                      MasterDataSelector={MasterDataSelector} 
                    />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        );
      })}
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Cost Group Component</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Group Classification</label>
              <select 
                value={editSummaryType} 
                onChange={(e) => setEditSummaryType(e.target.value)} 
                style={{ height: '2.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', padding: '0.75rem', fontSize: '0.875rem', outline: 'none', backgroundColor: '#fff' }}
              >
                <option value="material">Material Assets</option>
                <option value="equipment">Equipment Operations</option>
                <option value="labor">Personnel & Labor</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Category Title</label>
              <Input placeholder="e.g. Site Groundworks" value={editSummaryName} onChange={(e) => setEditSummaryName(e.target.value)} />
            </div>
            <Button onClick={handleEditSummary} style={{ marginTop: '0.5rem' }}>Confirm Edits</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddItemForm({ summary, onAdd, MasterDataSelector }) {
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState('');

  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', backgroundColor: '#f9fafb', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>SELECT ASSET</span>
        <MasterDataSelector type={summary.type} onSelect={setSelected} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>QTY</span>
        <Input type="number" placeholder="0" value={qty} onChange={e => setQty(e.target.value)} style={{ width: '80px', height: '2.5rem' }} />
      </div>
      <div style={{ alignSelf: 'flex-end', paddingBottom: '2px' }}>
        <Button size="md" onClick={() => { onAdd(selected, qty); setSelected(null); setQty(''); }} disabled={!selected || !qty}>
          Add to Ledger
        </Button>
      </div>
    </div>
  );
}
