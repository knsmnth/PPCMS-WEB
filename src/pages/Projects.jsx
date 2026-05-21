import React, { useState, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCollection } from '../hooks/useData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogBody, DialogFooter } from '../components/ui/dialog';
import { Folder, Plus, Edit2, Trash2, Search, Copy, ChevronDown, ArrowRight, Download, Upload, Printer } from 'lucide-react';
import { cascadeDelete, cascadeDuplicateProject } from '../lib/cascade';
import { SelectCombo } from '../components/ui/select-combo';
import { Select } from '../components/ui/select';
import { useVirtualizer } from '@tanstack/react-virtual';
import { recomputeFacilityCost, recomputeProjectCostsDeep } from '../lib/billing';
import { exportProjectsToJson, importProjectsFromJson, saveItem } from '../lib/projectExport';
import { Database, FileJson, Loader2, CheckSquare, Square, Eye, EyeOff } from 'lucide-react';

export default function Projects() {
  const [searchParams] = useSearchParams();
  const facilityId = searchParams.get('facilityId');
  const query = facilityId ? [{ field: 'facilityId', operator: '==', value: facilityId }] : [];

  const { data: projects, createItem, updateItem, refresh } = useCollection('projects', query);
  const { data: facilities } = useCollection('facilities');
  const { data: campuses } = useCollection('campuses');
  const facility = facilityId ? facilities.find(f => f.id === facilityId) : null;
  const initialCampusId = facility ? facility.campusId : '';

  const navigate = useNavigate();

  // Create state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('Planning Phase');
  const [priority, setPriority] = useState('Medium');
  const [approvedBudget, setApprovedBudget] = useState('');
  const [selectedCampusId, setSelectedCampusId] = useState(initialCampusId);
  const [selectedFacilityId, setSelectedFacilityId] = useState(facilityId || '');

  const availableFacilities = facilities.filter(f => f.campusId === selectedCampusId);

  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editTotalCost, setEditTotalCost] = useState('');
  const [editApprovedBudget, setEditApprovedBudget] = useState('');
  const [editCampusId, setEditCampusId] = useState('');
  const [editFacilityId, setEditFacilityId] = useState('');
  const [editProjectCode, setEditProjectCode] = useState('');

  const availableEditFacilities = facilities.filter(f => f.campusId === editCampusId);

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'projectCode', direction: 'asc' });
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [yearFilter, setYearFilter] = useState('All');

  // Selection state
   const [selectedProjectIds, setSelectedProjectIds] = useState(new Set());
   const [isImporting, setIsImporting] = useState(false);
   const [importProgress, setImportProgress] = useState(0);
   const [dataOpsOpen, setDataOpsOpen] = useState(false);
   const dataOpsTimeoutRef = useRef(null);

  const jsonFileInputRef = useRef(null);

  const toggleSelection = (id) => {
    const next = new Set(selectedProjectIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedProjectIds(next);
  };

  const toggleAll = (visibleProjects) => {
    if (selectedProjectIds.size === visibleProjects.length) {
      setSelectedProjectIds(new Set());
    } else {
      setSelectedProjectIds(new Set(visibleProjects.map(p => p.id)));
    }
  };

  const handleJsonExport = async () => {
    if (selectedProjectIds.size === 0) {
      alert('Please select at least one project to export.');
      return;
    }
    await exportProjectsToJson(Array.from(selectedProjectIds));
    alert('Export completed successfully.');
  };

  const handleJsonImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportProgress(0);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          await importProjectsFromJson(event.target.result, (p) => setImportProgress(p));
          refresh();
        } catch (err) {
          alert('Failed to import JSON: ' + err.message);
        } finally {
          setIsImporting(false);
          setImportProgress(0);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error(err);
      setIsImporting(false);
    } finally {
      if (jsonFileInputRef.current) jsonFileInputRef.current.value = '';
    }
  };

  const handleRecalculateTotals = async () => {
    setIsImporting(true);
    setImportProgress(0);
    try {
      const targets = selectedProjectIds.size > 0 
        ? processedData.filter(p => selectedProjectIds.has(p.id)) 
        : processedData;
        
      for (let i = 0; i < targets.length; i++) {
        await recomputeProjectCostsDeep(targets[i].id);
        setImportProgress(Math.round(((i + 1) / targets.length) * 100));
      }
      refresh();
    } catch (e) {
      console.error(e);
      alert("Recalculation failed: " + e.message);
    } finally {
      setIsImporting(false);
      setImportProgress(0);
    }
  };

  const generateProjectCode = (existingProjects) => {
    const yearPrefix = new Date().getFullYear().toString().slice(-2);
    const thisYearProjects = existingProjects.filter(p => p.projectCode && p.projectCode.startsWith(yearPrefix + '.'));
    let maxNum = 0;
    thisYearProjects.forEach(p => {
      const parts = p.projectCode.split('.');
      if (parts.length === 2) {
        const num = parseInt(parts[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    return `${yearPrefix}.${String(maxNum + 1).padStart(3, '0')}`;
  };

  const normalizeMoneyInput = (value) => {
    const cleaned = String(value || '').replace(/,/g, '').replace(/[^\d.]/g, '');
    const [intPart = '', ...decimalParts] = cleaned.split('.');
    const normalizedInt = intPart.replace(/^0+(\d)/, '$1');

    if (decimalParts.length === 0) {
      return normalizedInt;
    }

    return `${normalizedInt || '0'}.${decimalParts.join('')}`;
  };

  const formatMoneyInput = (value) => {
    const normalized = normalizeMoneyInput(value);
    if (!normalized) return '';

    const [intPart, decimalPart] = normalized.split('.');
    const formattedInt = Number(intPart || 0).toLocaleString('en-US');
    return decimalPart !== undefined ? `${formattedInt}.${decimalPart}` : formattedInt;
  };

  const processedData = useMemo(() => {
    let result = projects.filter(p => {
      const matchesSearch = p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.projectCode?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = priorityFilter === 'All' || p.priority === priorityFilter;

      let matchesYear = true;
      if (yearFilter !== 'All') {
        const pYear = '20' + (p.projectCode?.split('.')[0] || '');
        if (pYear !== yearFilter) matchesYear = false;
      }

      return matchesSearch && matchesPriority && matchesYear;
    });

    if (sortConfig.key) {
      result.sort((a, b) => {
        let aValue = a[sortConfig.key] || '';
        let bValue = b[sortConfig.key] || '';

        if (['totalCost', 'approvedBudget'].includes(sortConfig.key)) {
          aValue = Number(aValue);
          bValue = Number(bValue);
          if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        }

        // Natural / locale-aware sort for all string keys (handles YY.NNN codes correctly)
        const cmp = aValue.toString().localeCompare(bValue.toString(), undefined, { numeric: true, sensitivity: 'base' });
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [projects, searchQuery, priorityFilter, yearFilter, sortConfig]);

  const parentRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: processedData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 10,
  });

   const virtualRows = rowVirtualizer.getVirtualItems();
   const totalSize = rowVirtualizer.getTotalSize();
   const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
   const paddingBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

   // Cleanup timeout on unmount
   React.useEffect(() => {
     return () => {
       if (dataOpsTimeoutRef.current) {
         clearTimeout(dataOpsTimeoutRef.current);
       }
     };
   }, []);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleCreate = async () => {
    if (!name || !selectedFacilityId) return;
    const id = crypto.randomUUID();
    const pCode = generateProjectCode(projects);
    const newProject = {
      id,
      facilityId: selectedFacilityId,
      name,
      description,
      status,
      priority,
      projectCode: pCode,
      totalCost: 0,
      approvedBudget: Number(approvedBudget),
      createdAt: Date.now(),
      statusHistory: [{
        status,
        changedAt: Date.now()
      }]
    };
    await createItem(newProject);
    refresh();
    setName('');
    setDescription('');
    setApprovedBudget('');
  };

  const handleEdit = async () => {
    if (!editName || !editingProject) return;

    const updates = {
      ...editingProject,
      name: editName,
      description: editDescription,
      status: editStatus,
      priority: editPriority,
      facilityId: editFacilityId,
      totalCost: Number(editTotalCost),
      approvedBudget: Number(editApprovedBudget),
      projectCode: editProjectCode
    };

    if (editingProject.status !== editStatus) {
      updates.statusHistory = [
        ...(editingProject.statusHistory || []),
        { status: editStatus, changedAt: Date.now() }
      ];
    }

    await updateItem(updates);
    refresh();
    setEditDialogOpen(false);
    setEditingProject(null);
  };

  const handleInlineStatusChange = async (e, project, newStatus) => {
    e.stopPropagation();
    if (project.status === newStatus) return;
    const updates = {
      ...project,
      status: newStatus,
      statusHistory: [
        ...(project.statusHistory || []),
        { status: newStatus, changedAt: Date.now() }
      ]
    };
    await updateItem(updates);
    refresh();
  };

  const handleInlinePriorityChange = async (e, project, newPriority) => {
    e.stopPropagation();
    if (project.priority === newPriority) return;
    await updateItem({ ...project, priority: newPriority });
    refresh();
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this project?")) {
      await cascadeDelete('project', id);
      refresh();
    }
  };

  const handleToggleExclude = async (e, project) => {
    e.stopPropagation();
    const isNowExcluded = !project.isExcluded;
    await updateItem({ ...project, isExcluded: isNowExcluded });
    if (project.facilityId) {
      await recomputeFacilityCost(project.facilityId);
    }
    refresh();
  };

  const handleDuplicate = async (e, project) => {
    e.stopPropagation();
    const newId = crypto.randomUUID();
    const pCode = generateProjectCode(projects);
    await cascadeDuplicateProject({
      sourceProjectId: project.id,
      newProjectPayload: {
        ...project,
        id: newId,
        projectCode: pCode,
        name: `${project.name} (Copy)`,
        createdAt: new Date().toISOString(),
        statusHistory: [{ status: project.status, changedAt: Date.now() }]
      }
    });
  };

  const fileInputRef = useRef(null);

const handleExportExcel = async () => {
     alert('Excel export has been removed. Please use JSON export instead.');
   };

   const handleImportExcel = async (e) => {
     alert('Excel import has been removed. Please use JSON import instead.');
   };

  const getPriorityColor = (level) => {
    switch (level?.toLowerCase()) {
      case 'low': return { bg: '#0ea5e9', text: '#ffffff' }; // Light Blue
      case 'medium': return { bg: '#22c55e', text: '#ffffff' }; // Green
      case 'high': return { bg: '#eab308', text: '#ffffff' }; // Yellow
      case 'very high': return { bg: '#dc2626', text: '#ffffff' }; // Red
      default: return { bg: '#71717a', text: '#ffffff' };
    }
  };

  const getStatusColor = (currentStatus) => {
    switch (currentStatus?.toLowerCase()) {
      case 'accepted': return { bg: '#3f3f46', text: '#ffffff' }; // Dark Grey
      case 'planning phase': return { bg: '#f59e0b', text: '#ffffff' };
      case 'on-going': return { bg: '#1e3a8a', text: '#ffffff' }; // Dark Blue from mockup
      case 'on review': return { bg: '#8b5cf6', text: '#ffffff' };
      case 'for submission': return { bg: '#6366f1', text: '#ffffff' };
      case 'closed': return { bg: '#10b981', text: '#ffffff' }; // Green
      default: return { bg: '#166534', text: '#ffffff' }; // Dark Green default
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: 'calc(100vh - 10rem)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--foreground)', letterSpacing: '-0.02em', margin: 0 }}>
            Project Overview
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
              <option value="All">All Years</option>
              <option value={new Date().getFullYear().toString()}>Current Year</option>
            </Select>
            <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="All">All Priorities</option>
              <option value="Very High">Very High</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </Select>
          </div>

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

            <div className="data-ops-dropdown" style={{ position: 'relative', display: 'inline-block' }}
              onMouseEnter={() => {
                if (dataOpsTimeoutRef.current) {
                  clearTimeout(dataOpsTimeoutRef.current);
                  dataOpsTimeoutRef.current = null;
                }
                setDataOpsOpen(true);
              }}
              onMouseLeave={() => {
                dataOpsTimeoutRef.current = setTimeout(() => {
                  setDataOpsOpen(false);
                }, 200);
              }}
            >
              <Button variant="outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database size={18} />
                <span>Data Ops</span>
                <ChevronDown size={14} />
              </Button>
            <div className="dropdown-content" style={{
              display: dataOpsOpen ? 'block' : 'none',
              position: 'absolute',
              right: 0,
              top: '100%',
              backgroundColor: 'white',
              boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
              zIndex: 100,
              minWidth: '220px',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              marginTop: '0.5rem',
              padding: '0.5rem'
            }}>
              <p style={{ margin: '0.5rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>JSON Exchange (Deep Copy)</p>
              <button 
                onClick={handleJsonExport}
                style={{ width: '100%', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '4px', textAlign: 'left', fontSize: '0.85rem' }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--secondary)'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Download size={16} /> 
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span>Export Selection ({selectedProjectIds.size})</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>Full structure backup</span>
                </div>
              </button>
              <button 
                onClick={() => jsonFileInputRef.current?.click()}
                style={{ width: '100%', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '4px', textAlign: 'left', fontSize: '0.85rem' }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--secondary)'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Upload size={16} /> 
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span>Import Project JSON</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>Restore from .json file</span>
                </div>
               </button>

               <p style={{ margin: '1rem 0.5rem 0.5rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>Maintenance Tools</p>
               <button 
                 onClick={handleRecalculateTotals}
                 style={{ width: '100%', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '4px', textAlign: 'left', fontSize: '0.85rem' }}
                 onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--secondary)'}
                 onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
               >
                 <Database size={16} /> 
                 <div style={{ display: 'flex', flexDirection: 'column' }}>
                   <span>Recalculate Costs</span>
                   <span style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>Fix stale DB totals</span>
                 </div>
               </button>
             </div>
           </div>
          <input type="file" accept=".json" ref={jsonFileInputRef} style={{ display: 'none' }} onChange={handleJsonImport} />

          <Dialog>
            <DialogTrigger asChild>
              <Button style={{ backgroundColor: '#092e20', color: 'white' }}>
                <Plus size={18} />
                Initialize Project
              </Button>
            </DialogTrigger>
            <DialogContent onInteractOutside={(e) => e.preventDefault()}>
              <DialogHeader><DialogTitle>New Project Specification</DialogTitle></DialogHeader>
              <DialogBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Campus</label>
                  <SelectCombo
                    value={selectedCampusId}
                    onChange={(val) => {
                      setSelectedCampusId(val);
                      setSelectedFacilityId('');
                    }}
                    options={campuses.map(c => ({ value: c.id, label: c.name }))}
                    placeholder="Select campus..."
                    disabled={false}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Facility</label>
                  <SelectCombo
                    value={selectedFacilityId}
                    onChange={setSelectedFacilityId}
                    options={availableFacilities.map(f => ({ value: f.id, label: f.name }))}
                    placeholder="Select facility..."
                    disabled={!selectedCampusId}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Project Name</label>
                  <Input placeholder="e.g. Total Renovation" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Project Description</label>
                  <Input placeholder="e.g. Replacement of roofing..." value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Priority</label>
                    <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Very High">Very High</option>
                    </Select>
                  </div>
                  <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Status</label>
                    <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option value="Accepted">Accepted</option>
                      <option value="Planning Phase">Planning Phase</option>
                      <option value="On-Going">On-Going</option>
                      <option value="On Review">On Review</option>
                      <option value="For Submission">For Submission</option>
                      <option value="Closed">Closed</option>
                    </Select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Approved Budget (Php)</label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={formatMoneyInput(approvedBudget)}
                      onChange={(e) => setApprovedBudget(normalizeMoneyInput(e.target.value))}
                    />
                  </div>
                </div>
              </DialogBody>
              <DialogFooter>
                <DialogClose asChild><Button onClick={handleCreate} disabled={!selectedFacilityId}>Create Project Instance</Button></DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div ref={parentRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: 'var(--radius)', border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}>
        <Table wrapperStyle={{ border: 'none', boxShadow: 'none', borderRadius: 0, height: '100%', overflowY: 'auto' }}>
          <TableHeader style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--background)', borderBottom: '1px solid var(--border)' }}>
            <TableRow>
              <TableHead style={{ width: 40 }}>
                <div 
                  style={{ cursor: 'pointer', display: 'flex', justifyContent: 'center' }} 
                  onClick={() => toggleAll(processedData)}
                  title="Select multiple for export/bulk actions"
                >
                  {selectedProjectIds.size === processedData.length && processedData.length > 0 ? <CheckSquare size={18} color="var(--primary)" /> : <Square size={18} color="var(--muted-foreground)" />}
                </div>
              </TableHead>
              <TableHead style={{ width: 40, textAlign: 'center', fontSize: '0.65rem', fontWeight: 800, color: 'var(--muted-foreground)' }}>
                INC.
              </TableHead>
              <TableHead onClick={() => handleSort('projectCode')} style={{ cursor: 'pointer', textAlign: 'center', width: '120px', fontWeight: 700, fontSize: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                  PROJECT CODE <ChevronDown size={14} style={{ opacity: 0.5, transition: 'transform 0.2s', transform: sortConfig.key === 'projectCode' && sortConfig.direction === 'asc' ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </div>
              </TableHead>
              <TableHead style={{ fontWeight: 700, fontSize: '0.75rem', width: '35%' }}>PROJECT NAME &amp; DESCRIPTION</TableHead>
              <TableHead onClick={() => handleSort('priority')} style={{ cursor: 'pointer', textAlign: 'center', fontWeight: 700, fontSize: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                  PROJECT PRIORITY <ChevronDown size={14} style={{ opacity: 0.5, transition: 'transform 0.2s', transform: sortConfig.key === 'priority' && sortConfig.direction === 'asc' ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </div>
              </TableHead>
              <TableHead style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.75rem' }}>PROJECT STATUS</TableHead>
              <TableHead style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.75rem' }}>TOTAL PROJECT COST</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {processedData?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} style={{ textAlign: 'center', padding: '4.5rem', color: 'var(--muted-foreground)' }}>
                  <Folder size={32} style={{ opacity: 0.15, marginBottom: '1.25rem' }} />
                  <p>{searchQuery ? "No projects match your search." : "No projects found."}</p>
                </TableCell>
              </TableRow>
            )}

            {paddingTop > 0 && (
              <tr style={{ height: `${paddingTop}px`, border: 'none' }}>
                <td colSpan={6} style={{ padding: 0, border: 0 }}></td>
              </tr>
            )}

            {virtualRows.map((virtualRow) => {
              const p = processedData[virtualRow.index];
              const pFacility = facilities.find(f => f.id === p.facilityId);
              const pColor = getPriorityColor(p.priority);
              const sColor = getStatusColor(p.status);

              return (
                <TableRow
                  key={p.id}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  style={{ 
                    cursor: 'pointer', 
                    opacity: p.isExcluded ? 0.6 : 1,
                    backgroundColor: selectedProjectIds.has(p.id) ? 'var(--secondary)' : 'transparent'
                  }}
                  onClick={() => navigate(`/schedules?projectId=${p.id}`)}
                  className="hover:bg-muted/50"
                >
                  <TableCell onClick={(e) => { e.stopPropagation(); toggleSelection(p.id); }} style={{ width: 40, textAlign: 'center' }}>
                    <div title="Mark for Export">
                      {selectedProjectIds.has(p.id) ? <CheckSquare size={18} color="#2563eb" /> : <Square size={18} color="#d1d5db" />}
                    </div>
                  </TableCell>
                  <TableCell style={{ width: 40, textAlign: 'center' }} onClick={(e) => { e.stopPropagation(); handleToggleExclude(e, p); }}>
                    <div title={p.isExcluded ? 'Currently EXCLUDED from totals. Click to include.' : 'Currently INCLUDED in totals. Click to exclude.'}>
                      {p.isExcluded ? <EyeOff size={18} color="#ef4444" style={{ opacity: 0.8 }} /> : <Eye size={18} color="#10b981" />}
                    </div>
                  </TableCell>
                  <TableCell style={{ textAlign: 'center', fontWeight: 800, fontSize: '1.1rem', color: p.isExcluded ? 'var(--muted-foreground)' : '#092e20', textDecoration: p.isExcluded ? 'line-through' : 'none' }}>
                    {p.projectCode || '---'}
                  </TableCell>
                  <TableCell style={{ textDecoration: p.isExcluded ? 'line-through' : 'none' }}>
                    <div style={{ fontWeight: 800, fontSize: '1.35rem', color: p.isExcluded ? 'var(--muted-foreground)' : '#092e20', marginBottom: '0.1rem', letterSpacing: '-0.02em', lineHeight: '1.2' }}>{p.name}</div>
                    <div style={{ fontSize: '0.9rem', color: p.isExcluded ? 'var(--muted-foreground)' : '#26513A', fontWeight: 500, marginBottom: '0.15rem' }}>
                      {pFacility ? `${pFacility.name} (${pFacility.id?.substring(0, 8).toUpperCase()})` : 'Unknown Facility'}
                    </div>
                    {p.description && (
                      <div style={{ fontSize: '0.85rem', color: p.isExcluded ? 'var(--muted-foreground)' : '#a1a1aa', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4' }}>
                        {p.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                      <select
                        value={p.priority || 'Medium'}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleInlinePriorityChange(e, p, e.target.value)}
                        style={{
                          appearance: 'none',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '0.3rem 1.6rem 0.3rem 0.7rem',
                          borderRadius: '0.2rem',
                          backgroundColor: pColor.bg,
                          color: pColor.text,
                          border: 'none',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Very High">Very High</option>
                      </select>
                      <ChevronDown size={14} style={{ position: 'absolute', right: '0.4rem', pointerEvents: 'none', color: pColor.text, opacity: 0.8 }} />
                    </div>
                  </TableCell>
                  <TableCell style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                      <select
                        value={p.status || 'Planning Phase'}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleInlineStatusChange(e, p, e.target.value)}
                        style={{
                          appearance: 'none',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '0.3rem 1.6rem 0.3rem 0.7rem',
                          borderRadius: '0.2rem',
                          backgroundColor: sColor.bg,
                          color: sColor.text,
                          border: 'none',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="Accepted">Accepted</option>
                        <option value="Planning Phase">Planning Phase</option>
                        <option value="On-Going">On-Going</option>
                        <option value="On Review">On Review</option>
                        <option value="For Submission">For Submission</option>
                        <option value="Closed">Closed</option>
                      </select>
                      <ChevronDown size={14} style={{ position: 'absolute', right: '0.4rem', pointerEvents: 'none', color: sColor.text, opacity: 0.8 }} />
                    </div>
                  </TableCell>
                  <TableCell style={{ textAlign: 'center', padding: '0.5rem', textDecoration: p.isExcluded ? 'line-through' : 'none' }}>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: p.isExcluded ? 'var(--muted-foreground)' : 'var(--primary)' }}>
                      ₱{(p.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', fontWeight: 500, marginTop: '0.1rem' }}>
                      ₱{(p.approvedBudget || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </TableCell>
                  <TableCell style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center', height: '100%' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/print/cost-estimates?projectId=${p.id}`); }}
                      style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.25rem' }}
                      onMouseOver={(e) => e.currentTarget.style.color = 'var(--primary)'}
                      onMouseOut={(e) => e.currentTarget.style.color = '#a1a1aa'}
                      title="Print Cost Estimates"
                    >
                      <Printer size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingProject(p);
                        setEditName(p.name || '');
                        setEditDescription(p.description || '');
                        setEditStatus(p.status || 'Planning Phase');
                        setEditPriority(p.priority || 'Medium');
                        const f = facilities.find(fac => fac.id === p.facilityId);
                        setEditCampusId(f ? f.campusId : '');
                        setEditFacilityId(p.facilityId || '');
                        setEditTotalCost(String(p.totalCost ?? ''));
                        setEditApprovedBudget(String(p.approvedBudget ?? ''));
                        setEditProjectCode(p.projectCode || '');
                        setEditDialogOpen(true);
                      }}
                      style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.25rem' }}
                      title="Edit Project"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, p.id)}
                      style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.25rem' }}
                      onMouseOver={(e) => e.currentTarget.style.color = 'var(--destructive)'}
                      onMouseOut={(e) => e.currentTarget.style.color = '#d4d4d8'}
                      title="Delete Project"
                    >
                      <Trash2 size={16} />
                    </button>
                    <button
                      onClick={(e) => handleDuplicate(e, p)}
                      style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.25rem' }}
                      title="Duplicate Project"
                    >
                      <Copy size={16} />
                    </button>
                  </TableCell>
                </TableRow>
              )
            })}

            {paddingBottom > 0 && (
              <tr style={{ height: `${paddingBottom}px`, border: 'none' }}>
                <td colSpan={6} style={{ padding: 0, border: 0 }}></td>
              </tr>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>Edit Project details</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Campus</label>
              <SelectCombo
                value={editCampusId}
                onChange={(val) => {
                  setEditCampusId(val);
                  setEditFacilityId('');
                }}
                options={campuses.map(c => ({ value: c.id, label: c.name }))}
                placeholder="Select campus..."
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Facility</label>
              <SelectCombo
                value={editFacilityId}
                onChange={setEditFacilityId}
                options={availableEditFacilities.map(f => ({ value: f.id, label: f.name }))}
                placeholder="Select facility..."
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Project Code</label>
              <Input value={editProjectCode} onChange={(e) => setEditProjectCode(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Project Name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Description</label>
              <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Priority</label>
                <Select value={editPriority} onChange={(e) => setEditPriority(e.target.value)}>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Very High">Very High</option>
                </Select>
              </div>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Status</label>
                <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                  <option value="Accepted">Accepted</option>
                  <option value="Planning Phase">Planning Phase</option>
                  <option value="On-Going">On-Going</option>
                  <option value="On Review">On Review</option>
                  <option value="For Submission">For Submission</option>
                  <option value="Closed">Closed</option>
                </Select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Total Cost</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formatMoneyInput(editTotalCost)}
                  onChange={(e) => setEditTotalCost(normalizeMoneyInput(e.target.value))}
                />
              </div>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Approved Budget</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formatMoneyInput(editApprovedBudget)}
                  onChange={(e) => setEditApprovedBudget(normalizeMoneyInput(e.target.value))}
                />
              </div>
            </div>

            {editingProject?.statusHistory && editingProject.statusHistory.length > 0 && (
              <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--foreground)' }}>Status History</label>
                <ul style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
                  {editingProject.statusHistory.map((sh, idx) => (
                    <li key={idx} style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', display: 'flex', justifyContent: 'space-between', backgroundColor: '#f4f4f5', padding: '0.5rem', borderRadius: '0.25rem' }}>
                      <strong>{sh.status}</strong>
                      <span>{new Date(sh.changedAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </DialogBody>
          <DialogFooter>
            <Button onClick={handleEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {isImporting && (
        <div style={{ 
          position: 'fixed', 
          inset: 0, 
          background: 'rgba(255,255,255,0.8)', 
          backdropFilter: 'blur(4px)', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 9999 
        }}>
          <Loader2 className="animate-spin" size={48} color="var(--primary)" />
          <p style={{ marginTop: '1rem', fontWeight: 700, fontSize: '1.25rem' }}>Importing Projects... {importProgress}%</p>
          <div style={{ width: '300px', height: '8px', background: 'var(--secondary)', borderRadius: '4px', marginTop: '1rem', overflow: 'hidden' }}>
            <div style={{ width: `${importProgress}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.3s ease' }} />
          </div>
          <p style={{ marginTop: '0.5rem', color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>Bypassing cloud limits via chunking logic...</p>
        </div>
      )}
    </div>
  );
}
