import React, { useState, useRef, useMemo } from 'react';
import { useCollection } from '../hooks/useData';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogBody, DialogFooter } from '../components/ui/dialog';
import { Package, Plus, Trash2, Search, Info, Users, Wrench, History, Edit2, ChevronDown, Download, Upload } from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

function MasterDataManager({ collectionName, title, fields, icon: Icon }) {
  const { data, createItem, updateItem, deleteItem } = useCollection(collectionName);
  const [formData, setFormData] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState(null);

  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const fileInputRef = useRef(null);

  const handleSort = (key) => {
    const field = fields.find(f => f.name === key);
    if (field && field.sortable === false) return;
    
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

   const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(title);

      worksheet.columns = fields.map(f => ({ header: f.label, key: f.name, width: 25 }));

      data.forEach(item => {
        const row = {};
        fields.forEach(f => {
          row[f.name] = item[f.name];
        });
        worksheet.addRow(row);
      });

      worksheet.getRow(1).font = { bold: true };
      
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `${title.replace(/\\s+/g, '_')}_Export.xlsx`);
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

      const normalizeHeader = (str) => {
        if (!str) return '';
        return str.toString()
          .toLowerCase()
          .replace(/\s+/g, '')                  // Remove all whitespace
          .replace(/\([^)]*\)/g, '')            // Remove anything inside parentheses like (₱)
          .replace(/[^a-z0-9]/g, '')            // Remove special characters
          .replace(/specifications?$/, 'spec'); // Normalize specification/specifications to spec
      };

      const headerRow = worksheet.getRow(1);
      const headers = [];
      headerRow.eachCell((cell, colNumber) => {
        headers[colNumber] = normalizeHeader(cell.value);
      });

      const headerToField = {};
      fields.forEach(f => {
        headerToField[normalizeHeader(f.label)] = f.name;
      });

      // Generate a unique key using name and optional itemCode
      const getUniqueKey = (item) => {
        const namePart = item.name?.toString().toLowerCase().trim() || '';
        const codePart = item.itemCode?.toString().toLowerCase().trim() || '';
        return codePart ? `${namePart}|${codePart}` : namePart;
      };

      const existingItemsMap = new Map(
        data.map(d => [getUniqueKey(d), d])
      );

      const itemsToCreate = [];
      const itemsToUpdate = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const rowData = {};
        let hasData = false;
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber];
          const fieldName = headerToField[header];
          if (fieldName) {
            let val = cell.value;
            if (val && typeof val === 'object') {
              if ('result' in val) val = val.result;
              else if ('text' in val) val = val.text;
            }
            rowData[fieldName] = val;
            hasData = true;
          }
        });

        if (hasData && rowData.name) {
          const key = getUniqueKey(rowData);
          const existingItem = existingItemsMap.get(key);

          if (existingItem) {
            itemsToUpdate.push({ existingItem, rowData });
          } else {
            itemsToCreate.push(rowData);
            // Put in map to avoid creating duplicates within the same sheet
            existingItemsMap.set(key, rowData);
          }
        }
      });

      let createdCount = 0;
      let updatedCount = 0;
      const updatedSummaryIds = new Set();
      let summaryItemsUpdated = false;

      // Imports for database & cascading recomputation
      const { getAllFromDB, putToDB, addToSyncQueue } = await import('../lib/db');
      const { recomputeSummaryCost } = await import('../lib/billing');
      const allSummaryItems = await getAllFromDB('summaryItems');

      // 1. Process updates
      const parseNumericValue = (val) => {
        if (val === null || val === undefined || val === '') return null;
        if (typeof val === 'number') return val;
        const cleaned = val.toString().replace(/[₱\$,\s]/g, '');
        const parsed = Number(cleaned);
        return isNaN(parsed) ? null : parsed;
      };

      for (const { existingItem, rowData } of itemsToUpdate) {
        // Normalize rates/prices
        if (rowData.currentPrice != null) rowData.currentPrice = parseNumericValue(rowData.currentPrice);
        if (rowData.currentRate != null) rowData.currentRate = parseNumericValue(rowData.currentRate);

        let hasChanges = false;
        const updatedFields = { ...existingItem };
        
        fields.forEach(f => {
          if (f.name === 'name' || f.name === 'itemCode') return; // Match keys are not modified via import
          if (rowData[f.name] !== undefined) {
            const oldVal = existingItem[f.name];
            const newVal = rowData[f.name];
            if (oldVal !== newVal) {
              updatedFields[f.name] = newVal;
              hasChanges = true;
            }
          }
        });

        if (hasChanges) {
          const isRate = fields.some(f => f.name === 'currentRate');
          const priceField = isRate ? 'currentRate' : 'currentPrice';
          const oldPrice = Number(existingItem[priceField] || 0);
          const newPrice = Number(updatedFields[priceField] || 0);

          if (newPrice !== oldPrice) {
            const historyEntry = { price: newPrice, date: new Date().toISOString() };
            updatedFields.priceHistory = [historyEntry, ...(existingItem.priceHistory || [])];
          }

          await updateItem(updatedFields);
          updatedCount++;

          // Handle cascading updates for summaryItems referencing this master data item
          if (newPrice !== oldPrice || existingItem.name !== updatedFields.name || existingItem.unit !== updatedFields.unit) {
            const affectedItems = allSummaryItems.filter(item => item.referenceId === existingItem.id);
            for (const item of affectedItems) {
              const qty = item.quantity || 1;
              const duration = item.duration || 1;
              const isGroupLabor = item.duration !== undefined;
              const newTotal = isGroupLabor ? (newPrice * duration * qty) : (newPrice * qty);
              const updateObj = { 
                ...item, 
                unitCost: newPrice,
                unitCostAtTimeOfAdding: newPrice, 
                totalCost: newTotal,
                updatedAt: new Date().toISOString()
              };
              if (updatedFields.name) updateObj.name = updatedFields.name;
              if (updatedFields.unit) updateObj.unit = updatedFields.unit;
              await putToDB('summaryItems', updateObj);
              await addToSyncQueue({ type: 'update', collection: 'summaryItems', payload: updateObj });
              updatedSummaryIds.add(item.summaryId);
              summaryItemsUpdated = true;
            }
          }
        }
      }

      // 2. Process creates
      for (const rowData of itemsToCreate) {
        if (rowData.currentPrice != null) rowData.currentPrice = parseNumericValue(rowData.currentPrice);
        if (rowData.currentRate != null) rowData.currentRate = parseNumericValue(rowData.currentRate);

        const newItem = { 
          id: crypto.randomUUID(), 
          ...rowData,
          createdAt: new Date().toISOString() 
        };
        
        let initialPrice = 0;
        if (newItem.currentPrice != null) {
          initialPrice = newItem.currentPrice;
        }
        if (newItem.currentRate != null) {
          initialPrice = newItem.currentRate;
        }
        newItem.priceHistory = [{ price: initialPrice, date: newItem.createdAt }];

        await createItem(newItem);
        createdCount++;
      }

      // 3. Recompute summaries if any affected summaryItems were updated
      if (summaryItemsUpdated) {
        window.dispatchEvent(new CustomEvent('localDataUpdated', { detail: 'summaryItems' }));
        window.dispatchEvent(new Event('triggerSync'));
        for (const sId of updatedSummaryIds) {
          await recomputeSummaryCost(sId);
        }
      }

      if (createdCount > 0 || updatedCount > 0) {
        alert(`Successfully imported: ${createdCount} created, ${updatedCount} updated.`);
      } else {
        alert('No new or modified records found to import.');
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

  const handleUpdateRecord = async () => {
    if (!selectedItem) return;
    
    const isRate = fields.some(f => f.name === 'currentRate');
    const priceField = isRate ? 'currentRate' : 'currentPrice';
    
    const currentPriceNum = Number(selectedItem[priceField] || 0);
    const newPriceNum = Number(editFormData[priceField] || 0);
    
    let historyUpdates = selectedItem.priceHistory || [];
    
    // Append to history ONLY if the price actually changed
    if (newPriceNum !== currentPriceNum) {
      const historyEntry = { price: newPriceNum, date: new Date().toISOString() };
      historyUpdates = [historyEntry, ...historyUpdates];
    }
    
    await updateItem({
      ...selectedItem,
      ...editFormData,
      [priceField]: newPriceNum,
      priceHistory: historyUpdates
    });
    
    if (newPriceNum !== currentPriceNum || selectedItem.name !== editFormData.name || selectedItem.unit !== editFormData.unit) {
      try {
        const { getAllFromDB, putToDB, addToSyncQueue } = await import('../lib/db');
        const { recomputeSummaryCost } = await import('../lib/billing');
        const allItems = await getAllFromDB('summaryItems');
        const affectedItems = allItems.filter(i => i.referenceId === selectedItem.id);
        const updatedSummaryIds = new Set();
        for (const item of affectedItems) {
          const qty = item.quantity || 1;
          const duration = item.duration || 1;
          const isGroupLabor = item.duration !== undefined;
          const newTotal = isGroupLabor ? (newPriceNum * duration * qty) : (newPriceNum * qty);
          const updateObj = { 
            ...item, 
            unitCost: newPriceNum,
            unitCostAtTimeOfAdding: newPriceNum, 
            totalCost: newTotal,
            updatedAt: new Date().toISOString()
          };
          if (editFormData.name) updateObj.name = editFormData.name;
          if (editFormData.unit) updateObj.unit = editFormData.unit;
          await putToDB('summaryItems', updateObj);
          await addToSyncQueue({ type: 'update', collection: 'summaryItems', payload: updateObj });
          updatedSummaryIds.add(item.summaryId);
        }
        if (affectedItems.length > 0) {
          window.dispatchEvent(new CustomEvent('localDataUpdated', { detail: 'summaryItems' }));
          window.dispatchEvent(new Event('triggerSync'));
        }
        for (const sId of updatedSummaryIds) {
          await recomputeSummaryCost(sId);
        }
      } catch (err) {
        console.error('Cascading updates to work details failed', err);
      }
    }
    
    setUpdateDialogOpen(false);
    setSelectedItem(null);
    setEditFormData({});
  };

  const processedData = useMemo(() => {
    let result = data.filter(item => 
      Object.values(item).some(val => 
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );

    if (sortConfig.key) {
      result.sort((a, b) => {
        let aValue = a[sortConfig.key] || '';
        let bValue = b[sortConfig.key] || '';

        if (['currentPrice', 'currentRate'].includes(sortConfig.key)) {
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
  }, [data, searchTerm, sortConfig]);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: 'calc(100vh - 10rem)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.03em' }}>{title}</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.925rem', marginTop: '0.25rem' }}>Central registry for standardized project line-items and cost baselines.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ position: 'relative', width: '240px' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
            <Input 
              style={{ paddingLeft: '2.25rem', height: '2.5rem' }}
              placeholder="Filter registry..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
            <DialogTrigger asChild><Button size="md"><Plus size={18} />New Entry</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Register Master Data Asset</DialogTitle></DialogHeader>
              <DialogBody>
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
              </DialogBody>
              <DialogFooter>
                <DialogClose asChild><Button onClick={handleCreate}>Commit to Registry</Button></DialogClose>
              </DialogFooter>
            </DialogContent>
           </Dialog>
         </div>
       </div>
       </header>

      <div style={{ flex: 1, minHeight: 0, borderRadius: 'var(--radius)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <VirtualizedMasterDataTable 
          filteredData={processedData} 
          fields={fields} 
          title={title} 
          Icon={Icon} 
          setSelectedItem={setSelectedItem} 
          setEditFormData={setEditFormData}
          setUpdateDialogOpen={setUpdateDialogOpen} 
          setHistoryItem={setHistoryItem} 
          setHistoryDialogOpen={setHistoryDialogOpen} 
          deleteItem={deleteItem}
          sortConfig={sortConfig}
          handleSort={handleSort}
        />
      </div>

      {/* Update Record Dialog */}
      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Record</DialogTitle></DialogHeader>
          <DialogBody>
            <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Updating record for: <strong style={{color: 'var(--primary)'}}>{selectedItem?.name}</strong></p>
            {fields.map(f => (
              <div key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>{f.label}</label>
                <Input 
                  type={f.type || 'text'}
                  placeholder={`e.g. ${f.label}`} 
                  value={editFormData[f.name] || ''} 
                  onChange={(e) => setEditFormData({ ...editFormData, [f.name]: e.target.value })} 
                />
              </div>
            ))}
          </DialogBody>
          <DialogFooter>
            <Button onClick={handleUpdateRecord}>Save Updates</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Price History</DialogTitle></DialogHeader>
          <DialogBody>
            <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Historical pricing for: <strong style={{color: 'var(--primary)'}}>{historyItem?.name}</strong></p>
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
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function MaterialsDescriptionAndPrices() {
  return <MasterDataManager title="Materials Description and Prices" collectionName="materials" icon={Package} fields={[
    { name: 'name', label: 'Asset Name' },
    { name: 'specs', label: 'Technical Specifications', sortable: false },
    { name: 'itemCode', label: 'Item Code' },
    { name: 'currentPrice', label: 'Current Base Price (₱)', type: 'number' },
    { name: 'unit', label: 'Unit', sortable: false }
  ]} />;
}


export function LaborManager() {
  return <MasterDataManager title="Human Capital" collectionName="laborTypes" icon={Users} fields={[
    { name: 'name', label: 'Personnel Role' },
    { name: 'currentRate', label: 'Standard Rate (₱)', type: 'number', sortable: false },
    { name: 'unit', label: 'Unit', sortable: false }
  ]} />;
}

export function VirtualizedMasterDataTable({ filteredData, fields, title, Icon, setSelectedItem, setEditFormData, setUpdateDialogOpen, setHistoryItem, setHistoryDialogOpen, deleteItem, sortConfig, handleSort }) {
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
    <div ref={parentRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
      <Table wrapperStyle={{ border: 'none', boxShadow: 'none', borderRadius: 0, height: '100%', overflowY: 'auto' }}>
        <TableHeader style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--background)' }}>
          <TableRow>
            {fields.map(f => {
              const isSortable = f.sortable !== false;
              return (
                <TableHead 
                  key={f.name}
                  onClick={() => isSortable && handleSort(f.name)}
                  style={{ cursor: isSortable ? 'pointer' : 'default', userSelect: 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {f.label}
                    {isSortable && (
                      <ChevronDown 
                        size={14} 
                        style={{ 
                          transform: sortConfig?.key === f.name && sortConfig.direction === 'asc' ? 'rotate(180deg)' : 'none', 
                          transition: 'transform 0.2s, opacity 0.2s', 
                          color: sortConfig?.key === f.name ? '#000000' : '#888888',
                          opacity: sortConfig?.key === f.name ? 1 : 0.4
                        }} 
                      />
                    )}
                  </div>
                </TableHead>
              );
            })}
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
            <tr style={{ height: `${paddingTop}px`, border: 'none' }}>
              <td colSpan={fields.length + 1} style={{ padding: 0, border: 0 }}>
                <div style={{ height: `${paddingTop}px` }} />
              </td>
            </tr>
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
                    onClick={() => { setSelectedItem(item); setEditFormData(item); setUpdateDialogOpen(true); }}
                    style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.5rem' }}
                    title="Edit Record"
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
            <tr style={{ height: `${paddingBottom}px`, border: 'none' }}>
              <td colSpan={fields.length + 1} style={{ padding: 0, border: 0 }}>
                <div style={{ height: `${paddingBottom}px` }} />
              </td>
            </tr>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
