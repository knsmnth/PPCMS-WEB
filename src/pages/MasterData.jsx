import React, { useState, useRef } from 'react';
import { useCollection } from '../hooks/useData';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '../components/ui/dialog';
import { Package, Plus, Trash2, Search, Info, Users, Wrench, History, Edit2 } from 'lucide-react';

function MasterDataManager({ collectionName, title, fields, icon: Icon }) {
  const { data, createItem, updateItem, deleteItem } = useCollection(collectionName);
  const [formData, setFormData] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [newPrice, setNewPrice] = useState('');

  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState(null);

  const handleCreate = async () => {
    const id = crypto.randomUUID();
    const payload = { id, ...formData, createdAt: new Date().toISOString() };
    
    let initialPrice = 0;
    if (payload.currentPrice) {
      payload.currentPrice = Number(payload.currentPrice);
      initialPrice = payload.currentPrice;
    }
    if (payload.currentRate) {
      payload.currentRate = Number(payload.currentRate);
      initialPrice = payload.currentRate;
    }

    payload.priceHistory = [{ price: initialPrice, date: payload.createdAt }];

    await createItem(payload);
    setFormData({});
  };

  const handleUpdatePrice = async () => {
    if (!selectedItem || !newPrice) return;
    const isRate = fields.some(f => f.name === 'currentRate');
    const priceField = isRate ? 'currentRate' : 'currentPrice';
    
    const updatedPrice = Number(newPrice);
    const historyEntry = {
      price: updatedPrice,
      date: new Date().toISOString()
    };
    
    const currentHistory = selectedItem.priceHistory || [];
    
    await updateItem({
      ...selectedItem,
      [priceField]: updatedPrice,
      priceHistory: [historyEntry, ...currentHistory]
    });
    
    setUpdateDialogOpen(false);
    setSelectedItem(null);
    setNewPrice('');
  };

  const filteredData = data.filter(item => 
    Object.values(item).some(val => 
      String(val).toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.03em' }}>{title}</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.925rem', marginTop: '0.25rem' }}>Central registry for standardized project line-items and cost baselines.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ position: 'relative', width: '240px' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
            <Input 
              style={{ paddingLeft: '2.25rem', height: '2.5rem' }}
              placeholder="Filter registry..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Dialog>
            <DialogTrigger asChild><Button size="md"><Plus size={18} />New Entry</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Register Master Data Asset</DialogTitle></DialogHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
                {fields.map(f => (
                  <div key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>{f.label}</label>
                    <Input 
                      type={f.type || 'text'}
                      placeholder={`e.g. ${f.label}`} 
                      value={formData[f.name] || ''} 
                      onChange={(e) => setFormData({ ...formData, [f.name]: e.target.value })} 
                    />
                  </div>
                ))}
                <DialogClose asChild><Button onClick={handleCreate} style={{ marginTop: '0.5rem' }}>Commit to Registry</Button></DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div style={{ borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <VirtualizedMasterDataTable 
          filteredData={filteredData} 
          fields={fields} 
          title={title} 
          Icon={Icon} 
          setSelectedItem={setSelectedItem} 
          setUpdateDialogOpen={setUpdateDialogOpen} 
          setHistoryItem={setHistoryItem} 
          setHistoryDialogOpen={setHistoryDialogOpen} 
          deleteItem={deleteItem} 
        />
      </div>

      {/* Update Price Dialog */}
      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Price / Rate</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Updating price for: <strong style={{color: 'var(--primary)'}}>{selectedItem?.name}</strong></p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>New Price (₱)</label>
              <Input type="number" placeholder="Enter new amount" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
            </div>
            <Button onClick={handleUpdatePrice} style={{ marginTop: '0.5rem' }}>Save Update</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Price History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Price History</DialogTitle></DialogHeader>
          <div style={{ marginTop: '1.5rem', maxHeight: '400px', overflowY: 'auto' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '1rem' }}>Historical pricing for: <strong style={{color: 'var(--primary)'}}>{historyItem?.name}</strong></p>
            {historyItem?.priceHistory && historyItem.priceHistory.length > 0 ? (
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date Recorded</TableHead>
                      <TableHead style={{ textAlign: 'right' }}>Price / Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyItem.priceHistory.map((entry, idx) => (
                      <TableRow key={idx}>
                        <TableCell style={{ fontSize: '0.85rem' }}>{new Date(entry.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</TableCell>
                        <TableCell style={{ textAlign: 'right', fontWeight: 600, color: 'var(--primary)' }}>₱{entry.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)', border: '1px dashed var(--border)', borderRadius: 'var(--radius)' }}>
                No price history records found.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function MaterialCatalog() {
  return <MasterDataManager title="Material Inventory" collectionName="materials" icon={Package} fields={[
    { name: 'name', label: 'Asset Name' },
    { name: 'specs', label: 'Technical Specifications' },
    { name: 'unit', label: 'Stock Unit' },
    { name: 'currentPrice', label: 'Current Base Price (₱)', type: 'number' }
  ]} />;
}

export function EquipmentManager() {
  return <MasterDataManager title="Equipment Registry" collectionName="equipments" icon={Wrench} fields={[
    { name: 'name', label: 'Equipment Model' },
    { name: 'specs', label: 'Performance Specs' },
    { name: 'currentPrice', label: 'Daily Rental / Rate (₱)', type: 'number' }
  ]} />;
}

export function LaborManager() {
  return <MasterDataManager title="Human Capital" collectionName="laborTypes" icon={Users} fields={[
    { name: 'name', label: 'Personnel Role' },
    { name: 'currentRate', label: 'Standard Rate (₱)', type: 'number' }
  ]} />;
}

export function VirtualizedMasterDataTable({ filteredData, fields, title, Icon, setSelectedItem, setUpdateDialogOpen, setHistoryItem, setHistoryDialogOpen, deleteItem }) {
  const parentRef = React.useRef(null);

  const rowVirtualizer = useVirtualizer({
    count: filteredData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50, // estimated row height in px
    overscan: 50,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  return (
    <div ref={parentRef} style={{ maxHeight: '600px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
      <Table wrapperStyle={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
        <TableHeader style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--background)' }}>
          <TableRow>
            {fields.map(f => <TableHead key={f.name}>{f.label}</TableHead>)}
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredData.length === 0 && (
            <TableRow>
              <TableCell colSpan={fields.length + 1} style={{ textAlign: 'center', padding: '4.5rem', color: 'var(--muted-foreground)' }}>
                <Icon size={32} style={{ opacity: 0.1, marginBottom: '1rem' }} />
                <p>No records identified in the {title}. Add new entries to populate the registry.</p>
              </TableCell>
            </TableRow>
          )}

          {paddingTop > 0 && (
            <TableRow>
              <TableCell colSpan={fields.length + 1} style={{ height: `${paddingTop}px`, padding: 0, border: 0 }} />
            </TableRow>
          )}

          {virtualRows.map((virtualRow) => {
            const item = filteredData[virtualRow.index];
            return (
              <TableRow 
                key={item.id} 
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
              >
                {fields.map(f => (
                  <TableCell key={f.name}>
                    {f.name === 'currentPrice' || f.name === 'currentRate' 
                      ? <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>₱{(item[f.name] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      : f.name === 'name' ? <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{item[f.name]}</span>
                      : item[f.name]}
                  </TableCell>
                ))}
                <TableCell style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button 
                    onClick={() => { setSelectedItem(item); setUpdateDialogOpen(true); }}
                    style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.5rem' }}
                    title="Update Price"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => { setHistoryItem(item); setHistoryDialogOpen(true); }}
                    style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.5rem' }}
                    title="Price History"
                  >
                    <History size={16} />
                  </button>
                  <button 
                    onClick={() => deleteItem(item.id)}
                    style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.5rem' }}
                    onMouseOver={(e) => e.currentTarget.style.color = 'var(--destructive)'}
                    onMouseOut={(e) => e.currentTarget.style.color = '#a1a1aa'}
                    title="Delete Record"
                  >
                    <Trash2 size={16} />
                  </button>
                </TableCell>
              </TableRow>
            );
          })}
          
          {paddingBottom > 0 && (
            <TableRow>
              <TableCell colSpan={fields.length + 1} style={{ height: `${paddingBottom}px`, padding: 0, border: 0 }} />
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
