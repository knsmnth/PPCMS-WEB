import { getAllFromDB, getFromDB, putToDB, addToSyncQueue } from './db';

const notifyUpdate = (collectionName) => {
  window.dispatchEvent(new CustomEvent('localDataUpdated', { detail: collectionName }));
};

const triggerSync = () => {
  window.dispatchEvent(new Event('triggerSync'));
};

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Write a record, enqueue for sync, and notify listeners. */
const saveAndNotify = async (collection, record) => {
  const updated = { ...record, updatedAt: new Date().toISOString() };
  await putToDB(collection, updated);
  await addToSyncQueue({ type: 'update', collection, payload: updated });
  notifyUpdate(collection);
  return updated;
};

// ─── Delta cascade (item add / remove inside a summary) ───────────────────────

export async function recomputeSummaryCost(summaryId) {
  if (!summaryId) return;
  try {
    const summary = await getFromDB('scheduleSummaries', summaryId);
    if (!summary) return;

    const allItems = await getAllFromDB('summaryItems');
    const totalBaseCost = allItems
      .filter(i => i.summaryId === summaryId && !i.isExcluded)
      .reduce((sum, i) => sum + (i.totalCost || 0), 0);

    const sched = await getFromDB('schedulesOfWork', summary.scheduleOfWorkId);
    const project = sched ? await getFromDB('projects', sched.projectId) : null;

    const isLaborType = summary.type === 'labor';
    const showLabor = summary.type === 'material' && summary.showLabor !== false;
    const showTools = summary.showTools !== false;
    const showOcm = summary.showOcm !== false;

    const laborPercentage = summary.laborPercentage || project?.defaultLaborPercentage || 0;
    const toolsPercentage = summary.toolsPercentage || project?.defaultToolsPercentage || 0;
    const ocmPercentage = summary.ocmPercentage || project?.defaultOcmPercentage || 0;

    const totalLaborCost = isLaborType 
      ? totalBaseCost
      : (showLabor && !summary.excludeLabor ? totalBaseCost * (laborPercentage / 100) : 0);

    const totalToolsCost = (showTools && !summary.excludeTools) ? (totalBaseCost * (toolsPercentage / 100)) : 0;

    const ocmBase = isLaborType
      ? totalBaseCost + totalToolsCost
      : totalBaseCost + totalLaborCost + totalToolsCost;

    const totalOcmCost = (showOcm && !summary.excludeOcm) ? (ocmBase * (ocmPercentage / 100)) : 0;

    let groupTotalCost = 0;
    if (isLaborType) {
      groupTotalCost = totalBaseCost + totalToolsCost + totalOcmCost;
    } else {
      groupTotalCost = totalBaseCost + totalLaborCost + totalToolsCost + totalOcmCost;
    }

    await saveAndNotify('scheduleSummaries', { ...summary, totalCost: groupTotalCost });

    await recomputeScheduleCost(summary.scheduleOfWorkId);
  } catch (err) {
    console.error('[Billing] recomputeSummaryCost failed:', err);
  }
}

export async function recomputeScheduleCost(scheduleId) {
  if (!scheduleId) return;
  try {
    const sched = await getFromDB('schedulesOfWork', scheduleId);
    if (!sched) return;

    // 1. Sum up all summaries directly attached to this schedule
    const allSummaries = await getAllFromDB('scheduleSummaries');
    const ownSummariesTotal = allSummaries
      .filter(s => s.scheduleOfWorkId === scheduleId && !s.isExcluded)
      .reduce((sum, s) => sum + (s.totalCost || 0), 0);

    const allSchedules = await getAllFromDB('schedulesOfWork');
    
    // 2. If this is a main schedule, sum up the total cost of all its sub-schedules
    let subsTotal = 0;
    if (!sched.parentId) {
      subsTotal = allSchedules
        .filter(s => s.parentId === scheduleId && !s.isExcluded)
        .reduce((sum, s) => sum + (s.totalCost || 0), 0);
    }

    const schedTotal = ownSummariesTotal + subsTotal;
    await saveAndNotify('schedulesOfWork', { ...sched, totalCost: schedTotal });

    // 3. Propagate up the hierarchy
    if (sched.parentId) {
      // If it's a sub-schedule, updating its cost must trigger an update on its main schedule
      await recomputeScheduleCost(sched.parentId);
    } else {
      // If it's a main schedule, update the project cost
      await recomputeProjectCost(sched.projectId);
    }
  } catch (err) {
    console.error('[Billing] recomputeScheduleCost failed:', err);
  }
}

export async function cascadeCostUpdate(deltaCost, scheduleSummaryId) {
  // Backwards compatibility wrapper
  await recomputeSummaryCost(scheduleSummaryId);
}

// ─── Ground-truth recomputation ───────────────────────────────────────────────

/**
 * Recomputes a project's totalCost as the sum of its non-excluded schedules,
 * then propagates the corrected value up to facility and campus.
 *
 * This is the single source of truth for any operation that may change which
 * schedules are included (exclusion toggle, deletion, duplication).
 *
 * @param {string} projectId
 */
export async function recomputeProjectCost(projectId) {
  if (!projectId) return;
  try {
    // 1. Compute project total from non-excluded MAIN schedules (sub-schedules are rolled up inside main schedules)
    const allSchedules = await getAllFromDB('schedulesOfWork');
    const projectTotal = allSchedules
      .filter(s => s.projectId === projectId && !s.parentId && !s.isExcluded)
      .reduce((sum, s) => sum + (s.totalCost || 0), 0);

    const proj = await getFromDB('projects', projectId);
    if (!proj) return;
    const updatedProj = await saveAndNotify('projects', { ...proj, totalCost: projectTotal });

    // 2. Compute facility total from all its projects (fresh from IDB after project update)
    if (updatedProj.facilityId) {
      await recomputeFacilityCost(updatedProj.facilityId);
    } else {
      triggerSync();
    }
  } catch (err) {
    console.error('[Billing] recomputeProjectCost failed:', err);
  }
}

export async function recomputeFacilityCost(facilityId) {
  if (!facilityId) return;
  try {
    const allProjects = await getAllFromDB('projects');
    const facilityTotal = allProjects
      .filter(p => p.facilityId === facilityId && !p.isExcluded)
      .reduce((sum, p) => sum + (p.totalCost || 0), 0);

    const fac = await getFromDB('facilities', facilityId);
    if (!fac) return;
    const updatedFac = await saveAndNotify('facilities', { ...fac, totalCost: facilityTotal });

    if (updatedFac.campusId) {
      await recomputeCampusCost(updatedFac.campusId);
    } else {
      triggerSync();
    }
  } catch (err) {
    console.error('[Billing] recomputeFacilityCost failed:', err);
  }
}

export async function recomputeCampusCost(campusId) {
  if (!campusId) return;
  try {
    const allFacilities = await getAllFromDB('facilities');
    const campusTotal = allFacilities
      .filter(f => f.campusId === campusId && !f.isExcluded)
      .reduce((sum, f) => sum + (f.totalCost || 0), 0);

    const camp = await getFromDB('campuses', campusId);
    if (!camp) return;
    await saveAndNotify('campuses', { ...camp, totalCost: campusTotal });

    triggerSync();
  } catch (err) {
    console.error('[Billing] recomputeCampusCost failed:', err);
  }
}
