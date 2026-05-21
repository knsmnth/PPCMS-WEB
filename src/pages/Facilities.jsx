import React, { useState, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCollection } from '../hooks/useData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogBody, DialogFooter } from '../components/ui/dialog';
import { Building, Plus, ArrowLeft, Edit2, Trash2, Search, Download, Upload, ChevronDown } from 'lucide-react';
import { cascadeDelete } from '../lib/cascade';
import { SelectCombo } from '../components/ui/select-combo';
import { useVirtualizer } from '@tanstack/react-virtual';
import { recomputeCampusCost } from '../lib/billing';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export default function Facilities() {
  const [searchParams] = useSearchParams();
  const campusId = searchParams.get('campusId');
  const query = campusId ? [{ field: 'campusId', operator: '==', value: campusId }] : [];
  
  const { data: facilities, createItem, updateItem, refresh, deleteItem } = useCollection('facilities', query);
  const { data: campuses } = useCollection('campuses');
  const campus = campuses.find(c => c.id === campusId);
  
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [facilityNo, setFacilityNo] = useState('');
  const [address, setAddress] = useState('');
  const [selectedCampusId, setSelectedCampusId] = useState(campusId || '');

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');
  const [editFacilityNo, setEditFacilityNo] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCampusId, setEditCampusId] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const filteredData = useMemo(() => {
    let result = facilities.filter(f => 
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (f.type && f.type.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    if (sortConfig.key) {
      result.sort((a, b) => {
        let aValue = a[sortConfig.key] || '';
        let bValue = b[sortConfig.key] || '';

        if (sortConfig.key === 'totalCost') {
          aValue = Number(aValue);
          bValue = Number(bValue);
          if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        }

        const cmp = aValue.toString().localeCompare(bValue.toString(), undefined, { numeric: true, sensitivity: 'base' });
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [facilities, searchQuery, sortConfig]);

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
    await createItem({ id, campusId: selectedCampusId, name, type, facilityNo, address, totalCost: 0 });
    setName('');
    setType('');
    setFacilityNo('');
    setAddress('');
  };

  const handleEdit = async () => {
    if (!editName || !editingFacility || !editCampusId) return;
    await updateItem({
      ...editingFacility,
      name: editName,
      type: editType,
      facilityNo: editFacilityNo,
      address: editAddress,
      campusId: editCampusId
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

  const handleToggleExclude = async (e, facility) => {
    e.stopPropagation();
    const isNowExcluded = !facility.isExcluded;
    await updateItem({ ...facility, isExcluded: isNowExcluded });
    if (facility.campusId) {
      await recomputeCampusCost(facility.campusId);
    }
    refresh();
  };

  const fileInputRef = useRef(null);

  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Facilities');

      worksheet.columns = [
        { header: 'Facility Name', key: 'name', width: 25 },
        { header: 'Facility No.', key: 'facilityNo', width: 20 },
        { header: 'Classification', key: 'type', width: 25 },
        { header: 'Address', key: 'address', width: 35 },
      ];

      filteredData.forEach(item => {
        worksheet.addRow({
          name: item.name,
          facilityNo: item.facilityNo,
          type: item.type,
          address: item.address
        });
      });

      worksheet.getRow(1).font = { bold: true };
      
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Facilities_Export.xlsx`);
    } catch (e) {
      console.error(e);
      alert('Failed to export Excel.');
    }
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file);
      const worksheet = workbook.worksheets[0];
      
      if (!worksheet) {
        alert("No worksheets found in the Excel file.");
        return;
      }

      const headers = [];
      worksheet.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber] = cell.value;
      });

      const headerToField = {
        'Facility Name': 'name',
        'Facility No.': 'facilityNo',
        'Classification': 'type',
        'Address': 'address'
      };

      const existingFacilitiesSet = new Set(
        facilities.map(f => `${f.name?.toString().toLowerCase().trim()}|${(f.facilityNo || '').toString().toLowerCase().trim()}`)
      );

      let newCount = 0;
      for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        const item = { id: crypto.randomUUID(), campusId: selectedCampusId || campuses[0]?.id, totalCost: 0 };
        let hasData = false;
        
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber];
          const fieldName = headerToField[header];
          if (fieldName) {
            item[fieldName] = cell.value?.toString() || '';
            if (item[fieldName]) hasData = true;
          }
        });

        if (hasData && item.name) {
          const uniqueKey = `${item.name?.toString().toLowerCase().trim()}|${(item.facilityNo || '').toString().toLowerCase().trim()}`;
          if (!existingFacilitiesSet.has(uniqueKey)) {
            await createItem(item);
            existingFacilitiesSet.add(uniqueKey);
            newCount++;
          }
        }
      }

      if (newCount > 0) {
        alert(`Successfully imported ${newCount} facilities.`);
        refresh();
      } else {
        alert('No valid records found to import. Check column headers.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to import Excel file: ' + err.message);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };


  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: 'calc(100vh - 10rem)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexShrink: 0 }}>
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
          <Button variant="outline" size="md" onClick={handleExportExcel} title="Export to Excel">
            <Download size={18} /> Export
          </Button>
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleImportExcel} 
          />
          <Button variant="outline" size="md" onClick={() => fileInputRef.current?.click()} title="Import from Excel">
            <Upload size={18} /> Import
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus size={18} />
                Add Facility
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Facility</DialogTitle></DialogHeader>
              <DialogBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Campus Assignment</label>
                  <SelectCombo 
                    value={selectedCampusId} 
                    onChange={setSelectedCampusId}
                    options={campuses.map(c => ({ value: c.id, label: c.name }))}
                    placeholder="Select a campus..."
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Facility No.</label>
                  <Input placeholder="e.g. FAC-001" value={facilityNo} onChange={(e) => setFacilityNo(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Address</label>
                  <Input placeholder="e.g. Main Street" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
              </DialogBody>
              <DialogFooter>
                <DialogClose asChild>
                  <Button onClick={handleCreate} disabled={!selectedCampusId}>Register Facility</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div ref={parentRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
        <Table wrapperStyle={{ border: 'none', boxShadow: 'none', borderRadius: 0, height: '100%', overflowY: 'auto' }}>
          <TableHeader style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--background)' }}>
            <TableRow>
              <TableHead style={{ width: 40 }} />
              <TableHead onClick={() => handleSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  Facility Identity
                  <ChevronDown size={14} style={{ transform: sortConfig.key === 'name' && sortConfig.direction === 'asc' ? 'rotate(180deg)' : 'none', opacity: sortConfig.key === 'name' ? 1 : 0.4 }} />
                </div>
              </TableHead>
              <TableHead onClick={() => handleSort('facilityNo')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  Facility No.
                  <ChevronDown size={14} style={{ transform: sortConfig.key === 'facilityNo' && sortConfig.direction === 'asc' ? 'rotate(180deg)' : 'none', opacity: sortConfig.key === 'facilityNo' ? 1 : 0.4 }} />
                </div>
              </TableHead>
              <TableHead onClick={() => handleSort('type')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  Classification
                  <ChevronDown size={14} style={{ transform: sortConfig.key === 'type' && sortConfig.direction === 'asc' ? 'rotate(180deg)' : 'none', opacity: sortConfig.key === 'type' ? 1 : 0.4 }} />
                </div>
              </TableHead>
              <TableHead onClick={() => handleSort('address')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  Address
                  <ChevronDown size={14} style={{ transform: sortConfig.key === 'address' && sortConfig.direction === 'asc' ? 'rotate(180deg)' : 'none', opacity: sortConfig.key === 'address' ? 1 : 0.4 }} />
                </div>
              </TableHead>
              <TableHead onClick={() => handleSort('totalCost')} style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end' }}>
                  Cumulative Valuation
                  <ChevronDown size={14} style={{ transform: sortConfig.key === 'totalCost' && sortConfig.direction === 'asc' ? 'rotate(180deg)' : 'none', opacity: sortConfig.key === 'totalCost' ? 1 : 0.4 }} />
                </div>
              </TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted-foreground)' }}>
                  <Building size={32} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                  <p>{searchQuery ? "No facilities match your search." : "No facilities identified. Registered structures will appear here."}</p>
                </TableCell>
              </TableRow>
            )}

            {paddingTop > 0 && (
              <tr style={{ height: `${paddingTop}px`, border: 'none' }}>
                <td colSpan={6} style={{ padding: 0, border: 0 }}>
                  <div style={{ height: `${paddingTop}px` }} />
                </td>
              </tr>
            )}

            {virtualRows.map((virtualRow) => {
              const f = filteredData[virtualRow.index];
              return (
              <TableRow key={f.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} style={{ opacity: f.isExcluded ? 0.6 : 1 }}>
                <TableCell style={{ padding: '0.75rem 0.5rem', width: 40, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={!!f.isExcluded}
                    onChange={(e) => handleToggleExclude(e, f)}
                    onClick={e => e.stopPropagation()}
                    title={f.isExcluded ? 'Excluded — click to include' : 'Included — click to exclude'}
                    style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--primary)' }}
                  />
                </TableCell>
                <TableCell style={{ textDecoration: f.isExcluded ? 'line-through' : 'none' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: f.isExcluded ? 'var(--muted-foreground)' : 'var(--primary)' }}>{f.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>UID: {f.id.substring(0, 8)}...</div>
                </TableCell>
                <TableCell style={{ textDecoration: f.isExcluded ? 'line-through' : 'none' }}>
                  <div style={{ fontSize: '0.85rem', color: f.isExcluded ? 'var(--muted-foreground)' : 'var(--foreground)' }}>{f.facilityNo || '-'}</div>
                </TableCell>
                <TableCell style={{ textDecoration: f.isExcluded ? 'line-through' : 'none' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '1rem', backgroundColor: 'var(--secondary)', color: f.isExcluded ? 'var(--muted-foreground)' : 'var(--primary)', textTransform: 'uppercase' }}>
                    {f.type || 'Standard'}
                  </span>
                </TableCell>
                <TableCell style={{ textDecoration: f.isExcluded ? 'line-through' : 'none' }}>
                  <div style={{ fontSize: '0.85rem', color: f.isExcluded ? 'var(--muted-foreground)' : 'var(--foreground)' }}>{f.address || '-'}</div>
                </TableCell>
                <TableCell style={{ textAlign: 'right', fontWeight: 700, color: f.isExcluded ? 'var(--muted-foreground)' : 'var(--foreground)', textDecoration: f.isExcluded ? 'line-through' : 'none' }}>
                  ₱{(f.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button 
                    onClick={() => {
                      setEditingFacility(f);
                      setEditName(f.name);
                      setEditType(f.type || '');
                      setEditFacilityNo(f.facilityNo || '');
                      setEditAddress(f.address || '');
                      setEditCampusId(f.campusId || '');
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
              <tr style={{ height: `${paddingBottom}px`, border: 'none' }}>
                <td colSpan={6} style={{ padding: 0, border: 0 }}>
                  <div style={{ height: `${paddingBottom}px` }} />
                </td>
              </tr>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Facility</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Campus Assignment</label>
              <SelectCombo 
                value={editCampusId} 
                onChange={setEditCampusId}
                options={campuses.map(c => ({ value: c.id, label: c.name }))}
                placeholder="Select a campus..."
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Facility Name</label>
              <Input placeholder="e.g. Science Laboratory" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Facility Category</label>
              <Input placeholder="e.g. Academic, Maintenance" value={editType} onChange={(e) => setEditType(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Facility No.</label>
              <Input placeholder="e.g. FAC-001" value={editFacilityNo} onChange={(e) => setEditFacilityNo(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Address</label>
              <Input placeholder="e.g. Main Street" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
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
