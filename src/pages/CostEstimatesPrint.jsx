import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getAllFromDB } from '../lib/db';
import { Printer, FileText, ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import {
  formatNumber,
  buildHierarchicalSchedules,
  computeScheduleTotals,
  computeSummaryTotals,
  computeProjectPrintTotals,
  extractDisplayCode,
  indexToLetter,
} from '../lib/printUtils';

// ─── Injected print + screen CSS ─────────────────────────────────────────────

const PRINT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  @page { size: A4 landscape; margin: 10mm 12mm; }

  @media print {
    /* Hide the shell completely */
    body > * { display: none !important; }
    
    /* Bring back the print root with fully visible overflow */
    #cost-estimates-print-root { 
      display: block !important; 
      position: absolute !important; 
      top: 0 !important; 
      left: 0 !important; 
      width: 100% !important; 
      height: auto !important; 
      overflow: visible !important; 
      background: white !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    #cost-estimates-print-root .toolbar { display: none !important; }
    
    #print-content-wrapper {
      display: block !important;
      overflow: visible !important;
      width: 100% !important;
    }

    .page {
      box-shadow: none !important;
      margin: 0 !important;
      padding: 0 !important;
      border-radius: 0 !important;
      width: 100% !important;
      height: auto !important;
      page-break-after: always;
    }
    .page:last-child { page-break-after: avoid; }
    
    table { width: 100% !important; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr, .row-group { page-break-inside: avoid; }
    
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
`;

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
  scheduleHeader: '#c6e0b4', // same for both main + sub
  projectHeader: '#a9d18e',
  grandTotal: '#385d22',
  grandTotalText: '#ffffff',
  itemAlt: '#ffffff',
  border: '#cccccc',
  headerBg: '#ffffff',
};

// ─── Column widths ────────────────────────────────────────────────────────────
// 11 cols: scope | qty | unit | unit-cost | unit-total | mat-total | labor | equip | ocm | group-total | schedule-total
const COLS = ['30%', '4%', '4%', '6%', '6%', '7%', '7%', '6%', '7%', '9%', '9%'];

// ─── Colgroup ─────────────────────────────────────────────────────────────────
function Colgroup() {
  return (
    <colgroup>
      {COLS.map((w, i) => <col key={i} style={{ width: w }} />)}
    </colgroup>
  );
}

// ─── Table Header (repeats on every print page) ───────────────────────────────
function CostTableHeader() {
  const th = {
    background: C.headerBg,
    border: `0.2mm solid ${C.border}`,
    padding: '4px 5px',
    textAlign: 'center',
    fontWeight: 700,
    fontSize: '6.5pt',
    lineHeight: 1.25,
    color: '#000',
    verticalAlign: 'middle',
  };
  return (
    <thead>
      <tr>
        <th style={{ ...th, textAlign: 'left', paddingLeft: 7, borderLeft: 'none', borderRight: 'none', color: '#000' }} rowSpan={2}>
          SCOPE OF WORK &amp; MATERIAL SPECIFICATIONS
        </th>
        <th style={{ ...th, borderLeft: 'none', borderRight: 'none', color: '#000' }} rowSpan={2}>QTY</th>
        <th style={{ ...th, borderLeft: 'none', color: '#000' }} rowSpan={2}>UNIT</th>
        <th style={{ ...th, fontSize: '6pt' }} colSpan={3}>MATERIAL COST</th>
        <th style={{ ...th, fontSize: '6pt' }} rowSpan={2}>LABOR<br />COST</th>
        <th style={{ ...th, fontSize: '6pt' }} rowSpan={2}>EQUIPMENT<br />COST</th>
        <th style={{ ...th, fontSize: '5.5pt' }} rowSpan={2}>OVERHEAD,<br />CONTINGENCY,<br />MISCELLANEOUS<br />(15%)</th>
        <th style={{ ...th, fontSize: '6pt', borderRight: 'none' }} colSpan={2} rowSpan={2}>TOTAL COST<br />OF WORK</th>
      </tr>
      <tr>
        <th style={{ ...th, fontSize: '6pt' }}>UNIT COST</th>
        <th style={{ ...th, fontSize: '6pt' }}>UNIT TOTAL</th>
        <th style={{ ...th, fontSize: '6pt' }}>MATERIAL<br />TOTAL</th>
      </tr>
    </thead>
  );
}

// ─── Schedule group rows ──────────────────────────────────────────────────────
// Hierarchy: Schedule (level 0/1) → Summary/Work-Group → Items
function ScheduleGroup({ entry, allSummaries, allItems, project, materials }) {
  const { schedule, level, letterLabel } = entry;
  const t = computeScheduleTotals(schedule, allSummaries, allItems, project);
  const summaries = allSummaries
    .filter(s => s.scheduleOfWorkId === schedule.id && !s.isExcluded)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const displayCode = extractDisplayCode(schedule.workCode);
  const labelPrefix = letterLabel; // ALWAYS use letterLabel like A. or B. in printing as requested

  // ── Style tokens ──
  const schedTd = {
    border: `0.2mm solid ${C.border}`,
    padding: '3px 6px',
    verticalAlign: 'middle',
    background: C.projectHeader,
    fontWeight: 800,
    fontSize: level === 0 ? '7.5pt' : '7pt',
    color: '#000',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    overflow: 'hidden',
  };
  const groupTd = {
    border: `0.2mm solid ${C.border}`,
    padding: '2.5px 5px',
    verticalAlign: 'middle',
    background: C.scheduleHeader,
    fontWeight: 700,
    fontSize: '7pt',
    color: '#000',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    overflow: 'hidden',
  };
  const groupNumTd = { ...groupTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden' };
  const schedIndent = level === 1 ? { paddingLeft: 10 } : {};

  return (
    <>
      {/* ── Schedule header row: name spans left, total at far right ── */}
      <tr className="row-group">
        <td style={{ ...schedTd, ...schedIndent, borderLeft: 'none', borderRight: 'none' }}>
          {labelPrefix}&nbsp;{schedule.name}
        </td>
        {/* blank cols 2-10 merged */}
        <td colSpan={9} style={{ ...schedTd, borderLeft: 'none', borderRight: 'none' }} />
        {/* far-right: schedule total */}
        <td style={{ ...schedTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', borderLeft: 'none', borderRight: 'none' }}>
          {t.total > 0 ? formatNumber(t.total) : ''}
        </td>
      </tr>

      {/* ── Work groups (summaries) with their items ── */}
      {summaries.map((summary, sIdx) => {
        const st = computeSummaryTotals(summary, allItems, project);
        const items = allItems
          .filter(i => i.summaryId === summary.id && !i.isExcluded)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        const groupLabel = indexToLetter(sIdx).toLowerCase() + '.';

        return (
          <React.Fragment key={summary.id}>
            {/* Work-group header row */}
            <tr className="row-group">
              <td style={{ ...groupTd, paddingLeft: level === 1 ? 20 : 12, borderLeft: 'none', borderRight: 'none' }}>
                {groupLabel}&nbsp;{summary.name}
              </td>
              <td style={{ ...groupTd, borderLeft: 'none', borderRight: 'none' }} />
              <td style={{ ...groupTd, borderLeft: 'none', borderRight: 'none' }} />
              {/* unit cost + unit total blank */}
              <td colSpan={2} style={{ ...groupTd, borderLeft: 'none' }} />
              {/* cost breakdown */}
              <td style={groupNumTd}>{st.materialTotal > 0 ? formatNumber(st.materialTotal) : ''}</td>
              <td style={groupNumTd}>{st.laborTotal > 0 ? formatNumber(st.laborTotal) : ''}</td>
              <td style={groupNumTd}>{st.equipmentTotal > 0 ? formatNumber(st.equipmentTotal) : ''}</td>
              <td style={groupNumTd}>{st.ocmTotal > 0 ? formatNumber(st.ocmTotal) : ''}</td>
              {/* group total in col 10 */}
              <td style={{ ...groupNumTd }}>{st.total > 0 ? formatNumber(st.total) : ''}</td>
              {/* col 11 — no horizontal lines, left border closed */}
              <td style={{ ...groupTd, borderTop: 'none', borderBottom: 'none', borderLeft: `0.2mm solid ${C.border}`, borderRight: 'none', background: '#fff' }} />
            </tr>

            {/* Item rows */}
            {items.map((item, idx) => {
              const td = {
                border: `0.2mm solid ${C.border}`,
                padding: '2px 5px',
                verticalAlign: 'middle',
                background: '#fff',
                fontSize: '7pt',
                color: '#000',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                overflow: 'hidden',
              };
              const ndTd = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden' };
              const mat = materials?.find(m => m.id === item.referenceId);
              // Priority: Specs > Description > Item Name
              const displayName = mat?.specs || mat?.description || item.name;
              return (
                <tr key={item.id} className="row-group">
                  <td style={{ ...td, paddingLeft: level === 1 ? 32 : 24, borderLeft: 'none', borderRight: 'none' }}>
                    <span style={{ marginRight: 5 }}>{idx + 1}</span>{displayName}
                  </td>
                  <td style={{ ...td, textAlign: 'center', borderLeft: 'none', borderRight: 'none' }}>{item.quantity ?? ''}</td>
                  <td style={{ ...td, textAlign: 'center', fontStyle: 'italic', borderLeft: 'none' }}>
                    {item.duration ? `${item.unit ?? ''}/(${item.duration} days)` : (item.unit ?? '')}
                  </td>
                  <td style={ndTd}>{item.unitCostAtTimeOfAdding != null ? formatNumber(item.unitCostAtTimeOfAdding) : ''}</td>
                  <td style={ndTd}>{item.totalCost != null ? formatNumber(item.totalCost) : ''}</td>
                  {/* cols 6-10 blank */}
                  <td colSpan={5} style={{ background: '#fff', border: `0.2mm solid ${C.border}`, borderLeft: 'none', borderRight: 'none' }} />
                  {/* col 11 — no horizontal lines, left border closed */}
                  <td style={{ background: '#fff', borderTop: 'none', borderBottom: 'none', borderLeft: `0.2mm solid ${C.border}`, borderRight: 'none' }} />
                </tr>
              );
            })}
          </React.Fragment>
        );
      })}
    </>
  );
}

// ─── Single project print page ────────────────────────────────────────────────
function ProjectPage({ project, allSchedules, allSummaries, allItems, signatures, facilities, campuses, materials, isLast, targetScheduleId }) {
  let hier = buildHierarchicalSchedules(allSchedules, project.id, true);
  
  if (targetScheduleId) {
    const targetIdx = hier.findIndex(e => e.schedule.id === targetScheduleId);
    if (targetIdx !== -1) {
      const targetLevel = hier[targetIdx].level;
      let endIdx = targetIdx + 1;
      while (endIdx < hier.length && hier[endIdx].level > targetLevel) {
        endIdx++;
      }
      hier = hier.slice(targetIdx, endIdx);
    } else {
      hier = [];
    }
  }

  const zero = { materialTotal: 0, laborTotal: 0, equipmentTotal: 0, ocmTotal: 0 };
  const totals = hier.reduce((acc, entry) => {
    const t = computeScheduleTotals(entry.schedule, allSummaries, allItems, project);
    return {
      materialTotal: acc.materialTotal + t.materialTotal,
      laborTotal: acc.laborTotal + t.laborTotal,
      equipmentTotal: acc.equipmentTotal + t.equipmentTotal,
      ocmTotal: acc.ocmTotal + t.ocmTotal,
    };
  }, zero);
  totals.grandTotal = totals.materialTotal + totals.laborTotal + totals.equipmentTotal + totals.ocmTotal;
  
  const displayCode = extractDisplayCode(project.projectCode || '');

  const facility = facilities?.find(f => f.id === project.facilityId);
  const campus = facility ? campuses?.find(c => c.id === facility.campusId) : null;
  const locationString = [facility?.name, campus?.name].filter(Boolean).join(', ') || project.location;

  // Cell helpers
  const projTd = {
    border: `0.2mm solid ${C.border}`,
    padding: '4px 6px',
    background: C.projectHeader,
    fontWeight: 800,
    fontSize: '8pt',
    color: '#0d2208',
    verticalAlign: 'middle',
  };
  const grandTd = {
    border: `0.2mm solid ${C.grandTotal}`,
    padding: '5px 6px',
    background: C.grandTotal,
    color: C.grandTotalText,
    fontWeight: 800,
    fontSize: '8.5pt',
    verticalAlign: 'middle',
  };

  const pageStyle = {
    width: '277mm',
    minHeight: '185mm',
    background: '#fff',
    padding: '7mm 9mm',
    borderRadius: 2,
    boxShadow: '0 4px 24px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.3)',
    fontFamily: "'Inter', Arial, sans-serif",
    flexShrink: 0,
  };

  return (
    <div className="page" style={pageStyle}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ textAlign: 'center', fontWeight: 800, fontSize: '11pt', letterSpacing: '0.05em', color: '#0d2208', marginBottom: 24 }}>
          COST ESTIMATES
        </div>
        <div style={{ fontSize: '8.5pt', color: '#000', lineHeight: 1.5, fontWeight: 700, paddingBottom: 6, marginBottom: 8 }}>
          <div style={{ display: 'flex' }}>
            <span style={{ width: 75 }}>PROJECT:</span>
            <span>{project.name ? project.name.toUpperCase() : ''}</span>
          </div>
          {locationString && (
            <div style={{ display: 'flex' }}>
              <span style={{ width: 75 }}>LOCATION:</span>
              <span>{locationString.toUpperCase()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Cost table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '7pt' }}>
        <Colgroup />
        <CostTableHeader />
        <tbody>
          {/* All schedules */}
          {hier.map(entry => (
            <ScheduleGroup
              key={entry.schedule.id}
              entry={entry}
              allSummaries={allSummaries}
              allItems={allItems}
              project={project}
              materials={materials}
            />
          ))}

          {/* Grand Total */}
          <tr className="row-group">
            <td colSpan={10} style={{ ...grandTd, textAlign: 'right', paddingRight: 12, letterSpacing: '0.08em', borderLeft: 'none' }}>
              GRAND TOTAL
            </td>
            <td style={{ ...grandTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderRight: 'none' }}>
              {formatNumber(totals.grandTotal)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Signatures */}
      {isLast && signatures.length > 0 && (
        <SignatureBlock signatures={signatures} />
      )}
    </div>
  );
}

// ─── Summary page (multi-project) ────────────────────────────────────────────
function SummaryPage({ projects, allSchedules, allSummaries, allItems, contextName }) {
  const rows = projects.map(p => ({
    p,
    t: computeProjectPrintTotals(p.id, allSchedules, allSummaries, allItems, p),
  }));
  const sums = rows.reduce((acc, { t }) => ({
    mat: acc.mat + t.materialTotal,
    lab: acc.lab + t.laborTotal,
    eqp: acc.eqp + t.equipmentTotal,
    ocm: acc.ocm + t.ocmTotal,
    tot: acc.tot + t.grandTotal,
  }), { mat: 0, lab: 0, eqp: 0, ocm: 0, tot: 0 });

  const th = { background: C.headerBg, border: `0.2mm solid ${C.border}`, padding: '4px 6px', fontWeight: 700, fontSize: '7pt', color: '#1a3a10', textAlign: 'center' };
  const td = (right = false) => ({ border: `0.2mm solid #d4e8c5`, padding: '3px 6px', fontSize: '7.5pt', verticalAlign: 'middle', ...(right ? { textAlign: 'right', fontVariantNumeric: 'tabular-nums' } : {}) });
  const ftd = { border: `0.2mm solid ${C.grandTotal}`, padding: '4px 8px', background: C.grandTotal, color: '#fff', fontWeight: 800, fontSize: '8pt', textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  const pageStyle = {
    width: '277mm',
    background: '#fff',
    padding: '7mm 9mm',
    borderRadius: 2,
    boxShadow: '0 4px 24px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.3)',
    fontFamily: "'Inter', Arial, sans-serif",
    flexShrink: 0,
  };

  return (
    <div className="page" style={pageStyle}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ textAlign: 'center', fontWeight: 800, fontSize: '11pt', letterSpacing: '0.05em', color: '#0d2208', marginBottom: 24 }}>
          COST ESTIMATES — PROJECT SUMMARY
        </div>
        {contextName && (
          <div style={{ fontSize: '8.5pt', color: '#000', lineHeight: 1.5, fontWeight: 700, borderBottom: '0.2mm solid #d4d4d8', paddingBottom: 6, marginBottom: 8 }}>
            <div style={{ display: 'flex' }}>
              <span style={{ width: 75 }}>FACILITY:</span>
              <span>{contextName.toUpperCase()}</span>
            </div>
          </div>
        )}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '34%' }} /><col style={{ width: '13.2%' }} /><col style={{ width: '13.2%' }} />
          <col style={{ width: '13.2%' }} /><col style={{ width: '13.2%' }} /><col style={{ width: '13.2%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', borderLeft: 'none' }}>PROJECT / SCOPE</th>
            <th style={th}>MATERIAL TOTAL</th>
            <th style={th}>LABOR TOTAL</th>
            <th style={th}>EQUIPMENT TOTAL</th>
            <th style={th}>OVERHEAD, CONTINGENCY, MISC. TOTAL</th>
            <th style={{ ...th, borderRight: 'none' }}>GRAND TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, t }, i) => (
            <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : C.itemAlt }}>
              <td style={{ ...td(), borderLeft: 'none' }}>
                <span style={{ fontWeight: 600 }}>{p.name}</span>
              </td>
              <td style={td(true)}>{formatNumber(t.materialTotal)}</td>
              <td style={td(true)}>{formatNumber(t.laborTotal)}</td>
              <td style={td(true)}>{formatNumber(t.equipmentTotal)}</td>
              <td style={td(true)}>{formatNumber(t.ocmTotal)}</td>
              <td style={{ ...td(true), fontWeight: 700, borderRight: 'none' }}>{formatNumber(t.grandTotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...ftd, textAlign: 'right', letterSpacing: '0.06em', borderLeft: 'none' }}>TOTALS</td>
            <td style={ftd}>{formatNumber(sums.mat)}</td>
            <td style={ftd}>{formatNumber(sums.lab)}</td>
            <td style={ftd}>{formatNumber(sums.eqp)}</td>
            <td style={ftd}>{formatNumber(sums.ocm)}</td>
            <td style={{ ...ftd, borderRight: 'none' }}>{formatNumber(sums.tot)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Signature block ──────────────────────────────────────────────────────────
function SignatureBlock({ signatures }) {
  const groups = [
    { type: 'prepared_by', label: 'Prepared By:' },
    { type: 'checked_by', label: 'Checked By:' },
    { type: 'approved_by', label: 'Approved By:' },
  ];
  return (
    <div style={{ marginTop: 24, fontFamily: "'Inter', Arial, sans-serif" }}>
      {groups.map(({ type, label }) => {
        const sigs = signatures.filter(s => s.signatureType === type);
        if (!sigs.length) return null;
        return (
          <div key={type} style={{ marginBottom: 16 }}>
            <div style={{ color: '#000', marginBottom: 16, fontSize: '9pt' }}>{label}</div>
            <div style={{ display: 'flex', gap: 60, flexWrap: 'wrap' }}>
              {sigs.map(sig => (
                <div key={sig.id} style={{ minWidth: 160 }}>
                  <div style={{ fontWeight: 800, color: '#000', fontSize: '9pt' }}>{sig.fullName}</div>
                  <div style={{ color: '#000', fontSize: '8pt', marginTop: 4 }}>
                    {sig.position}{sig.department ? `, ${sig.department}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────
function Toolbar({ title, onPrint, onClose }) {
  const btnBase = {
    display: 'flex', alignItems: 'center', gap: 6,
    border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8,
    padding: '7px 18px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
    transition: 'background 0.15s',
  };
  return (
    <div className="toolbar" style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10001,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 1.5rem', height: 56,
      background: 'linear-gradient(135deg,#0a1c10 0%,#1a3a20 100%)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
      color: '#fff',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <FileText size={18} />
        <span style={{ fontWeight: 700, fontSize: '0.9rem', letterSpacing: '-0.01em' }}>{title}</span>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onClose}
          style={{ ...btnBase, background: 'rgba(255,255,255,0.08)', color: '#fff' }}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
          onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
        >
          <ArrowLeft size={15} /> Back
        </button>
        <button
          onClick={onPrint}
          style={{ ...btnBase, background: '#16a34a', borderColor: '#15803d', color: '#fff' }}
          onMouseOver={e => e.currentTarget.style.background = '#15803d'}
          onMouseOut={e => e.currentTarget.style.background = '#16a34a'}
        >
          <Printer size={15} /> Print / Save PDF
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function CostEstimatesPrint() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const scheduleId = searchParams.get('scheduleId');
  const projectId = searchParams.get('projectId');
  const facilityId = searchParams.get('facilityId');

  const [dbData, setDbData] = useState({
    allProjects: [],
    allSchedules: [],
    allSummaries: [],
    allItems: [],
    allSigs: [],
    facilities: [],
    campuses: [],
    materials: [],
    loading: true
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [
          allProjects,
          allSchedules,
          allSummaries,
          allItems,
          allSigs,
          facilities,
          campuses,
          materials
        ] = await Promise.all([
          getAllFromDB('projects'),
          getAllFromDB('schedulesOfWork'),
          getAllFromDB('scheduleSummaries'),
          getAllFromDB('summaryItems'),
          getAllFromDB('signatures'),
          getAllFromDB('facilities'),
          getAllFromDB('campuses'),
          getAllFromDB('materials')
        ]);
        
        setDbData({
          allProjects,
          allSchedules,
          allSummaries,
          allItems,
          allSigs,
          facilities,
          campuses,
          materials,
          loading: false
        });
      } catch (err) {
        console.error("Failed to load print data", err);
        setDbData(prev => ({ ...prev, loading: false }));
      }
    }
    loadData();
  }, []);

  const { allProjects, allSchedules, allSummaries, allItems, allSigs, facilities, campuses, materials, loading } = dbData;

  const projects = React.useMemo(() => {
    if (scheduleId) {
      const sched = allSchedules.find(s => s.id === scheduleId);
      return sched ? allProjects.filter(p => p.id === sched.projectId) : [];
    }
    if (projectId) return allProjects.filter(p => p.id === projectId && !p.isExcluded);
    if (facilityId === 'all') return allProjects.filter(p => !p.isExcluded).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (facilityId) return allProjects.filter(p => p.facilityId === facilityId && !p.isExcluded).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return [];
  }, [allProjects, projectId, facilityId, scheduleId, allSchedules]);

  const facilityCtx = React.useMemo(() => {
    if (facilityId) return facilities.find(f => f.id === facilityId) ?? null;
    if (projectId) {
      const p = allProjects.find(p => p.id === projectId);
      return p ? facilities.find(f => f.id === p.facilityId) ?? null : null;
    }
    return null;
  }, [facilities, facilityId, projectId, allProjects]);

  const signatures = React.useMemo(() =>
    [...allSigs]
      .filter(s => s.isEnabled !== false)
      .sort((a, b) => {
        const o = { prepared_by: 0, checked_by: 1, approved_by: 2 };
        return ((o[a.signatureType] ?? 99) - (o[b.signatureType] ?? 99)) || ((a.signatureOrder ?? 0) - (b.signatureOrder ?? 0));
      }),
    [allSigs]);

  const title = projects.length === 1
    ? `Cost Estimates — ${projects[0]?.name}`
    : `Cost Estimates — ${facilityCtx?.name ?? 'Multiple Projects'}`;
  
  const contentRef = useRef(null);
  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: title,
  });

  const handleClose = useCallback(() => navigate(-1), [navigate]);

  // ── Full-screen overlay (covers sidebar + header in screen mode) ──
  const overlay = {
    position: 'fixed', inset: 0, zIndex: 10000,
    background: '#3c3f41',
    overflowY: 'auto',
    paddingTop: 72,      // below toolbar
    paddingBottom: 40,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 24,
  };

  const printContent = React.useMemo(() => (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
      {projects.length > 1 && (
        <SummaryPage
          projects={projects}
          allSchedules={allSchedules}
          allSummaries={allSummaries}
          allItems={allItems}
          contextName={facilityCtx?.name}
        />
      )}
      {projects.map((project, idx) => (
        <ProjectPage
          key={project.id}
          project={project}
          allSchedules={allSchedules}
          allSummaries={allSummaries}
          allItems={allItems}
          signatures={signatures}
          facilities={facilities}
          campuses={campuses}
          materials={materials}
          isLast={idx === projects.length - 1}
          targetScheduleId={scheduleId}
        />
      ))}
    </>
  ), [projects, allSchedules, allSummaries, allItems, facilityCtx, signatures, facilities, campuses, materials]);

  if (loading) {
    return (
      <div id="cost-estimates-print-root" style={overlay}>
        <Toolbar title={title || 'Cost Estimates'} onPrint={() => {}} onClose={handleClose} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#fff', gap: '1rem', marginTop: '15vh' }}>
          <Loader2 size={40} className="animate-spin" style={{ color: '#16a34a' }} />
          <div style={{ fontWeight: 600, color: '#ccc' }}>Preparing Document Data...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div id="cost-estimates-print-root" style={overlay}>
        <Toolbar title={title} onPrint={handlePrint} onClose={handleClose} />

        {projects.length === 0 ? (
          <div style={{
            marginTop: 80, textAlign: 'center', color: '#ccc',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          }}>
            <AlertCircle size={48} style={{ opacity: 0.3 }} />
            <h2 style={{ color: '#fff', fontWeight: 700 }}>No Project Selected</h2>
            <p style={{ fontSize: '0.9rem' }}>Navigate to Projects and click the print icon on a project row.</p>
            <button
              onClick={() => navigate('/projects')}
              style={{ marginTop: 8, padding: '8px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
            >
              Go to Projects
            </button>
          </div>
        ) : (
          <div ref={contentRef} id="print-content-wrapper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%' }}>
            {printContent}
          </div>
        )}
      </div>
    </>
  );
}
