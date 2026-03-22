import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCollection } from '../hooks/useData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '../components/ui/dialog';
import { MapPin, Plus, ArrowRight, Building2, Edit2, Trash2 } from 'lucide-react';
import { cascadeDelete } from '../lib/cascade';

export default function Campuses() {
  const { data: campuses, createItem, updateItem, refresh } = useCollection('campuses');
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCampus, setEditingCampus] = useState(null);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');

  const handleCreate = async () => {
    if (!name) return;
    const id = crypto.randomUUID();
    await createItem({ id, name, location, totalCost: 0 });
    setName('');
    setLocation('');
  };

  const handleEdit = async () => {
    if (!editName || !editingCampus) return;
    await updateItem({
      ...editingCampus,
      name: editName,
      location: editLocation
    });
    setEditDialogOpen(false);
    setEditingCampus(null);
  };

  const handleDelete = async (id) => {
    if (confirm("Are you sure you want to delete this campus? All underlying facilities, projects, and schedules will be permanently deleted.")) {
      await cascadeDelete('campus', id);
      refresh();
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.03em' }}>Campuses</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.925rem', marginTop: '0.25rem' }}>Management and oversight of institutional regional campuses.</p>
        </div>
        
        <Dialog>
          <DialogTrigger asChild>
            <Button size="md">
              <Plus size={18} />
              Add Campus
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Campus</DialogTitle>
            </DialogHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Campus Name</label>
                <Input placeholder="e.g. Northern Campus" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Address/Location</label>
                <div style={{ position: 'relative' }}>
                  <MapPin size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
                  <Input 
                    style={{ paddingLeft: '2.5rem' }}
                    placeholder="e.g. 123 University Drive" 
                    value={location} 
                    onChange={(e) => setLocation(e.target.value)} 
                  />
                </div>
              </div>
              <DialogClose asChild>
                <Button onClick={handleCreate} style={{ marginTop: '0.5rem' }}>Register Campus</Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <div style={{ borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campus Information</TableHead>
              <TableHead>Location</TableHead>
              <TableHead style={{ textAlign: 'right' }}>Total Cost Baseline</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campuses.map(c => (
              <TableRow key={c.id}>
                <TableCell>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--primary)' }}>{c.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>ID: {c.id.substring(0, 8)}...</div>
                </TableCell>
                <TableCell>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                    <MapPin size={14} color="var(--muted-foreground)" />
                    {c.location || 'N/A'}
                  </div>
                </TableCell>
                <TableCell style={{ textAlign: 'right', fontWeight: 700, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>
                  ₱{(c.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/facilities?campusId=${c.id}`)}>
                    View Facilities
                    <ArrowRight size={14} />
                  </Button>
                  <button 
                    onClick={() => {
                      setEditingCampus(c);
                      setEditName(c.name);
                      setEditLocation(c.location || '');
                      setEditDialogOpen(true);
                    }}
                    style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.5rem' }}
                    title="Edit Campus"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => handleDelete(c.id)}
                    style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.5rem' }}
                    onMouseOver={(e) => e.currentTarget.style.color = 'var(--destructive)'}
                    onMouseOut={(e) => e.currentTarget.style.color = '#a1a1aa'}
                    title="Delete Campus"
                  >
                    <Trash2 size={16} />
                  </button>
                </TableCell>
              </TableRow>
            ))}
            {campuses.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted-foreground)' }}>
                  <Building2 size={32} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                  <p>No campuses registered yet. Get started by adding your first institutional location.</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Campus</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Campus Name</label>
              <Input placeholder="e.g. Northern Campus" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Address/Location</label>
              <div style={{ position: 'relative' }}>
                <MapPin size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
                <Input 
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder="e.g. 123 University Drive" 
                  value={editLocation} 
                  onChange={(e) => setEditLocation(e.target.value)} 
                />
              </div>
            </div>
            <Button onClick={handleEdit} style={{ marginTop: '0.5rem' }}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
