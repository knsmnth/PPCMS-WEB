import { getFromDB, putToDB, addToSyncQueue } from './db';

const notifyUpdate = (collectionName) => {
  window.dispatchEvent(new CustomEvent('localDataUpdated', { detail: collectionName }));
};

const triggerSync = () => {
  window.dispatchEvent(new Event('triggerSync'));
};

// Process a cascading cost update starting from a known delta
// Usage: cascadeCostUpdate(500, 'summaryId123')
export async function cascadeCostUpdate(deltaCost, scheduleSummaryId) {
  if (deltaCost === 0) return;

  try {
    // 1. Update Schedule Summary
    const summary = await getFromDB('scheduleSummaries', scheduleSummaryId);
    if (!summary) return;
    const sTotal = (summary.totalCost || 0) + deltaCost;
    const updSummary = { ...summary, totalCost: sTotal, updatedAt: new Date().toISOString() };
    await putToDB('scheduleSummaries', updSummary);
    await addToSyncQueue({ type: 'update', collection: 'scheduleSummaries', payload: updSummary });
    notifyUpdate('scheduleSummaries');

    // 2. Update Schedule of Work
    const sched = await getFromDB('schedulesOfWork', summary.scheduleOfWorkId);
    if (!sched) return;
    const schTotal = (sched.totalCost || 0) + deltaCost;
    const updSched = { ...sched, totalCost: schTotal, updatedAt: new Date().toISOString() };
    await putToDB('schedulesOfWork', updSched);
    await addToSyncQueue({ type: 'update', collection: 'schedulesOfWork', payload: updSched });
    notifyUpdate('schedulesOfWork');

    // 3. Update Project
    const proj = await getFromDB('projects', sched.projectId);
    if (!proj) return;
    const pTotal = (proj.totalCost || 0) + deltaCost;
    const updProj = { ...proj, totalCost: pTotal, updatedAt: new Date().toISOString() };
    await putToDB('projects', updProj);
    await addToSyncQueue({ type: 'update', collection: 'projects', payload: updProj });
    notifyUpdate('projects');

    // 4. Update Facility
    const fac = await getFromDB('facilities', proj.facilityId);
    if (!fac) return;
    const fTotal = (fac.totalCost || 0) + deltaCost;
    const updFac = { ...fac, totalCost: fTotal, updatedAt: new Date().toISOString() };
    await putToDB('facilities', updFac);
    await addToSyncQueue({ type: 'update', collection: 'facilities', payload: updFac });
    notifyUpdate('facilities');

    // 5. Update Campus
    const camp = await getFromDB('campuses', fac.campusId);
    if (!camp) return;
    const cTotal = (camp.totalCost || 0) + deltaCost;
    const updCamp = { ...camp, totalCost: cTotal, updatedAt: new Date().toISOString() };
    await putToDB('campuses', updCamp);
    await addToSyncQueue({ type: 'update', collection: 'campuses', payload: updCamp });
    notifyUpdate('campuses');

    console.log('[Billing] Successfully cascaded cost delta:', deltaCost);
    triggerSync();
  } catch (error) {
    console.error('[Billing] Failed to cascade cost update:', error);
  }
}

