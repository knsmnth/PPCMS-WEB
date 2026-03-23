import React, { useState, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCollection } from '../hooks/useData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '../components/ui/dialog';
import { Building, Plus, ArrowRight, ArrowLeft, Edit2, Trash2, Search } from 'lucide-react';
import { cascadeDelete } from '../lib/cascade';
import { SelectCombo } from '../components/ui/select-combo';
import { useVirtualizer } from '@tanstack/react-virtual';

export default function Facilities() {
  const [searchParams] = useSearchParams();
  const campusId = searchParams.get('campusId');
  const query = campusId ? [{ field: 'campusId', operator: '==', value: campusId }] : [];
  
  const { data: facilities, createItem, updateItem, refresh } = useCollection('facilities', query);
  const { data: campuses } = useCollection('campuses');
  const campus = campuses.find(c => c.id === campusId);
  
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [selectedCampusId, setSelectedCampusId] = useState(campusId || '');

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');

  const filteredData = useMemo(() => {
    return facilities.filter(f => 
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (f.type && f.type.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [facilities, searchQuery]);

  const parentRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 50,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  const handleCreate = async () => {
    if (!name || !selectedCampusId) return;
    const id = crypto.randomUUID();
    await createItem({ id, campusId: selectedCampusId, name, type, totalCost: 0 });
    setName('');
    setType('');
  };

  const handleEdit = async () => {
    if (!editName || !editingFacility) return;
    await updateItem({
      ...editingFacility,
      name: editName,
      type: editType
    });
    setEditDialogOpen(false);
    setEditingFacility(null);
  };

  const handleDelete = async (id) => {
    if (confirm("Are you sure you want to delete this facility? All underlying projects and schedules will be permanently deleted.")) {
      await cascadeDelete('facility', id);
      refresh();
    }
  };

  if (!campusId) {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem', color: 'var(--muted-foreground)' }}>
        <Building size={48} style={{ opacity: 0.2 }} />
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}>Context Required</h2>
        <p>Please select a specific Campus from the directory to view or manage its facilities.</p>
        <Button onClick={() => navigate('/campuses')} variant="outline" style={{ marginTop: '1rem' }}>
          Return to Campuses
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          {campusId && (
            <button 
              onClick={() => navigate('/campuses')}
              style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '0.5rem', fontWeight: 600 }}
            >
              <ArrowLeft size={14} /> Back to Campuses
            </button>
          )}
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.03em' }}>
            {campus ? `${campus.name} Facilities` : `All Facilities`}
          </h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.925rem', marginTop: '0.25rem' }}>Management of individual assets and infrastructure components.</p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--background)', padding: '0 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', width: '300px', height: '2.5rem' }}>
            <Search size={16} color="var(--muted-foreground)" />
            <input 
              type="text" 
              placeholder="Search facilities..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.9rem', color: 'var(--foreground)' }}
            />
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus size={18} />
                Add Facility
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Facility</DialogTitle></DialogHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Campus Assignment</label>
                  <SelectCombo 
                    value={selectedCampusId} 
                    onChange={setSelectedCampusId}
                    options={campuses.map(c => ({ value: c.id, label: c.name }))}
                    placeholder="Select a campus..."
                    disabled={true}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Facility Name</label>
                  <Input placeholder="e.g. Science Laboratory" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Facility Category</label>
                  <Input placeholder="e.g. Academic, Maintenance" value={type} onChange={(e) => setType(e.target.value)} />
                </div>
                <DialogClose asChild>
                  <Button onClick={handleCreate} disabled={!selectedCampusId}>Register Facility</Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div ref={parentRef} style={{ maxHeight: '600px', overflow: 'auto', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
        <Table wrapperStyle={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
          <TableHeader style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--background)' }}>
            <TableRow>
              <TableHead>Facility Identity</TableHead>
              <TableHead>Classification</TableHead>
              <TableHead style={{ textAlign: 'right' }}>Cumulative Valuation</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted-foreground)' }}>
                  <Building size={32} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                  <p>{searchQuery ? "No facilities match your search." : "No facilities identified. Registered structures will appear here."}</p>
                </TableCell>
              </TableRow>
            )}

            {paddingTop > 0 && (
              <TableRow>
                <TableCell colSpan={4} style={{ height: `${paddingTop}px`, padding: 0, border: 0 }}>
                  <div style={{ height: `${paddingTop}px` }} />
                </TableCell>
              </TableRow>
            )}

            {virtualRows.map((virtualRow) => {
              const f = filteredData[virtualRow.index];
              return (
              <TableRow key={f.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index}>
                <TableCell>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--primary)' }}>{f.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>UID: {f.id.substring(0, 8)}...</div>
                </TableCell>
                <TableCell>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '1rem', backgroundColor: 'var(--secondary)', color: 'var(--primary)', textTransform: 'uppercase' }}>
                    {f.type || 'Standard'}
                  </span>
                </TableCell>
                <TableCell style={{ textAlign: 'right', fontWeight: 700, color: 'var(--foreground)' }}>
                  ₱{(f.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/projects?facilityId=${f.id}`)}>
                    Browse Projects
                    <ArrowRight size={14} />
                  </Button>
                  <button 
                    onClick={() => {
                      setEditingFacility(f);
                      setEditName(f.name);
                      setEditType(f.type || '');
                      setEditDialogOpen(true);
                    }}
                    style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.5rem' }}
                    title="Edit Facility"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => handleDelete(f.id)}
                    style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.5rem' }}
                    onMouseOver={(e) => e.currentTarget.style.color = 'var(--destructive)'}
                    onMouseOut={(e) => e.currentTarget.style.color = '#a1a1aa'}
                    title="Delete Facility"
                  >
                    <Trash2 size={16} />
                  </button>
                </TableCell>
              </TableRow>
            )})}
            
            {paddingBottom > 0 && (
              <TableRow>
                <TableCell colSpan={4} style={{ height: `${paddingBottom}px`, padding: 0, border: 0 }}>
                  <div style={{ height: `${paddingBottom}px` }} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Facility</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Facility Name</label>
              <Input placeholder="e.g. Science Laboratory" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Facility Category</label>
              <Input placeholder="e.g. Academic, Maintenance" value={editType} onChange={(e) => setEditType(e.target.value)} />
            </div>
            <Button onClick={handleEdit} style={{ marginTop: '0.5rem' }}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
