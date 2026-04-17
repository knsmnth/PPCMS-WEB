import { openDB } from 'idb';

const DB_NAME = 'ppoms-offline-db';
const DB_VERSION = 2; // Incremented for Index Creation

export const ALL_STORES = [
  'campuses',
  'facilities',
  'projects',
  'schedulesOfWork',
  'scheduleSummaries',
  'summaryItems',
  'materials',

  'laborTypes',
];

export async function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      if (!db.objectStoreNames.contains('campuses')) {
        db.createObjectStore('campuses', { keyPath: 'id' });
      }
      
      let facilitiesStore;
      if (!db.objectStoreNames.contains('facilities')) {
        facilitiesStore = db.createObjectStore('facilities', { keyPath: 'id' });
      } else {
        facilitiesStore = transaction.objectStore('facilities');
      }
      if (!facilitiesStore.indexNames.contains('campusId')) {
        facilitiesStore.createIndex('campusId', 'campusId');
      }

      let projectsStore;
      if (!db.objectStoreNames.contains('projects')) {
        projectsStore = db.createObjectStore('projects', { keyPath: 'id' });
      } else {
        projectsStore = transaction.objectStore('projects');
      }
      if (!projectsStore.indexNames.contains('facilityId')) {
        projectsStore.createIndex('facilityId', 'facilityId');
      }

      let schedulesStore;
      if (!db.objectStoreNames.contains('schedulesOfWork')) {
        schedulesStore = db.createObjectStore('schedulesOfWork', { keyPath: 'id' });
      } else {
        schedulesStore = transaction.objectStore('schedulesOfWork');
      }
      if (!schedulesStore.indexNames.contains('projectId')) {
        schedulesStore.createIndex('projectId', 'projectId');
      }

      let summariesStore;
      if (!db.objectStoreNames.contains('scheduleSummaries')) {
        summariesStore = db.createObjectStore('scheduleSummaries', { keyPath: 'id' });
      } else {
        summariesStore = transaction.objectStore('scheduleSummaries');
      }
      if (!summariesStore.indexNames.contains('scheduleOfWorkId')) {
        summariesStore.createIndex('scheduleOfWorkId', 'scheduleOfWorkId');
      }

      let itemsStore;
      if (!db.objectStoreNames.contains('summaryItems')) {
        itemsStore = db.createObjectStore('summaryItems', { keyPath: 'id' });
      } else {
        itemsStore = transaction.objectStore('summaryItems');
      }
      if (!itemsStore.indexNames.contains('summaryId')) {
        itemsStore.createIndex('summaryId', 'summaryId');
      }

      if (!db.objectStoreNames.contains('materials')) {
        db.createObjectStore('materials', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('laborTypes')) {
        db.createObjectStore('laborTypes', { keyPath: 'id' });
      }
      
      // syncQueue holds documents waiting to be pushed to Firebase
      if (!db.objectStoreNames.contains('syncQueue')) {
        const queueStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        queueStore.createIndex('collection', 'collection');
      }
    },
  });
}

// Helpers
export async function getFromDB(storeName, id) {
  const db = await initDB();
  return db.get(storeName, id);
}

export async function getAllFromDB(storeName) {
  const db = await initDB();
  return db.getAll(storeName);
}

// 100k Scale Optimization: Index fetching
export async function getAllFromIndexDB(storeName, indexName, value) {
  const db = await initDB();
  return db.getAllFromIndex(storeName, indexName, value);
}

export async function putToDB(storeName, item) {
  const db = await initDB();
  return db.put(storeName, item);
}

export async function deleteFromDB(storeName, id) {
  const db = await initDB();
  return db.delete(storeName, id);
}

// Sync Queue operations
export async function addToSyncQueue(operation) {
  const db = await initDB();
  return db.put('syncQueue', operation);
}

export async function getSyncQueue() {
  const db = await initDB();
  return db.getAll('syncQueue');
}

export async function removeFromSyncQueue(id) {
  const db = await initDB();
  return db.delete('syncQueue', id);
}

// ─── Bulk / Clear Helpers ────────────────────────────────────────────────────

export async function clearStore(storeName) {
  const db = await initDB();
  return db.clear(storeName);
}

export async function clearAllStores() {
  const db = await initDB();
  await Promise.all(ALL_STORES.map((s) => db.clear(s)));
  // Also wipe the offline sync queue so stale ops don't re-upload
  await db.clear('syncQueue');
}

export async function bulkPutToDB(storeName, items) {
  if (!items || items.length === 0) return;
  const db = await initDB();
  const tx = db.transaction(storeName, 'readwrite');
  await Promise.all([...items.map((item) => tx.store.put(item)), tx.done]);
}
