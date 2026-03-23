import React, { useState, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCollection } from '../hooks/useData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '../components/ui/dialog';
import { Folder, Plus, ArrowRight, ArrowLeft, Edit2, Trash2, Search } from 'lucide-react';
import { cascadeDelete } from '../lib/cascade';
import { SelectCombo } from '../components/ui/select-combo';
import { Select } from '../components/ui/select';
import { useVirtualizer } from '@tanstack/react-virtual';

export default function Projects() {
  const [searchParams] = useSearchParams();
  const facilityId = searchParams.get('facilityId');
  const query = facilityId ? [{ field: 'facilityId', operator: '==', value: facilityId }] : [];
  
  const { data: projects, createItem, updateItem, refresh } = useCollection('projects', query);
  const { data: facilities } = useCollection('facilities');
  const facility = facilities.find(f => f.id === facilityId);
  
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [status, setStatus] = useState('Planning');
  const [selectedFacilityId, setSelectedFacilityId] = useState(facilityId || '');

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [editName, setEditName] = useState('');
  const [editStatus, setEditStatus] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');

  const filteredData = useMemo(() => {
    return projects.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (p.status && p.status.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [projects, searchQuery]);

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
    if (!name || !selectedFacilityId) return;
    const id = crypto.randomUUID();
    await createItem({ id, facilityId: selectedFacilityId, name, status, totalCost: 0 });
    setName('');
  };

  const handleEdit = async () => {
    if (!editName || !editingProject) return;
    await updateItem({
      ...editingProject,
      name: editName,
      status: editStatus
    });
    setEditDialogOpen(false);
    setEditingProject(null);
  };

  const handleDelete = async (id) => {
    if (confirm("Are you sure you want to delete this project? All underlying schedules and items will be permanently deleted.")) {
      await cascadeDelete('project', id);
      refresh();
    }
  };

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'active': return { bg: '#dcfce7', text: '#15803d' };
      case 'completed': return { bg: '#dbeafe', text: '#1d4ed8' };
      case 'planning phase':
      case 'planning': return { bg: '#fef3c7', text: '#b45309' };
      default: return { bg: '#f4f4f5', text: '#71717a' };
    }
  };

  if (!facilityId) {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem', color: 'var(--muted-foreground)' }}>
        <Folder size={48} style={{ opacity: 0.2 }} />
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}>Context Required</h2>
        <p>Please select a specific Facility from the directory to view its associated projects.</p>
        <Button onClick={() => navigate('/facilities')} variant="outline" style={{ marginTop: '1rem' }}>
          Return to Facilities
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          {facilityId && (
            <button 
              onClick={() => navigate(`/facilities${facility ? `?campusId=${facility.campusId}` : ''}`)}
              style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '0.5rem', fontWeight: 600 }}
            >
              <ArrowLeft size={14} /> Back to Facilities
            </button>
          )}
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.03em' }}>
            {facility ? `${facility.name} Projects` : `Core Projects`}
          </h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.925rem', marginTop: '0.25rem' }}>Strategic operational projects focused on maintenance and expansion.</p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--background)', padding: '0 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', width: '300px', height: '2.5rem' }}>
            <Search size={16} color="var(--muted-foreground)" />
            <input 
              type="text" 
              placeholder="Search components..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.9rem', color: 'var(--foreground)' }}
            />
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus size={18} />
                Initialize Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Project Specification</DialogTitle></DialogHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Facility Context</label>
                  <SelectCombo 
                    value={selectedFacilityId} 
                    onChange={setSelectedFacilityId} 
                    options={facilities.map(f => ({ value: f.id, label: f.name }))}
                    placeholder="Select facility..."
                    disabled={true}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Project Name</label>
                  <Input placeholder="e.g. Roof Replacement 2024" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Operational Status</label>
                  <Select 
                    value={status} 
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="Planning">Planning Phase</option>
                    <option value="Active">Operational / Active</option>
                    <option value="Completed">Project Completed</option>
                    <option value="On Hold">Strategically Paused</option>
                  </Select>
                </div>
                <DialogClose asChild><Button onClick={handleCreate} disabled={!selectedFacilityId}>Create Project Instance</Button></DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div ref={parentRef} style={{ maxHeight: '600px', overflow: 'auto', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
        <Table wrapperStyle={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
          <TableHeader style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--background)' }}>
            <TableRow>
              <TableHead>Project Definition</TableHead>
              <TableHead>Phase Status</TableHead>
              <TableHead style={{ textAlign: 'right' }}>Budgeted Expense</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} style={{ textAlign: 'center', padding: '4.5rem', color: 'var(--muted-foreground)' }}>
                  <Folder size={32} style={{ opacity: 0.15, marginBottom: '1.25rem' }} />
                  <p>{searchQuery ? "No projects match your search." : "No projects found in this registry. Initialise a project instance to begin tracking."}</p>
                </TableCell>
              </TableRow>
            )}

            {paddingTop > 0 && (
              <TableRow>
                <TableCell colSpan={4} style={{ height: `${paddingTop}px`, padding: 0, border: 0 }} />
              </TableRow>
            )}

            {virtualRows.map((virtualRow) => {
              const p = filteredData[virtualRow.index];
              const statusColors = getStatusColor(p.status);
              return (
              <TableRow key={p.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index}>
                <TableCell>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--primary)' }}>{p.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Ref: {p.id.substring(0, 8)}...</div>
                </TableCell>
                <TableCell>
                  <span style={{ fontSize: '0.725rem', fontWeight: 750, padding: '0.35rem 0.75rem', borderRadius: '0.5rem', backgroundColor: statusColors.bg, color: statusColors.text, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: statusColors.text }}></div>
                    {p.status}
                  </span>
                </TableCell>
                <TableCell style={{ textAlign: 'right', fontWeight: 700, color: 'var(--foreground)' }}>
                  ₱{(p.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/schedules?projectId=${p.id}`)}>
                    Open Logs
                    <ArrowRight size={14} />
                  </Button>
                  <button 
                    onClick={() => {
                      setEditingProject(p);
                      setEditName(p.name);
                      setEditStatus(p.status || 'Planning');
                      setEditDialogOpen(true);
                    }}
                    style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.5rem' }}
                    title="Edit Project"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => handleDelete(p.id)}
                    style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.5rem' }}
                    onMouseOver={(e) => e.currentTarget.style.color = 'var(--destructive)'}
                    onMouseOut={(e) => e.currentTarget.style.color = '#a1a1aa'}
                    title="Delete Project"
                  >
                    <Trash2 size={16} />
                  </button>
                </TableCell>
              </TableRow>
            )})}
            
            {paddingBottom > 0 && (
              <TableRow>
                <TableCell colSpan={4} style={{ height: `${paddingBottom}px`, padding: 0, border: 0 }} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Project</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Project Name</label>
              <Input placeholder="e.g. Roof Replacement 2024" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Operational Status</label>
              <Select 
                value={editStatus} 
                onChange={(e) => setEditStatus(e.target.value)}
              >
                <option value="Planning">Planning Phase</option>
                <option value="Active">Operational / Active</option>
                <option value="Completed">Project Completed</option>
                <option value="On Hold">Strategically Paused</option>
              </Select>
            </div>
            <Button onClick={handleEdit} style={{ marginTop: '0.5rem' }}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
