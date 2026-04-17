import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export async function exportProjectsTemplate(campuses, facilities, projects = []) {
  const workbook = new ExcelJS.Workbook();
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

  // Protect header row
  sheet.getRow(1).font = { bold: true };

  // Build Facilities_Hidden matrix for dependent dropdowns
  const dataSheet = workbook.addWorksheet('Data_Hidden', { state: 'hidden' });
  
  // Column A: List of Campuses
  campuses.forEach((camp, i) => {
    dataSheet.getCell(i + 1, 1).value = camp.name;
  });

  // Columns B onwards: Campus headers and their facilities
  campuses.forEach((camp, colIdx) => {
    const excelCol = colIdx + 2; // B is 2
    dataSheet.getCell(1, excelCol).value = camp.name;
    const facs = facilities.filter(f => f.campusId === camp.id);
    facs.forEach((fac, rowIdx) => {
      dataSheet.getCell(rowIdx + 2, excelCol).value = fac.name;
    });
  });

  // Pre-fill existing projects FIRST so they appear at the top
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
      facility: fac ? fac.name : ''
    });
  });

  // Apply Data Validation to rows 2-1000 (including the pre-filled ones)
  const maxRows = Math.max(1000, sheet.rowCount + 500);
  for (let rowNumber = 2; rowNumber <= maxRows; rowNumber++) {
    // Priority (Column D)
    sheet.getCell(`D${rowNumber}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Low,Medium,High,Very High"']
    };

    // Status (Column E)
    sheet.getCell(`E${rowNumber}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Planning Phase,On Review,For Submission,Accepted,On-going,Closed"']
    };

    // Campus Name (Column F)
    if (campuses.length > 0) {
      const campusFormula = `Data_Hidden!$A$1:$A$${campuses.length}`;
      sheet.getCell(`F${rowNumber}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [campusFormula]
      };
    }

    // Facility Name (Column G)
    if (campuses.length > 0) {
      sheet.getCell(`G${rowNumber}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`OFFSET(Data_Hidden!$B$2,0,MATCH($F${rowNumber},Data_Hidden!$B$1:$ZZ$1,0)-1,COUNTA(OFFSET(Data_Hidden!$B$2,0,MATCH($F${rowNumber},Data_Hidden!$B$1:$ZZ$1,0)-1,100,1)),1)`]
      };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), 'projects_export.xlsx');
}

export async function parseProjectsExcel(file) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file);
  const sheet = workbook.getWorksheet('Projects');
  if (!sheet) throw new Error("Could not find 'Projects' sheet.");
  
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      const values = row.values;
      // ExcelJS values array is 1-indexed, meaning values[1] is column A
      rows.push({
        id: values[1]?.toString() || null,
        name: values[2]?.toString() || '',
        description: values[3]?.toString() || '',
        priority: values[4]?.toString() || 'Medium',
        status: values[5]?.toString() || 'Planning Phase',
        campusName: values[6]?.toString() || '',
        facilityName: values[7]?.toString() || ''
      });
    }
  });
  return rows;
}
