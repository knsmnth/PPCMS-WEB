import { openDB } from 'idb';

const DB_NAME = 'ppoms-offline-db';
const DB_VERSION = 5; // Incremented for Schedule-Group mapping

export const ALL_STORES = [
  'campuses',
  'facilities',
  'projects',
  'schedulesOfWork',
  'scheduleSummaries',
  'summaryItems',
  'materials',
  'laborTypes',
  'workGroupTemplates',
  'workGroupTemplateItems',
  'scheduleTemplates',
  'scheduleTemplateWorks',
  'scheduleTemplateWorkGroups',
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

      if (!db.objectStoreNames.contains('workGroupTemplates')) {
        db.createObjectStore('workGroupTemplates', { keyPath: 'id' });
      }

      let groupItemsStore;
      if (!db.objectStoreNames.contains('workGroupTemplateItems')) {
        groupItemsStore = db.createObjectStore('workGroupTemplateItems', { keyPath: 'id' });
      } else {
        groupItemsStore = transaction.objectStore('workGroupTemplateItems');
      }
      if (!groupItemsStore.indexNames.contains('templateId')) {
        groupItemsStore.createIndex('templateId', 'templateId');
      }

      if (!db.objectStoreNames.contains('scheduleTemplates')) {
        db.createObjectStore('scheduleTemplates', { keyPath: 'id' });
      }

      let templateWorksStore;
      if (!db.objectStoreNames.contains('scheduleTemplateWorks')) {
        templateWorksStore = db.createObjectStore('scheduleTemplateWorks', { keyPath: 'id' });
      } else {
        templateWorksStore = transaction.objectStore('scheduleTemplateWorks');
      }
      if (!templateWorksStore.indexNames.contains('templateId')) {
        templateWorksStore.createIndex('templateId', 'templateId');
      }

      let workGroupLinksStore;
      if (!db.objectStoreNames.contains('scheduleTemplateWorkGroups')) {
        workGroupLinksStore = db.createObjectStore('scheduleTemplateWorkGroups', { keyPath: 'id' });
      } else {
        workGroupLinksStore = transaction.objectStore('scheduleTemplateWorkGroups');
      }
      if (!workGroupLinksStore.indexNames.contains('scheduleTemplateWorkId')) {
        workGroupLinksStore.createIndex('scheduleTemplateWorkId', 'scheduleTemplateWorkId');
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

// ─── Data Migration Helpers ───────────────────────────────────────────────

/**
 * Migrates material records from old field structure to new structure.
 * Old: unit = Item Code, measurementUnit = Unit
 * New: itemCode = Item Code, unit = Unit
 */
export async function migrateMaterialUnits() {
  const db = await initDB();
  const materials = await db.getAll('materials');
  let migratedCount = 0;

  for (const material of materials) {
    let needsUpdate = false;

    // Migrate: old 'unit' field (was Item Code) → 'itemCode'
    if (material.unit && !material.itemCode) {
      material.itemCode = material.unit;
      delete material.unit; // Remove old field
      needsUpdate = true;
    }

    // Migrate: old 'measurementUnit' field → 'unit'
    if (material.measurementUnit !== undefined) {
      if (!material.unit) {
        material.unit = material.measurementUnit;
      }
      delete material.measurementUnit; // Remove old field
      needsUpdate = true;
    }

    // Ensure 'unit' field exists (might be a new field)
    if (material.unit === undefined) {
      material.unit = '';
      needsUpdate = true;
    }

    if (needsUpdate) {
      await db.put('materials', material);
      migratedCount++;
    }
  }

  return migratedCount;
}

/**
 * Migrates labor records to add the 'unit' field if missing.
 */
export async function migrateLaborUnits() {
  const db = await initDB();
  const laborTypes = await db.getAll('laborTypes');
  let migratedCount = 0;

  for (const labor of laborTypes) {
    if (labor.unit === undefined) {
      labor.unit = ''; // Add empty unit field
      await db.put('laborTypes', labor);
      migratedCount++;
    }
  }

  return migratedCount;
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
