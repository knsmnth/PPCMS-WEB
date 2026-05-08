import React, { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCollection } from '../hooks/useData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogBody, DialogFooter } from '../components/ui/dialog';
import { MapPin, Plus, ArrowRight, Building2, Edit2, Trash2, Search } from 'lucide-react';
import { cascadeDelete } from '../lib/cascade';
import { useVirtualizer } from '@tanstack/react-virtual';

export default function Campuses() {
  const { data: campuses, createItem, updateItem, refresh } = useCollection('campuses');
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCampus, setEditingCampus] = useState(null);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');

  const filteredData = useMemo(() => {
    return campuses.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (c.location && c.location.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [campuses, searchQuery]);

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

  const handleToggleExclude = async (e, campus) => {
    e.stopPropagation();
    const isNowExcluded = !campus.isExcluded;
    await updateItem({ ...campus, isExcluded: isNowExcluded });
    refresh();
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.03em' }}>Campuses</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.925rem', marginTop: '0.25rem' }}>Management and oversight of institutional regional campuses.</p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--background)', padding: '0 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', width: '300px', height: '2.5rem' }}>
            <Search size={16} color="var(--muted-foreground)" />
            <input 
              type="text" 
              placeholder="Search campuses by name or location..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.9rem', color: 'var(--foreground)' }}
            />
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
              <DialogBody>
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
              </DialogBody>
              <DialogFooter>
                <DialogClose asChild>
                  <Button onClick={handleCreate}>Register Campus</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div ref={parentRef} style={{ maxHeight: '600px', overflow: 'auto', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
        <Table wrapperStyle={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
          <TableHeader style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--background)' }}>
            <TableRow>
              <TableHead style={{ width: 40 }} />
              <TableHead>Campus Information</TableHead>
              <TableHead>Location</TableHead>
              <TableHead style={{ textAlign: 'right' }}>Total Cost Baseline</TableHead>
              <TableHead style={{ width: 80 }}></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} style={{ textAlign: 'center', padding: '4.5rem', color: 'var(--muted-foreground)' }}>
                  <Building2 size={32} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                  <p>{searchQuery ? "No campuses match your search." : "No campuses registered yet. Get started by adding your first institutional location."}</p>
                </TableCell>
              </TableRow>
            )}

            {paddingTop > 0 && (
              <tr style={{ height: `${paddingTop}px`, border: 'none' }}>
                <td colSpan={4} style={{ padding: 0, border: 0 }}>
                  <div style={{ height: `${paddingTop}px` }} />
                </td>
              </tr>
            )}

            {virtualRows.map((virtualRow) => {
              const c = filteredData[virtualRow.index];
              return (
              <TableRow
                key={c.id}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                style={{ opacity: c.isExcluded ? 0.6 : 1, cursor: 'pointer' }}
                onClick={() => navigate(`/facilities?campusId=${c.id}`)}
              >
                <TableCell style={{ padding: '0.75rem 0.5rem', width: 40, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={!!c.isExcluded}
                    onChange={(e) => handleToggleExclude(e, c)}
                    onClick={e => e.stopPropagation()}
                    title={c.isExcluded ? 'Excluded — click to include' : 'Included — click to exclude'}
                    style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--primary)' }}
                  />
                </TableCell>
                <TableCell style={{ textDecoration: c.isExcluded ? 'line-through' : 'none' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: c.isExcluded ? 'var(--muted-foreground)' : 'var(--primary)' }}>{c.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>ID: {c.id.substring(0, 8)}...</div>
                </TableCell>
                <TableCell style={{ textDecoration: c.isExcluded ? 'line-through' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: c.isExcluded ? 'var(--muted-foreground)' : 'inherit' }}>
                    <MapPin size={14} color="var(--muted-foreground)" />
                    {c.location || 'N/A'}
                  </div>
                </TableCell>
                <TableCell style={{ textAlign: 'right', fontWeight: 700, color: c.isExcluded ? 'var(--muted-foreground)' : 'var(--foreground)', fontVariantNumeric: 'tabular-nums', textDecoration: c.isExcluded ? 'line-through' : 'none' }}>
                  ₱{(c.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
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
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(c.id);
                    }}
                    style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.5rem' }}
                    onMouseOver={(e) => e.currentTarget.style.color = 'var(--destructive)'}
                    onMouseOut={(e) => e.currentTarget.style.color = '#a1a1aa'}
                    title="Delete Campus"
                  >
                    <Trash2 size={16} />
                  </button>
                </TableCell>
              </TableRow>
            )})}
            
            {paddingBottom > 0 && (
              <tr style={{ height: `${paddingBottom}px`, border: 'none' }}>
                <td colSpan={4} style={{ padding: 0, border: 0 }}>
                  <div style={{ height: `${paddingBottom}px` }} />
                </td>
              </tr>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Campus</DialogTitle></DialogHeader>
          <DialogBody>
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
          </DialogBody>
          <DialogFooter>
            <Button onClick={handleEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
