import { getAllFromDB, getFromDB, deleteFromDB, putToDB, addToSyncQueue, getAllFromIndexDB } from './db';

const notifyUpdate = (collectionName) => {
  window.dispatchEvent(new CustomEvent('localDataUpdated', { detail: collectionName }));
};

const executeDelete = async (collection, id) => {
  const item = await getFromDB(collection, id);
  if (item) {
    await deleteFromDB(collection, id);
    await addToSyncQueue({ type: 'delete', collection, payload: item });
    notifyUpdate(collection);
    window.dispatchEvent(new Event('triggerSync'));
    return item;
  }
  return null;
};

const executeCreate = async (collection, payload) => {
  await putToDB(collection, payload);
  await addToSyncQueue({ type: 'create', collection, payload });
  notifyUpdate(collection);
  window.dispatchEvent(new Event('triggerSync'));
};

export const cascadeDelete = async (type, id) => {
  if (type === 'campus') {
    await executeDelete('campuses', id);
    let facilities = [];
    try { facilities = await getAllFromIndexDB('facilities', 'campusId', id); } 
    catch { facilities = (await getAllFromDB('facilities')).filter(f => f.campusId === id); }
    for (const f of facilities) {
      await cascadeDelete('facility', f.id);
    }
  } 
  else if (type === 'facility') {
    const deletedFacility = await executeDelete('facilities', id);
    let projects = [];
    try { projects = await getAllFromIndexDB('projects', 'facilityId', id); } 
    catch { projects = (await getAllFromDB('projects')).filter(p => p.facilityId === id); }
    for (const p of projects) {
      await cascadeDelete('project', p.id);
    }
    if (deletedFacility && deletedFacility.campusId) {
      const { recomputeCampusCost } = await import('./billing');
      await recomputeCampusCost(deletedFacility.campusId);
    }
  }
  else if (type === 'project') {
    const deletedProject = await executeDelete('projects', id);
    let schedules = [];
    try { schedules = await getAllFromIndexDB('schedulesOfWork', 'projectId', id); } 
    catch { schedules = (await getAllFromDB('schedulesOfWork')).filter(s => s.projectId === id); }
    for (const s of schedules) {
      await cascadeDelete('schedule', s.id);
    }
    if (deletedProject && deletedProject.facilityId) {
      const { recomputeFacilityCost } = await import('./billing');
      await recomputeFacilityCost(deletedProject.facilityId);
    }
  }
  else if (type === 'schedule') {
    const deletedSchedule = await executeDelete('schedulesOfWork', id);
    let summaries = [];
    try { summaries = await getAllFromIndexDB('scheduleSummaries', 'scheduleOfWorkId', id); } 
    catch { summaries = (await getAllFromDB('scheduleSummaries')).filter(s => s.scheduleOfWorkId === id); }
    for (const sum of summaries) {
      await cascadeDelete('summary', sum.id);
    }
    if (deletedSchedule && deletedSchedule.projectId) {
      const { recomputeProjectCost } = await import('./billing');
      await recomputeProjectCost(deletedSchedule.projectId);
    }
  }
  else if (type === 'summary') {
    const deletedSummary = await executeDelete('scheduleSummaries', id);
    let items = [];
    try { items = await getAllFromIndexDB('summaryItems', 'summaryId', id); } 
    catch { items = (await getAllFromDB('summaryItems')).filter(i => i.summaryId === id); }
    for (const item of items) {
      await executeDelete('summaryItems', item.id);
    }
    if (deletedSummary && deletedSummary.scheduleOfWorkId) {
      const { recomputeScheduleCost } = await import('./billing');
      await recomputeScheduleCost(deletedSummary.scheduleOfWorkId);
    }
  }
};

export const cascadeDuplicateProject = async ({ sourceProjectId, newProjectPayload }) => {
  const sourceProject = await getFromDB('projects', sourceProjectId);
  if (!sourceProject) {
    throw new Error('Source project not found');
  }

  await executeCreate('projects', newProjectPayload);

  const allSchedules = await getAllFromDB('schedulesOfWork');
  const schedules = allSchedules.filter(s => s.projectId === sourceProjectId);

  for (const schedule of schedules) {
    const newScheduleId = crypto.randomUUID();
    const newSchedule = {
      ...schedule,
      id: newScheduleId,
      projectId: newProjectPayload.id,
      createdAt: new Date().toISOString()
    };
    await executeCreate('schedulesOfWork', newSchedule);

    const allSummaries = await getAllFromDB('scheduleSummaries');
    const summaries = allSummaries.filter(sum => sum.scheduleOfWorkId === schedule.id);

    for (const summary of summaries) {
      const newSummaryId = crypto.randomUUID();
      const newSummary = {
        ...summary,
        id: newSummaryId,
        scheduleOfWorkId: newScheduleId,
        createdAt: new Date().toISOString()
      };
      await executeCreate('scheduleSummaries', newSummary);

      const allItems = await getAllFromDB('summaryItems');
      const items = allItems.filter(item => item.summaryId === summary.id);

      for (const item of items) {
        const newItem = {
          ...item,
          id: crypto.randomUUID(),
          summaryId: newSummaryId,
          createdAt: new Date().toISOString()
        };
        await executeCreate('summaryItems', newItem);
      }
    }
  }

  // Ensure full project cost rollup runs after copying all entities
  const { recomputeProjectCost } = await import('./billing');
  await recomputeProjectCost(newProjectPayload.id);
};

export const cascadeDuplicateSchedule = async ({ sourceScheduleId, newSchedulePayload }) => {
  // Always use full-scan fallback — index queries return empty silently when
  // data was Firestore-synced but the IDB index is not yet populated.
  await executeCreate('schedulesOfWork', newSchedulePayload);

  const allSummaries = await getAllFromDB('scheduleSummaries');
  const summaries = allSummaries.filter(s => s.scheduleOfWorkId === sourceScheduleId);

  let newScheduleTotalCost = 0;

  for (const summary of summaries) {
    const newSummaryId = crypto.randomUUID();

    // Fetch items for this summary via full scan (same reliability reason)
    const allItems = await getAllFromDB('summaryItems');
    const items = allItems.filter(i => i.summaryId === summary.id);

    // Copy items first so we can recompute the summary's actual totalCost
    let summaryTotal = 0;
    for (const item of items) {
      await executeCreate('summaryItems', {
        ...item,
        id: crypto.randomUUID(),
        summaryId: newSummaryId,
        createdAt: new Date().toISOString(),
      });
      summaryTotal += item.totalCost || 0;
    }

    await executeCreate('scheduleSummaries', {
      ...summary,
      id: newSummaryId,
      scheduleOfWorkId: newSchedulePayload.id,
      totalCost: summaryTotal,
      createdAt: new Date().toISOString(),
    });
  }

  // Use the canonical recompute to ensure all parents (project, facility, etc.) 
  // also get updated with the new schedule's cost.
  const { recomputeScheduleCost } = await import('./billing');
  await recomputeScheduleCost(newSchedulePayload.id);
  
  notifyUpdate('schedulesOfWork');
};
