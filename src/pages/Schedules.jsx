import React, { useState, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCollection } from '../hooks/useData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '../components/ui/dialog';
import { Calendar, Plus, ArrowRight, ArrowLeft, Clock, Edit2, Trash2, Search } from 'lucide-react';
import { cascadeDelete } from '../lib/cascade';
import { SelectCombo } from '../components/ui/select-combo';
import { useVirtualizer } from '@tanstack/react-virtual';

export default function Schedules() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId');
  const query = projectId ? [{ field: 'projectId', operator: '==', value: projectId }] : [];
  
  const { data: schedules, createItem, updateItem, refresh } = useCollection('schedulesOfWork', query);
  const { data: projects } = useCollection('projects');
  const project = projects.find(p => p.id === projectId);
  
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || '');

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const [searchQuery, setSearchQuery] = useState('');

  const filteredData = useMemo(() => {
    return schedules.filter(s => 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (s.description && s.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [schedules, searchQuery]);

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
    if (!name || !selectedProjectId) return;
    const id = crypto.randomUUID();
    await createItem({ id, projectId: selectedProjectId, name, description, totalCost: 0 });
    setName('');
    setDescription('');
  };

  const handleEdit = async () => {
    if (!editName || !editingSchedule) return;
    await updateItem({
      ...editingSchedule,
      name: editName,
      description: editDescription
    });
    setEditDialogOpen(false);
    setEditingSchedule(null);
  };

  const handleDelete = async (id) => {
    if (confirm("Are you sure you want to delete this schedule? All detailed cost entries will be permanently deleted.")) {
      await cascadeDelete('schedule', id);
      refresh();
    }
  };

  if (!projectId) {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem', color: 'var(--muted-foreground)' }}>
        <Calendar size={48} style={{ opacity: 0.2 }} />
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}>Context Required</h2>
        <p>Please select a specific Project from the directory to view its Phase Schedules.</p>
        <Button onClick={() => navigate('/projects')} variant="outline" style={{ marginTop: '1rem' }}>
          Return to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          {projectId && (
            <button 
              onClick={() => navigate(`/projects${project ? `?facilityId=${project.facilityId}` : ''}`)}
              style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '0.5rem', fontWeight: 600 }}
            >
              <ArrowLeft size={14} /> Back to Projects
            </button>
          )}
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.03em' }}>
            {project ? `${project.name} Schedules` : `Work Schedules`}
          </h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.925rem', marginTop: '0.25rem' }}>Detailed planning and execution logs for project phases.</p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--background)', padding: '0 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', width: '300px', height: '2.5rem' }}>
            <Search size={16} color="var(--muted-foreground)" />
            <input 
              type="text" 
              placeholder="Search schedules..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.9rem', color: 'var(--foreground)' }}
            />
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus size={18} />
                New Schedule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Phase Schedule</DialogTitle></DialogHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Project Link</label>
                  <SelectCombo 
                    value={selectedProjectId} 
                    onChange={setSelectedProjectId} 
                    options={projects.map(p => ({ value: p.id, label: p.name }))}
                    placeholder="Select project..."
                    disabled={true}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Schedule Identifier</label>
                  <Input placeholder="e.g. Foundation & Piling" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Detailed Scope</label>
                  <Input placeholder="Summary of work to be performed..." value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <DialogClose asChild><Button onClick={handleCreate} disabled={!selectedProjectId}>Register Schedule</Button></DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div ref={parentRef} style={{ maxHeight: '600px', overflow: 'auto', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
        <Table wrapperStyle={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
          <TableHeader style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--background)' }}>
            <TableRow>
              <TableHead>Specification</TableHead>
              <TableHead>Operational Log</TableHead>
              <TableHead style={{ textAlign: 'right' }}>Total Expense</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} style={{ textAlign: 'center', padding: '4.5rem', color: 'var(--muted-foreground)' }}>
                  <Calendar size={32} style={{ opacity: 0.15, marginBottom: '1.25rem' }} />
                  <p>{searchQuery ? "No schedules match your search." : "No Phase Schedules found. Define a schedule to begin cost tracking."}</p>
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
              const s = filteredData[virtualRow.index];
              return (
              <TableRow key={s.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index}>
                <TableCell>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Calendar size={14} color="var(--muted-foreground)" />
                    {s.name}
                  </div>
                </TableCell>
                <TableCell>
                  <div style={{ fontSize: '0.85rem', color: '#52525b', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.description || 'No description provided.'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7rem', color: 'var(--muted-foreground)', marginTop: '0.2rem' }}>
                    <Clock size={12} />
                    Added: {new Date(s.createdAt).toLocaleDateString()}
                  </div>
                </TableCell>
                <TableCell style={{ textAlign: 'right', fontWeight: 700, color: 'var(--foreground)' }}>
                  ₱{(s.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/summary?scheduleId=${s.id}`)}>
                    Open Workspace
                    <ArrowRight size={14} />
                  </Button>
                  <button 
                    onClick={() => {
                      setEditingSchedule(s);
                      setEditName(s.name);
                      setEditDescription(s.description || '');
                      setEditDialogOpen(true);
                    }}
                    style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.5rem' }}
                    title="Edit Schedule"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => handleDelete(s.id)}
                    style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.5rem' }}
                    onMouseOver={(e) => e.currentTarget.style.color = 'var(--destructive)'}
                    onMouseOut={(e) => e.currentTarget.style.color = '#a1a1aa'}
                    title="Delete Schedule"
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
          <DialogHeader><DialogTitle>Edit Schedule</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Schedule Identifier</label>
              <Input placeholder="e.g. Foundation & Piling" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Detailed Scope</label>
              <Input placeholder="Summary of work to be performed..." value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
            <Button onClick={handleEdit} style={{ marginTop: '0.5rem' }}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
