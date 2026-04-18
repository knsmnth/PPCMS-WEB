import { useState, useEffect } from 'react';
import { getAllFromDB, getFromDB, putToDB, deleteFromDB, addToSyncQueue, getAllFromIndexDB } from '../lib/db';
import { db } from '../lib/firebase';
import { collection, query, limit, onSnapshot, where } from 'firebase/firestore';

export function useCollection(collectionName, queryConstraints = [], pageLimit = 100) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. Initial Load from IndexedDB
  const loadLocalData = async () => {
    try {
      // Basic Local Filtering mapping to Firestore where clauses
      let filtered;
      
      // 100k Scale Optimization: Index fetching
      if (queryConstraints.length === 1 && queryConstraints[0].operator === '==') {
        const c = queryConstraints[0];
        try {
          filtered = await getAllFromIndexDB(collectionName, c.field, c.value);
        } catch {
          const localData = await getAllFromDB(collectionName);
          filtered = localData.filter(item => item[c.field] === c.value);
        }
      } else {
        const localData = await getAllFromDB(collectionName);
        filtered = localData;
        if (queryConstraints.length > 0) {
          filtered = localData.filter(item => {
            return queryConstraints.every(c => {
              if (c.operator === '==') return item[c.field] === c.value;
              return true;
            });
          });
        }
      }
      
      setData(filtered || []);
    } catch (error) {
      console.error(`Error loading local ${collectionName}:`, error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Instantly load data cache
    loadLocalData();

    // 3. Listen for local cross-hook updates FIRST (works offline & online)
    const handleLocalUpdate = (e) => {
      if (!e.detail || e.detail === collectionName) {
        loadLocalData();
      }
    };
    window.addEventListener('localDataUpdated', handleLocalUpdate);

    // 2. Real-time sync from Firestore
    let unsubscribe = null;

    const setupSnapshot = () => {
      // Don't setup duplicate listeners
      if (unsubscribe || !navigator.onLine) return;

      let q = collection(db, collectionName);
      
      // Apply constraints
      queryConstraints.forEach(c => {
        q = query(q, where(c.field, c.operator, c.value));
      });
      // Add pagination parameter
      q = query(q, limit(pageLimit));

      unsubscribe = onSnapshot(q, async (snapshot) => {
        let requiresLocalUpdate = false;
        const changes = snapshot.docChanges();
        
        for (const change of changes) {
          const remoteDoc = change.doc.data();

          if (change.type === 'added' || change.type === 'modified') {
            // ── Last-Write-Wins Guard ──────────────────────────────────────────
            // If we have a locally-written version that is NEWER than what
            // Firebase is pushing back (stale echo from our own recent write),
            // skip the overwrite so local state is not reverted.
            const localDoc = await getFromDB(collectionName, remoteDoc.id);
            if (localDoc) {
              const localTs  = localDoc.updatedAt  || localDoc.createdAt  || '';
              const remoteTs = remoteDoc.updatedAt || remoteDoc.createdAt || '';
              if (localTs > remoteTs) {
                // Local is fresher — Firebase is echoing an older version, skip it
                continue;
              }
            }
            await putToDB(collectionName, remoteDoc);
            requiresLocalUpdate = true;
          }

          if (change.type === 'removed') {
            await deleteFromDB(collectionName, change.doc.id);
            requiresLocalUpdate = true;
          }
        }
        
        // Reload UI only if server triggered meaningful DB diffs
        if (requiresLocalUpdate) {
          loadLocalData();
        }
      }, (err) => {
         console.error(`onSnapshot error for ${collectionName}:`, err);
      });
    };

    // Try setting up immediately
    setupSnapshot();

    // Listen for connection restoration to attach listener if we started offline
    const handleOnline = () => {
      setupSnapshot();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      if (unsubscribe) unsubscribe();
      window.removeEventListener('localDataUpdated', handleLocalUpdate);
      window.removeEventListener('online', handleOnline);
    };
  }, [collectionName, JSON.stringify(queryConstraints), pageLimit]);

  // Unified Offline-First Write Methods
  const notifyUpdate = () => {
    window.dispatchEvent(new CustomEvent('localDataUpdated', { detail: collectionName }));
    window.dispatchEvent(new Event('triggerSync'));
  };

  const createItem = async (payload) => {
    const newItem = { ...payload, createdAt: new Date().toISOString() };
    await putToDB(collectionName, newItem);
    await addToSyncQueue({ type: 'create', collection: collectionName, payload: newItem });
    notifyUpdate();
  };

  const updateItem = async (payload) => {
    const updatedItem = { ...payload, updatedAt: new Date().toISOString() };
    await putToDB(collectionName, updatedItem);
    await addToSyncQueue({ type: 'update', collection: collectionName, payload: updatedItem });
    notifyUpdate();
  };

  const deleteItem = async (id) => {
    const item = await getFromDB(collectionName, id);
    if (!item) return;
    await deleteFromDB(collectionName, id);
    await addToSyncQueue({ type: 'delete', collection: collectionName, payload: item });
    notifyUpdate();
  };

  return { data, loading, createItem, updateItem, deleteItem, refresh: loadLocalData };
}
