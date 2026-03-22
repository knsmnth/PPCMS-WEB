import { useEffect } from 'react';
import { getSyncQueue, removeFromSyncQueue } from '../lib/db';
import { db } from '../lib/firebase';
import { writeBatch, doc } from 'firebase/firestore';

export function useOfflineSync() {
  useEffect(() => {
    const syncData = async () => {
      if (!navigator.onLine) return;
      
      try {
        const queue = await getSyncQueue();
        if (!queue || queue.length === 0) return;

        console.log(`[Offline Sync] Pushing ${queue.length} items to Firebase...`);
        const batch = writeBatch(db);
        
        // Loop through all pending operations
        for (const operation of queue) {
          const docRef = doc(db, operation.collection, operation.payload.id);
          if (operation.type === 'create' || operation.type === 'update') {
            batch.set(docRef, operation.payload, { merge: true });
          } else if (operation.type === 'delete') {
            batch.delete(docRef);
          }
        }
        
        // Commit the batch to Firebase
        await batch.commit();
        
        // If successful, clear the processed items from IndexedDB SyncQueue
        for (const operation of queue) {
          // In db.js we set syncQueue to autoIncrement its ID
          await removeFromSyncQueue(operation.id);
        }
        console.log('[Offline Sync] Sync successful');
      } catch (error) {
        console.error('[Offline Sync] Background sync failed:', error);
      }
    };

    window.addEventListener('online', syncData);
    // Auto-sync heartbeat every 30 seconds if connection is unstable
    const interval = setInterval(syncData, 30000);

    return () => {
      window.removeEventListener('online', syncData);
      clearInterval(interval);
    };
  }, []);
}
