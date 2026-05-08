import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// ─── Filename utilities ───────────────────────────────────────────────────────

/**
 * Converts any string into a filesystem-safe slug.
 * e.g. "26.001 – Admin Building & Gym" → "26001_admin_building_gym"
 */
function slugifyFilename(str = '') {
  return str
    .normalize('NFD')                          // decompose accented chars
    .replace(/[\u0300-\u036f]/g, '')           // strip diacritics
    .replace(/[^a-zA-Z0-9.\-_ ]/g, ' ')       // keep alphanum, dots, dashes, underscores
    .trim()
    .replace(/\s+/g, '_')                      // spaces → underscores
    .replace(/_+/g, '_')                       // collapse multiple underscores
    .toLowerCase();
}

/**
 * Returns a datestamped filename for a given document type and source name.
 * e.g. toExcelFilename('schedule_of_works', 'Main Admin Building') →
 *      'schedule_of_works_main_admin_building_2026-04-23.xlsx'
 */
function toExcelFilename(type, sourceName = '') {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const slug = slugifyFilename(sourceName);
  return slug ? `${type}_${slug}_${date}.xlsx` : `${type}_${date}.xlsx`;
}

// ─── Shared style tokens ──────────────────────────────────────────────────────

const COLORS = {
  headerFill: '1E3A5F',        // deep navy
  headerFont: 'FFFFFF',
  parentFill: 'EBF3FB',        // light blue tint for main schedules
  subFill: 'F5F5F5',           // subtle grey tint for sub-schedules
  excludedFont: '9CA3AF',      // muted grey for excluded items
  workCodeFont: '1D4ED8',      // blue for work codes
  subIndentFont: '374151',     // dark grey for sub-schedule names
  borderColor: 'D1D5DB',
};

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerFill } };
const PARENT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.parentFill } };
const SUB_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subFill } };

const THIN_BORDER = {
  top: { style: 'thin', color: { argb: COLORS.borderColor } },
  left: { style: 'thin', color: { argb: COLORS.borderColor } },
  bottom: { style: 'thin', color: { argb: COLORS.borderColor } },
  right: { style: 'thin', color: { argb: COLORS.borderColor } },
};

// ─── Projects Export / Import ─────────────────────────────────────────────────

/**
 * Exports all projects to an Excel template with data-validation dropdowns
 * for Priority, Status, Campus, and a cascade-filtered Facility column.
 */
export async function exportProjectsTemplate(campuses, facilities, projects = []) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PPOMS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Projects');

  sheet.columns = [
    { header: 'ID (Leave blank for new)', key: 'id', width: 35 },
    { header: 'Project Name', key: 'name', width: 40 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Priority', key: 'priority', width: 15 },
    { header: 'Status', key: 'status', width: 20 },
    { header: 'Campus Name', key: 'campus', width: 30 },
    { header: 'Facility Name', key: 'facility', width: 30 },
  ];

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: COLORS.headerFont } };
  headerRow.fill = HEADER_FILL;
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 22;

  // Hidden data sheet for dependent dropdowns
  const dataSheet = workbook.addWorksheet('Data_Hidden', { state: 'hidden' });

  // Column A: campus names
  campuses.forEach((camp, i) => {
    dataSheet.getCell(i + 1, 1).value = camp.name;
  });

  // Columns B+: campus name as header, facility names below
  campuses.forEach((camp, colIdx) => {
    const excelCol = colIdx + 2;
    dataSheet.getCell(1, excelCol).value = camp.name;
    facilities.filter(f => f.campusId === camp.id).forEach((fac, rowIdx) => {
      dataSheet.getCell(rowIdx + 2, excelCol).value = fac.name;
    });
  });

  // Pre-fill existing projects
  projects.forEach(p => {
    const fac = facilities.find(f => f.id === p.facilityId);
    const camp = fac ? campuses.find(c => c.id === fac.campusId) : null;
    sheet.addRow({
      id: p.id,
      name: p.name,
      description: p.description || '',
      priority: p.priority || 'Medium',
      status: p.status || 'Planning Phase',
      campus: camp ? camp.name : '',
      facility: fac ? fac.name : '',
    });
  });

  // Data validation on rows 2–maxRows
  const maxRows = Math.max(1000, sheet.rowCount + 500);
  for (let r = 2; r <= maxRows; r++) {
    sheet.getCell(`D${r}`).dataValidation = {
      type: 'list', allowBlank: true,
      formulae: ['"Low,Medium,High,Very High"'],
    };
    sheet.getCell(`E${r}`).dataValidation = {
      type: 'list', allowBlank: true,
      formulae: ['"Planning Phase,On Review,For Submission,Accepted,On-going,Closed"'],
    };
    if (campuses.length > 0) {
      sheet.getCell(`F${r}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: [`Data_Hidden!$A$1:$A$${campuses.length}`],
      };
      sheet.getCell(`G${r}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: [
          `OFFSET(Data_Hidden!$B$2,0,MATCH($F${r},Data_Hidden!$B$1:$ZZ$1,0)-1,` +
          `COUNTA(OFFSET(Data_Hidden!$B$2,0,MATCH($F${r},Data_Hidden!$B$1:$ZZ$1,0)-1,100,1)),1)`,
        ],
      };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), 'projects_export.xlsx');
}

/**
 * Parses a projects Excel file and returns an array of plain row objects.
 */
export async function parseProjectsExcel(file) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file);
  const sheet = workbook.getWorksheet('Projects');
  if (!sheet) throw new Error("Could not find 'Projects' sheet.");

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      const v = row.values; // 1-indexed
      rows.push({
        id: v[1]?.toString() || null,
        name: v[2]?.toString() || '',
        description: v[3]?.toString() || '',
        priority: v[4]?.toString() || 'Medium',
        status: v[5]?.toString() || 'Planning Phase',
        campusName: v[6]?.toString() || '',
        facilityName: v[7]?.toString() || '',
      });
    }
  });
  return rows;
}

// ─── Master Data Export / Import (Generic) ────────────────────────────────────

export async function exportMasterDataTemplate(title, fields, data = []) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PPOMS';
  workbook.created = new Date();

  // Create sanitized sheet name (max 31 chars for excel)
  const sheetName = title.substring(0, 31).replace(/[\[\]*?:\/\\]/g, "");
  const sheet = workbook.addWorksheet(sheetName);

  const columns = [
    { header: 'ID (Leave blank for new)', key: 'id', width: 35 }
  ];

  fields.forEach(f => {
    columns.push({ header: f.label, key: f.name, width: 30 });
  });

  sheet.columns = columns;

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: COLORS.headerFont } };
  headerRow.fill = HEADER_FILL;
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 22;

  data.forEach(item => {
    const rowData = { id: item.id };
    fields.forEach(f => {
      rowData[f.name] = item[f.name];
    });
    sheet.addRow(rowData);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), toExcelFilename(slugifyFilename(title)));
}

export async function parseMasterDataExcel(file, title, fields) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file);
  const sheetName = title.substring(0, 31).replace(/[\[\]*?:\/\\]/g, "");
  const sheet = workbook.getWorksheet(sheetName) || workbook.worksheets[0]; // fallback to first sheet
  if (!sheet) throw new Error(`Could not find sheet ${sheetName}`);

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      const v = row.values;
      const rowObj = {
        id: v[1]?.toString() || null,
      };
      
      fields.forEach((f, idx) => {
        let val = v[idx + 2];
        if (val !== undefined && val !== null) {
          if (f.type === 'number') {
            val = Number(val);
          } else {
            val = val.toString();
          }
        }
        rowObj[f.name] = val;
      });
      rows.push(rowObj);
    }
  });
  return rows;
}

// ─── Schedules Export / Import ────────────────────────────────────────────────

/**
 * Column layout for the Schedules sheet (1-indexed to match ExcelJS row.values):
 *
 *  A  [1]  ID             – Leave blank for new items
 *  B  [2]  Work Name      – Required
 *  C  [3]  Specifications – Optional free text
 *  D  [4]  Project Name   – Dropdown validated against live project list
 *  E  [5]  Work Code      – Auto-generated reference (read-only intent, ignored on import)
 *  F  [6]  Parent Work Code – If populated, this row is treated as a sub-schedule of the matching work
 *  G  [7]  Is Excluded    – "Yes" / "No" dropdown
 *  H  [8]  Type           – "Main Schedule" / "Sub-Schedule" (display only, ignored on import)
 */
const SCHED_COLS = [
  { header: 'ID (Leave blank for new)', key: 'id', width: 35 },
  { header: 'Work Name *', key: 'name', width: 40 },
  { header: 'Specifications', key: 'description', width: 50 },
  { header: 'Project Name *', key: 'project', width: 35 },
  { header: 'Work Code (auto)', key: 'workCode', width: 20 },
  { header: 'Parent Work Code', key: 'parentWorkCode', width: 22 },
  { header: 'Is Excluded', key: 'isExcluded', width: 14 },
  { header: 'Type', key: 'type', width: 18 },
];

/**
 * Exports all schedules (main + sub) to a hierarchically-formatted Excel file.
 * Main schedules are colour-coded blue; their sub-schedules are indented grey.
 *
 * @param {Array} projects   - Full projects collection
 * @param {Array} schedules  - Full schedulesOfWork collection
 */
/**
 * Exports all schedules (main + sub) to a hierarchically-formatted Excel file.
 *
 * @param {Array}  projects    - Full projects collection
 * @param {Array}  schedules   - Full schedulesOfWork collection
 * @param {string} projectName - The active project's display name (used for the filename)
 */
export async function exportSchedulesTemplate(projects, schedules = [], projectName = '') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PPOMS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Schedules');
  sheet.columns = SCHED_COLS;

  // ── Header row ──
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: COLORS.headerFont } };
  headerRow.fill = HEADER_FILL;
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 26;

  // ── Hidden data sheet for project-name dropdown ──
  const dataSheet = workbook.addWorksheet('Data_Hidden', { state: 'hidden' });
  projects.forEach((proj, i) => {
    dataSheet.getCell(i + 1, 1).value = proj.name;
  });

  // ── Separate roots and children, sort each group by order ──
  const roots = schedules.filter(s => !s.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const children = schedules.filter(s => s.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  let excelRowNum = 2; // 1-indexed sheet row, starts at 2 (after header)

  roots.forEach(main => {
    const proj = projects.find(p => p.id === main.projectId);

    // ── Main schedule row ──
    const mainRow = sheet.addRow({
      id: main.id,
      name: main.name,
      description: main.description || '',
      project: proj ? proj.name : '',
      workCode: main.workCode || '',
      parentWorkCode: '',                        // roots have no parent
      isExcluded: main.isExcluded ? 'Yes' : 'No',
      type: 'Main Schedule',
    });

    mainRow.fill = PARENT_FILL;
    mainRow.font = { bold: true, color: { argb: main.isExcluded ? COLORS.excludedFont : '1E3A5F' } };
    mainRow.height = 20;

    // Style the work-code cell distinctly
    mainRow.getCell('workCode').font = { bold: true, color: { argb: COLORS.workCodeFont } };
    mainRow.getCell('workCode').alignment = { horizontal: 'center' };

    // Lock the "Type" and "Work Code" columns (visual cue — data validation can't enforce read-only in ExcelJS)
    mainRow.getCell('type').font = { italic: true, color: { argb: '6B7280' } };
    mainRow.getCell('type').alignment = { horizontal: 'center' };

    _applyBorder(mainRow, sheet);
    excelRowNum++;

    // ── Sub-schedule rows ──
    const subs = children
      .filter(c => c.parentId === main.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    subs.forEach(sub => {
      const subRow = sheet.addRow({
        id: sub.id,
        name: `    ↳ ${sub.name}`,  // visual indent prefix (stripped on import)
        description: sub.description || '',
        project: proj ? proj.name : '',
        workCode: sub.workCode || '',
        parentWorkCode: main.workCode || '',  // KEY: links sub back to parent on import
        isExcluded: sub.isExcluded ? 'Yes' : 'No',
        type: 'Sub-Schedule',
      });

      subRow.fill = SUB_FILL;
      subRow.font = { color: { argb: sub.isExcluded ? COLORS.excludedFont : COLORS.subIndentFont } };
      subRow.height = 18;

      subRow.getCell('workCode').font = { bold: true, color: { argb: COLORS.workCodeFont } };
      subRow.getCell('workCode').alignment = { horizontal: 'center' };
      subRow.getCell('type').font = { italic: true, color: { argb: '6B7280' } };
      subRow.getCell('type').alignment = { horizontal: 'center' };

      _applyBorder(subRow, sheet);
      excelRowNum++;
    });
  });

  // ── Data validation — applied to every data row (including blank new-entry rows) ──
  const maxRows = Math.max(1000, excelRowNum + 500);
  const projectFormula = projects.length > 0
    ? `Data_Hidden!$A$1:$A$${projects.length}`
    : '"(No projects)"';

  for (let r = 2; r <= maxRows; r++) {
    // Project Name dropdown
    sheet.getCell(`D${r}`).dataValidation = {
      type: 'list', allowBlank: false, formulae: [projectFormula],
    };
    // Is Excluded dropdown
    sheet.getCell(`G${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"Yes,No"'],
    };
  }

  // ── Freeze the header row ──
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  // ── Instructions note in cell I1 ──
  sheet.getCell('I1').value = '⚠ HOW TO USE: Leave ID blank to create new items. ' +
    'Fill "Parent Work Code" (col F) with an existing Work Code to create a sub-schedule. ' +
    '"Work Code (auto)" is for reference only — it will be re-generated on import.';
  sheet.getCell('I1').font = { italic: true, color: { argb: 'FFFFFF' } };
  sheet.getColumn('I').width = 70;

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = toExcelFilename('schedule_of_works', projectName);
  saveAs(new Blob([buffer]), filename);
}

/**
 * Parses a Schedules Excel file back into structured row objects.
 *
 * Returns an array of objects:
 *   { id, name, description, projectName, workCode, parentWorkCode, isExcluded }
 *
 * Strips the visual indent prefix (e.g., "    ↳ ") from sub-schedule names.
 */
export async function parseSchedulesExcel(file) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file);

  const sheet = workbook.getWorksheet('Schedules');
  if (!sheet) throw new Error("Could not find 'Schedules' sheet in this file.");

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 1) return; // skip header

    const v = row.values; // 1-indexed

    const rawName = v[2]?.toString() || '';
    // Strip visual indent prefix added during export ("    ↳ ")
    const cleanName = rawName.replace(/^\s*↳\s*/, '').trim();

    if (!cleanName) return; // skip completely empty rows

    const isExcludedRaw = (v[7]?.toString() || 'No').trim().toLowerCase();
    const parentWorkCode = (v[6]?.toString() || '').trim();

    rows.push({
      id: v[1]?.toString().trim() || null,
      name: cleanName,
      description: v[3]?.toString() || '',
      projectName: v[4]?.toString() || '',
      workCode: v[5]?.toString() || '',    // reference only — re-generated on save
      parentWorkCode: parentWorkCode,            // empty string → main schedule
      isExcluded: isExcludedRaw === 'yes',
    });
  });

  return rows;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Applies a thin border to every cell in a row. */
function _applyBorder(excelRow, sheet) {
  excelRow.eachCell({ includeEmpty: true }, cell => {
    cell.border = THIN_BORDER;
  });
}
