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
  const sourceSchedules = allSchedules.filter(s => s.projectId === sourceProjectId);

  // ── Build a complete old-ID → new-ID map upfront so sub-schedule parentIds
  //    can be remapped correctly even before the parent schedule is written.
  const idMap = new Map(); // sourceId -> newId
  for (const s of sourceSchedules) {
    idMap.set(s.id, crypto.randomUUID());
  }

  const allSummaries = await getAllFromDB('scheduleSummaries');
  const allItems     = await getAllFromDB('summaryItems');

  // Helper: copy summaries + items from one schedule to another
  const copySummariesAndItems = async (sourceId, destId) => {
    const summaries = allSummaries.filter(s => s.scheduleOfWorkId === sourceId);
    for (const summary of summaries) {
      const newSummaryId = crypto.randomUUID();
      const items = allItems.filter(i => i.summaryId === summary.id);
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
        scheduleOfWorkId: destId,
        totalCost: summaryTotal,
        createdAt: new Date().toISOString(),
      });
    }
  };

  // ── Process root schedules first, then sub-schedules (ensures parentId exists)
  const rootSchedules = sourceSchedules.filter(s => !s.parentId);
  const subSchedules  = sourceSchedules.filter(s =>  s.parentId);

  for (const schedule of rootSchedules) {
    const newId = idMap.get(schedule.id);
    await executeCreate('schedulesOfWork', {
      ...schedule,
      id: newId,
      projectId: newProjectPayload.id,
      parentId: null,
      createdAt: new Date().toISOString(),
    });
    await copySummariesAndItems(schedule.id, newId);
  }

  for (const schedule of subSchedules) {
    const newId       = idMap.get(schedule.id);
    // Remap parentId to the new project's equivalent parent (falls back to null if orphaned)
    const newParentId = idMap.get(schedule.parentId) ?? null;
    await executeCreate('schedulesOfWork', {
      ...schedule,
      id: newId,
      projectId: newProjectPayload.id,
      parentId: newParentId,
      createdAt: new Date().toISOString(),
    });
    await copySummariesAndItems(schedule.id, newId);
  }

  // Ensure full project cost rollup runs after copying all entities
  const { recomputeProjectCost } = await import('./billing');
  await recomputeProjectCost(newProjectPayload.id);

  notifyUpdate('schedulesOfWork');
  notifyUpdate('scheduleSummaries');
  notifyUpdate('summaryItems');
};

/**
 * Duplicate a single schedule (main or sub) with its full data tree.
 *
 * For a MAIN schedule this also clones every child sub-schedule and
 * their respective summaries + items, remapping parentIds to the new
 * main schedule's ID.
 *
 * Returns { newSchedule, newSubSchedules } so the caller can build a
 * snapshot for a full work-code reindex.
 */
export const cascadeDuplicateSchedule = async ({ sourceScheduleId, newSchedulePayload }) => {
  await executeCreate('schedulesOfWork', newSchedulePayload);

  const allSummaries = await getAllFromDB('scheduleSummaries');
  const allItems     = await getAllFromDB('summaryItems');

  // ── Helper: copy summaries + items ────────────────────────────────────────
  const copySummariesAndItems = async (sourceId, destId) => {
    const summaries = allSummaries.filter(s => s.scheduleOfWorkId === sourceId);
    let scheduleTotal = 0;
    for (const summary of summaries) {
      const newSummaryId = crypto.randomUUID();
      const items = allItems.filter(i => i.summaryId === summary.id);
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
        scheduleOfWorkId: destId,
        totalCost: summaryTotal,
        createdAt: new Date().toISOString(),
      });
      scheduleTotal += summaryTotal;
    }
    return scheduleTotal;
  };

  // ── Copy summaries + items for the main (or sub) schedule ─────────────────
  await copySummariesAndItems(sourceScheduleId, newSchedulePayload.id);

  // ── Copy child sub-schedules (only relevant when duplicating a main work) ──
  const allSchedules = await getAllFromDB('schedulesOfWork');
  const subSchedules = allSchedules
    .filter(s => s.parentId === sourceScheduleId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const newSubSchedules = [];
  for (const sub of subSchedules) {
    const newSubId = crypto.randomUUID();
    const newSub = {
      ...sub,
      id:         newSubId,
      parentId:   newSchedulePayload.id,  // re-parent to the cloned main schedule
      workCode:   '',                      // corrected by caller's computeWorkCodeUpdates
      totalCost:  0,
      isExcluded: newSchedulePayload.isExcluded ?? false,
      createdAt:  new Date().toISOString(),
    };
    await executeCreate('schedulesOfWork', newSub);
    await copySummariesAndItems(sub.id, newSubId);
    newSubSchedules.push(newSub);
  }

  // ── Bottom-up cost recompute ───────────────────────────────────────────────
  // Sub-schedules MUST be recomputed before the main schedule so that
  // recomputeScheduleCost(main) reads the correct subsTotal from IDB.
  const { recomputeScheduleCost } = await import('./billing');
  for (const sub of newSubSchedules) {
    await recomputeScheduleCost(sub.id);
  }
  // Now recompute the main schedule — subsTotal is already populated in IDB
  await recomputeScheduleCost(newSchedulePayload.id);

  notifyUpdate('schedulesOfWork');
  notifyUpdate('scheduleSummaries');
  notifyUpdate('summaryItems');

  return { newSchedule: newSchedulePayload, newSubSchedules };
};
