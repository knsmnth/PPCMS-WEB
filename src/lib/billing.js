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

/**
 * Applies a cost delta starting from a summary, propagating upward through
 * schedule → project → facility → campus.
 *
 * Usage: cascadeCostUpdate(500, 'summaryId123')
 */
export async function cascadeCostUpdate(deltaCost, scheduleSummaryId) {
  if (deltaCost === 0) return;
  try {
    // 1. Summary
    const summary = await getFromDB('scheduleSummaries', scheduleSummaryId);
    if (!summary) return;
    await saveAndNotify('scheduleSummaries', { ...summary, totalCost: (summary.totalCost || 0) + deltaCost });

    // 2. Schedule of Work
    const sched = await getFromDB('schedulesOfWork', summary.scheduleOfWorkId);
    if (!sched) return;
    await saveAndNotify('schedulesOfWork', { ...sched, totalCost: (sched.totalCost || 0) + deltaCost });

    // 3–5. Recompute project / facility / campus from ground truth
    await recomputeProjectCost(sched.projectId);

    console.log('[Billing] Cost delta cascaded:', deltaCost);
    triggerSync();
  } catch (err) {
    console.error('[Billing] cascadeCostUpdate failed:', err);
  }
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
    // 1. Compute project total from non-excluded schedules
    const allSchedules = await getAllFromDB('schedulesOfWork');
    const projectTotal = allSchedules
      .filter(s => s.projectId === projectId && !s.isExcluded)
      .reduce((sum, s) => sum + (s.totalCost || 0), 0);

    const proj = await getFromDB('projects', projectId);
    if (!proj) return;
    const updatedProj = await saveAndNotify('projects', { ...proj, totalCost: projectTotal });

    // 2. Compute facility total from all its projects (fresh from IDB after project update)
    if (!updatedProj.facilityId) return;
    const allProjects = await getAllFromDB('projects');
    const facilityTotal = allProjects
      .filter(p => p.facilityId === updatedProj.facilityId)
      .reduce((sum, p) => sum + (p.totalCost || 0), 0);

    const fac = await getFromDB('facilities', updatedProj.facilityId);
    if (!fac) return;
    const updatedFac = await saveAndNotify('facilities', { ...fac, totalCost: facilityTotal });

    // 3. Compute campus total from all its facilities (fresh from IDB after facility update)
    if (!updatedFac.campusId) return;
    const allFacilities = await getAllFromDB('facilities');
    const campusTotal = allFacilities
      .filter(f => f.campusId === updatedFac.campusId)
      .reduce((sum, f) => sum + (f.totalCost || 0), 0);

    const camp = await getFromDB('campuses', updatedFac.campusId);
    if (!camp) return;
    await saveAndNotify('campuses', { ...camp, totalCost: campusTotal });

    console.log('[Billing] Project cost recomputed:', projectId, '→', projectTotal);
    triggerSync();
  } catch (err) {
    console.error('[Billing] recomputeProjectCost failed:', err);
  }
}
