import { getAllFromDB, getFromDB, deleteFromDB, addToSyncQueue, getAllFromIndexDB } from './db';

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
  }
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
    await executeDelete('facilities', id);
    let projects = [];
    try { projects = await getAllFromIndexDB('projects', 'facilityId', id); } 
    catch { projects = (await getAllFromDB('projects')).filter(p => p.facilityId === id); }
    for (const p of projects) {
      await cascadeDelete('project', p.id);
    }
  }
  else if (type === 'project') {
    await executeDelete('projects', id);
    let schedules = [];
    try { schedules = await getAllFromIndexDB('schedulesOfWork', 'projectId', id); } 
    catch { schedules = (await getAllFromDB('schedulesOfWork')).filter(s => s.projectId === id); }
    for (const s of schedules) {
      await cascadeDelete('schedule', s.id);
    }
  }
  else if (type === 'schedule') {
    await executeDelete('schedulesOfWork', id);
    let summaries = [];
    try { summaries = await getAllFromIndexDB('scheduleSummaries', 'scheduleOfWorkId', id); } 
    catch { summaries = (await getAllFromDB('scheduleSummaries')).filter(s => s.scheduleOfWorkId === id); }
    for (const sum of summaries) {
      await cascadeDelete('summary', sum.id);
    }
  }
  else if (type === 'summary') {
    await executeDelete('scheduleSummaries', id);
    let items = [];
    try { items = await getAllFromIndexDB('summaryItems', 'summaryId', id); } 
    catch { items = (await getAllFromDB('summaryItems')).filter(i => i.summaryId === id); }
    for (const item of items) {
      await executeDelete('summaryItems', item.id);
    }
  }
};
