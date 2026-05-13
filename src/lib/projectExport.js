import { getAllFromDB, getFromDB, putToDB, addToSyncQueue } from './db';

/**
 * Fetches all related data for projects (schedules, summaries, items) 
 * and returns it in a structured array.
 */
export async function getDeepProjectData(projectIds) {
  if (!projectIds || projectIds.length === 0) return [];

  const allSchedules = await getAllFromDB('schedulesOfWork');
  const allSummaries = await getAllFromDB('scheduleSummaries');
  const allItems = await getAllFromDB('summaryItems');
  const allProjects = await getAllFromDB('projects');

  const exportData = [];

  for (const pid of projectIds) {
    const project = allProjects.find(p => p.id === pid);
    if (!project) continue;

    const projectSchedules = allSchedules.filter(s => s.projectId === pid);
    const schedIds = new Set(projectSchedules.map(s => s.id));
    const projectSummaries = allSummaries.filter(s => schedIds.has(s.scheduleOfWorkId));
    const sumIds = new Set(projectSummaries.map(s => s.id));
    const projectItems = allItems.filter(i => sumIds.has(i.summaryId));

    exportData.push({
      project,
      schedules: projectSchedules,
      summaries: projectSummaries,
      items: projectItems
    });
  }
  return exportData;
}

/**
 * Deep exports one or more projects including all related schedules, summaries, and items.
 */
export async function exportProjectsToJson(projectIds) {
  const exportData = await getDeepProjectData(projectIds);
  if (exportData.length === 0) return null;

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  
  // Filename logic: type-name-date.json
  const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-'); // DD-MM-YYYY
  let namePart = '';
  if (exportData.length === 1) {
    namePart = slugify(exportData[0].project.name);
  } else {
    namePart = 'multiproject-' + exportData.map(d => slugify(d.project.name)).join(',');
  }
  
  a.href = url;
  a.download = `ppocms-${namePart}-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function slugify(str) {
  return (str || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Deep imports projects from a JSON file.
 * Handles ID collisions by generating new IDs while maintaining internal relationships.
 */
export async function importProjectsFromJson(jsonData, progressCallback) {
  try {
    const data = JSON.parse(jsonData);
    if (!Array.isArray(data)) throw new Error('Invalid export format: Expected an array.');

    let totalSteps = 0;
    data.forEach(p => {
      totalSteps += 1 + p.schedules.length + p.summaries.length + p.items.length;
    });

    let currentStep = 0;

    for (const entry of data) {
      const { project, schedules, summaries, items } = entry;
      
      const oldProjId = project.id;
      const newProjId = crypto.randomUUID();
      
      // Map for ID resolution
      const idMap = { [oldProjId]: newProjId };

      // 1. Create Project
      await saveItem('projects', { 
        ...project, 
        id: newProjId, 
        name: `${project.name} (Imported)`,
        createdAt: new Date().toISOString() 
      });
      currentStep++;
      if (progressCallback) progressCallback(Math.round((currentStep / totalSteps) * 100));

      // 2. Create Schedules (respecting hierarchy)
      // Sort schedules so parents are created before children if parents are within the same export
      // But actually we use an ID map to handle all links
      for (const s of schedules) {
        const newId = crypto.randomUUID();
        idMap[s.id] = newId;
      }

      for (const s of schedules) {
        await saveItem('schedulesOfWork', {
          ...s,
          id: idMap[s.id],
          projectId: newProjId,
          parentId: s.parentId ? (idMap[s.parentId] || s.parentId) : null,
          createdAt: new Date().toISOString()
        });
        currentStep++;
        if (progressCallback) progressCallback(Math.round((currentStep / totalSteps) * 100));
      }

      // 3. Create Summaries
      for (const sum of summaries) {
        const newId = crypto.randomUUID();
        idMap[sum.id] = newId;
        
        await saveItem('scheduleSummaries', {
          ...sum,
          id: newId,
          scheduleOfWorkId: idMap[sum.scheduleOfWorkId] || sum.scheduleOfWorkId,
          createdAt: new Date().toISOString()
        });
        currentStep++;
        if (progressCallback) progressCallback(Math.round((currentStep / totalSteps) * 100));
      }

      // 4. Create Items
      for (const item of items) {
        await saveItem('summaryItems', {
          ...item,
          id: crypto.randomUUID(),
          summaryId: idMap[item.summaryId] || item.summaryId,
          createdAt: new Date().toISOString()
        });
        currentStep++;
        if (progressCallback) progressCallback(Math.round((currentStep / totalSteps) * 100));
      }
    }
    
    return true;
  } catch (err) {
    console.error('[Import] Failed:', err);
    throw err;
  }
}

export async function saveItem(collection, item) {
  await putToDB(collection, item);
  await addToSyncQueue({ type: 'create', collection, payload: item });
  window.dispatchEvent(new CustomEvent('localDataUpdated', { detail: collection }));
}
