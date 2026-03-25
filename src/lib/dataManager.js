/**
 * dataManager.js
 * Central service for all data management operations.
 *
 * Data hierarchy:
 *   campuses
 *     └── facilities  (facility.campusId)
 *           └── projects  (project.facilityId)
 *                 └── schedulesOfWork  (sow.projectId)
 *                       └── scheduleSummaries  (summary.scheduleOfWorkId)
 *                             └── summaryItems  (item.summaryId)
 *
 * Reference stores (no parent):  materials | equipments | laborTypes
 *
 * Scopes for export / upload / download:
 *   'all'      → every store
 *   'campus'   → selected campus IDs + cascaded children
 *   'facility' → selected facility IDs + cascaded children
 *   'project'  → selected project IDs + cascaded children
 */

import { db as firestore } from './firebase';
import {
  collection,
  getDocs,
  writeBatch,
  doc,
  query,
  limit,
  startAfter,
  where,
} from 'firebase/firestore';
import {
  getAllFromDB,
  getFromDB,
  clearAllStores,
  bulkPutToDB,
  getAllFromIndexDB,
  ALL_STORES,
} from './db';

// ─── Constants ───────────────────────────────────────────────────────────────

const BATCH_SIZE = 450;
const PAGE_SIZE = 500;
const BACKUP_VERSION = 2;

/** Reference stores — always included in every scope. */
const REFERENCE_STORES = ['materials', 'equipments', 'laborTypes'];

export const SCOPE_OPTIONS = [
  { value: 'all',      label: 'Everything',               description: 'All stores — full backup' },
  { value: 'campus',   label: 'Campus & All Connected',   description: 'Selected campus(es) + facilities, projects, SOWs, summaries, items' },
  { value: 'facility', label: 'Facility & All Connected', description: 'Selected facility(ies) + projects, SOWs, summaries, items' },
  { value: 'project',  label: 'Projects & Below',         description: 'Selected project(s) + SOWs, summaries, items' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function commitBatchesSequentially(batches, onProgress, phaseLabel) {
  for (let i = 0; i < batches.length; i++) {
    await batches[i].commit();
    if (onProgress) {
      onProgress({
        phase: phaseLabel,
        current: i + 1,
        total: batches.length,
        pct: Math.round(((i + 1) / batches.length) * 100),
      });
    }
  }
}

/**
 * Paginate through a full Firestore collection.
 */
async function fetchAllFromFirestoreCollection(collectionName) {
  const docs = [];
  let lastDoc = null;
  while (true) {
    let q = query(collection(firestore, collectionName), limit(PAGE_SIZE));
    if (lastDoc) q = query(collection(firestore, collectionName), limit(PAGE_SIZE), startAfter(lastDoc));
    const snap = await getDocs(q);
    if (snap.empty) break;
    snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < PAGE_SIZE) break;
  }
  return docs;
}

/**
 * Fetch Firestore docs where `field` is in `ids`.
 * Chunks the `in` query (Firestore limit: 30 per `in` clause).
 */
async function fetchFirestoreByField(collectionName, field, ids) {
  if (!ids || ids.length === 0) return [];
  const docs = [];
  for (const idChunk of chunk(ids, 30)) {
    const q = query(collection(firestore, collectionName), where(field, 'in', idChunk));
    const snap = await getDocs(q);
    snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));
  }
  return docs;
}

// ─── Cascaded IDB fetch ──────────────────────────────────────────────────────

/**
 * Given a scope and a set of seed IDs, cascade through the hierarchy
 * and return { storeName: [...items] } for every relevant store.
 */
async function collectScopedStores(scope, selectedIds) {
  const ids = Array.from(selectedIds);
  const stores = {};

  // reference stores — always included
  for (const s of REFERENCE_STORES) {
    stores[s] = await getAllFromDB(s);
  }

  if (scope === 'all') {
    for (const s of ALL_STORES) {
      if (!stores[s]) stores[s] = await getAllFromDB(s);
    }
    return stores;
  }

  // ── Campus scope ────────────────────────────────────────────────────────────
  let campusIds = [];
  let facilityIds = [];
  let projectIds = [];
  let sowIds = [];
  let summaryIds = [];

  if (scope === 'campus') {
    campusIds = ids;
    const allCampuses = await getAllFromDB('campuses');
    stores['campuses'] = allCampuses.filter((c) => campusIds.includes(c.id));

    // facilities under these campuses
    const allFacilities = [];
    for (const cId of campusIds) {
      const facs = await getAllFromIndexDB('facilities', 'campusId', cId);
      allFacilities.push(...facs);
    }
    stores['facilities'] = allFacilities;
    facilityIds = allFacilities.map((f) => f.id);
  }

  // ── Facility scope ──────────────────────────────────────────────────────────
  if (scope === 'facility') {
    facilityIds = ids;
    const allFacilities = await getAllFromDB('facilities');
    stores['facilities'] = allFacilities.filter((f) => facilityIds.includes(f.id));
  }

  // Projects (shared by campus + facility scope)
  if (scope === 'campus' || scope === 'facility') {
    const allProjects = [];
    for (const fId of facilityIds) {
      const projs = await getAllFromIndexDB('projects', 'facilityId', fId);
      allProjects.push(...projs);
    }
    stores['projects'] = allProjects;
    projectIds = allProjects.map((p) => p.id);
  }

  // ── Project scope ───────────────────────────────────────────────────────────
  if (scope === 'project') {
    projectIds = ids;
    const allProjects = await getAllFromDB('projects');
    stores['projects'] = allProjects.filter((p) => projectIds.includes(p.id));
  }

  // SOWs (shared by all non-all scopes)
  const allSOWs = [];
  for (const pId of projectIds) {
    const sows = await getAllFromIndexDB('schedulesOfWork', 'projectId', pId);
    allSOWs.push(...sows);
  }
  stores['schedulesOfWork'] = allSOWs;
  sowIds = allSOWs.map((s) => s.id);

  // Summaries
  const allSummaries = [];
  for (const sId of sowIds) {
    const summaries = await getAllFromIndexDB('scheduleSummaries', 'scheduleOfWorkId', sId);
    allSummaries.push(...summaries);
  }
  stores['scheduleSummaries'] = allSummaries;
  summaryIds = allSummaries.map((s) => s.id);

  // Summary Items
  const allItems = [];
  for (const smId of summaryIds) {
    const items = await getAllFromIndexDB('summaryItems', 'summaryId', smId);
    allItems.push(...items);
  }
  stores['summaryItems'] = allItems;

  return stores;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function clearLocalData() {
  await clearAllStores();
}

/**
 * Export scoped data as a downloadable JSON backup.
 * @param {'all'|'campus'|'facility'|'project'} scope
 * @param {string[]} selectedIds  entity IDs for the chosen scope (ignored when 'all')
 * @param {function} onProgress
 */
export async function exportAllData(scope = 'all', selectedIds = [], onProgress) {
  if (onProgress) onProgress({ phase: 'Reading data', pct: 0 });

  const stores = await collectScopedStores(scope, new Set(selectedIds));

  if (onProgress) onProgress({ phase: 'Building file', pct: 90 });

  const payload = {
    version: BACKUP_VERSION,
    scope,
    exportedAt: new Date().toISOString(),
    stores,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const datePart = new Date().toISOString().split('T')[0];
  const filename = `ppoms-backup-${scope}-${datePart}.json`;

  if (onProgress) onProgress({ phase: 'Done', pct: 100 });

  return { blob, filename, payload };
}

/**
 * Analyse a backup JSON without writing anything.
 * Returns counts: total, newCount (not in IDB), existingCount (already in IDB).
 */
export async function previewImport(jsonOrString) {
  const payload = typeof jsonOrString === 'string' ? JSON.parse(jsonOrString) : jsonOrString;
  if (!payload?.stores) throw new Error('Invalid backup file: missing "stores" key.');

  let total = 0, newCount = 0, existingCount = 0;
  const byStore = {};

  for (const storeName of Object.keys(payload.stores)) {
    if (!ALL_STORES.includes(storeName)) continue;
    const items = payload.stores[storeName] || [];
    let storeNew = 0, storeExisting = 0;

    for (const item of items) {
      const existing = await getFromDB(storeName, item.id);
      existing ? storeExisting++ : storeNew++;
    }

    total += items.length;
    newCount += storeNew;
    existingCount += storeExisting;
    byStore[storeName] = { total: items.length, new: storeNew, existing: storeExisting };
  }

  return { total, newCount, existingCount, byStore };
}

/**
 * Import — REPLACE ALL. Wipes local data first, then writes all stores.
 */
export async function importAllData(jsonOrString, onProgress) {
  const payload = typeof jsonOrString === 'string' ? JSON.parse(jsonOrString) : jsonOrString;
  if (!payload?.stores) throw new Error('Invalid backup file: missing "stores" key.');

  await clearAllStores();

  const storeNames = Object.keys(payload.stores);
  for (let i = 0; i < storeNames.length; i++) {
    const storeName = storeNames[i];
    const items = payload.stores[storeName] || [];
    if (ALL_STORES.includes(storeName)) await bulkPutToDB(storeName, items);
    if (onProgress) {
      onProgress({
        phase: 'Restoring',
        storeName,
        current: i + 1,
        total: storeNames.length,
        pct: Math.round(((i + 1) / storeNames.length) * 100),
      });
    }
  }
}

/**
 * Import — ADD MISSING ONLY. Skips any record whose id already exists in IDB.
 * @returns {number} count of records actually added
 */
export async function importMissingData(jsonOrString, onProgress) {
  const payload = typeof jsonOrString === 'string' ? JSON.parse(jsonOrString) : jsonOrString;
  if (!payload?.stores) throw new Error('Invalid backup file: missing "stores" key.');

  const storeNames = Object.keys(payload.stores).filter((s) => ALL_STORES.includes(s));
  let totalAdded = 0;

  for (let i = 0; i < storeNames.length; i++) {
    const storeName = storeNames[i];
    const items = payload.stores[storeName] || [];

    const newItems = [];
    for (const item of items) {
      const exists = await getFromDB(storeName, item.id);
      if (!exists) newItems.push(item);
    }
    if (newItems.length > 0) await bulkPutToDB(storeName, newItems);
    totalAdded += newItems.length;

    if (onProgress) {
      onProgress({
        phase: 'Adding new records',
        storeName,
        current: i + 1,
        total: storeNames.length,
        pct: Math.round(((i + 1) / storeNames.length) * 100),
      });
    }
  }

  return totalAdded;
}

/**
 * Upload scoped IndexedDB snapshot to Firestore (chunked batches).
 */
export async function uploadToFirestore(onProgress, scope = 'all', selectedIds = []) {
  const storeMap = await collectScopedStores(scope, new Set(selectedIds));
  const allDocs = Object.entries(storeMap).flatMap(([storeName, items]) =>
    items.map((item) => ({ storeName, item }))
  );

  if (allDocs.length === 0) {
    if (onProgress) onProgress({ phase: 'Upload', current: 0, total: 0, pct: 100 });
    return 0;
  }

  const batches = chunk(allDocs, BATCH_SIZE).map((c) => {
    const batch = writeBatch(firestore);
    c.forEach(({ storeName, item }) =>
      batch.set(doc(firestore, storeName, item.id), item, { merge: true })
    );
    return batch;
  });

  await commitBatchesSequentially(batches, onProgress, 'Uploading');
  return allDocs.length;
}

/**
 * Download from Firestore into local IDB (scoped).
 * For 'all' — paginated full collection reads.
 * For scoped — uses 'in' queries cascaded through the hierarchy.
 */
export async function downloadFromFirestore(onProgress, scope = 'all', selectedIds = []) {
  let totalFetched = 0;
  const ids = selectedIds;

  if (scope === 'all') {
    for (let i = 0; i < ALL_STORES.length; i++) {
      const storeName = ALL_STORES[i];
      if (onProgress) {
        onProgress({ phase: 'Downloading', storeName, current: i, total: ALL_STORES.length, pct: Math.round((i / ALL_STORES.length) * 100) });
      }
      const docs = await fetchAllFromFirestoreCollection(storeName);
      if (docs.length > 0) { await bulkPutToDB(storeName, docs); totalFetched += docs.length; }
    }
    if (onProgress) onProgress({ phase: 'Downloading', current: ALL_STORES.length, total: ALL_STORES.length, pct: 100 });
    return totalFetched;
  }

  // ── Scoped download ────────────────────────────────────────────────────────
  let campusIds = [], facilityIds = [], projectIds = [], sowIds = [], summaryIds = [];

  const report = (phase, pct) => onProgress?.({ phase, pct, current: Math.round(pct), total: 100 });

  if (scope === 'campus') {
    campusIds = ids;
    const campusDocs = await fetchFirestoreByField('campuses', '__name__', campusIds)
      .catch(() => fetchAllFromFirestoreCollection('campuses').then(d => d.filter(c => campusIds.includes(c.id))));
    // Simpler: fetch all campuses and filter by id since campuses is usually small
    const allCampuses = await fetchAllFromFirestoreCollection('campuses');
    const filteredCampuses = allCampuses.filter((c) => campusIds.includes(c.id));
    if (filteredCampuses.length) { await bulkPutToDB('campuses', filteredCampuses); totalFetched += filteredCampuses.length; }
    report('Fetching facilities', 10);
    const facilityDocs = await fetchFirestoreByField('facilities', 'campusId', campusIds);
    if (facilityDocs.length) { await bulkPutToDB('facilities', facilityDocs); totalFetched += facilityDocs.length; }
    facilityIds = facilityDocs.map((f) => f.id);
  } else if (scope === 'facility') {
    facilityIds = ids;
    const facilityDocs = await fetchAllFromFirestoreCollection('facilities').then(d => d.filter(f => facilityIds.includes(f.id)));
    if (facilityDocs.length) { await bulkPutToDB('facilities', facilityDocs); totalFetched += facilityDocs.length; }
  }

  if (scope === 'campus' || scope === 'facility') {
    report('Fetching projects', 25);
    const projectDocs = await fetchFirestoreByField('projects', 'facilityId', facilityIds);
    if (projectDocs.length) { await bulkPutToDB('projects', projectDocs); totalFetched += projectDocs.length; }
    projectIds = projectDocs.map((p) => p.id);
  } else if (scope === 'project') {
    projectIds = ids;
    const projectDocs = await fetchAllFromFirestoreCollection('projects').then(d => d.filter(p => projectIds.includes(p.id)));
    if (projectDocs.length) { await bulkPutToDB('projects', projectDocs); totalFetched += projectDocs.length; }
  }

  report('Fetching schedules', 50);
  const sowDocs = await fetchFirestoreByField('schedulesOfWork', 'projectId', projectIds);
  if (sowDocs.length) { await bulkPutToDB('schedulesOfWork', sowDocs); totalFetched += sowDocs.length; }
  sowIds = sowDocs.map((s) => s.id);

  report('Fetching summaries', 65);
  const summaryDocs = await fetchFirestoreByField('scheduleSummaries', 'scheduleOfWorkId', sowIds);
  if (summaryDocs.length) { await bulkPutToDB('scheduleSummaries', summaryDocs); totalFetched += summaryDocs.length; }
  summaryIds = summaryDocs.map((s) => s.id);

  report('Fetching items', 80);
  const itemDocs = await fetchFirestoreByField('summaryItems', 'summaryId', summaryIds);
  if (itemDocs.length) { await bulkPutToDB('summaryItems', itemDocs); totalFetched += itemDocs.length; }

  // Reference stores — always full download
  report('Fetching reference data', 90);
  for (const s of REFERENCE_STORES) {
    const docs = await fetchAllFromFirestoreCollection(s);
    if (docs.length) { await bulkPutToDB(s, docs); totalFetched += docs.length; }
  }

  report('Done', 100);
  return totalFetched;
}

/**
 * Delete ALL data — both Firestore collections AND local IndexedDB.
 */
export async function deleteAllData(onProgress) {
  let totalDeleted = 0;
  const totalSteps = ALL_STORES.length + 1;

  for (let i = 0; i < ALL_STORES.length; i++) {
    const storeName = ALL_STORES[i];
    if (onProgress) {
      onProgress({ phase: 'Deleting from Firestore', current: i, total: totalSteps, pct: Math.round((i / totalSteps) * 100), storeName });
    }
    let hasMore = true;
    while (hasMore) {
      const q = query(collection(firestore, storeName), limit(BATCH_SIZE));
      const snap = await getDocs(q);
      if (snap.empty) { hasMore = false; break; }
      const batch = writeBatch(firestore);
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      totalDeleted += snap.docs.length;
      if (snap.docs.length < BATCH_SIZE) hasMore = false;
    }
  }

  if (onProgress) {
    onProgress({ phase: 'Clearing local cache', current: ALL_STORES.length, total: totalSteps, pct: Math.round((ALL_STORES.length / totalSteps) * 100) });
  }
  await clearAllStores();

  if (onProgress) onProgress({ phase: 'Complete', current: totalSteps, total: totalSteps, pct: 100 });
  return totalDeleted;
}
