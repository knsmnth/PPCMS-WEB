import { useEffect } from 'react';
import { getSyncQueue, removeFromSyncQueue } from '../lib/db';
import { db } from '../lib/firebase';
import { writeBatch, doc } from 'firebase/firestore';

export function useOfflineSync() {
  useEffect(() => {
    let isSyncing = false;
    let syncNeeded = false;

    const syncData = async () => {
      if (!navigator.onLine) return;
      if (isSyncing) {
        syncNeeded = true;
        return;
      }
      isSyncing = true;
      syncNeeded = false;
      
      try {
        let hasMore = true;
        while (hasMore) {
          const queue = await getSyncQueue();
          if (!queue || queue.length === 0) {
            hasMore = false;
            break;
          }

          // Offline Sync Processor - Bypassing 500-document batch limit
          console.log(`[Offline Sync] Pushing ${queue.length} items to Firebase...`);
          
          const MAX_BATCH_SIZE = 500;
          const batches = [];
          let currentBatch = writeBatch(db);
          let operationCount = 0;

          // Loop through all pending operations and chunk them
          for (const operation of queue) {
            const docRef = doc(db, operation.collection, operation.payload.id);
            
            if (operation.type === 'create' || operation.type === 'update') {
              currentBatch.set(docRef, operation.payload, { merge: true });
            } else if (operation.type === 'delete') {
              currentBatch.delete(docRef);
            }
            
            operationCount++;
            
            // If we hit 500, push the batch and start a new one
            if (operationCount === MAX_BATCH_SIZE) {
              batches.push(currentBatch);
              currentBatch = writeBatch(db);
              operationCount = 0;
            }
          }
          
          // Push any remaining operations
          if (operationCount > 0) {
            batches.push(currentBatch);
          }
          
          // Commit all batches in parallel
          await Promise.all(batches.map(b => b.commit()));
          
          // If successful, clear the processed items from IndexedDB SyncQueue
          // (Removing sequentially is fine for IndexedDB, it is fast locally)
          for (const operation of queue) {
            await removeFromSyncQueue(operation.id);
          }
          console.log('[Offline Sync] Sync successful across', batches.length, 'batch(es)');

          // Check if another sync request was queued during our run, or scan the queue again to make sure it is empty
          if (!syncNeeded) {
            const freshQueue = await getSyncQueue();
            if (freshQueue.length === 0) {
              hasMore = false;
            }
          } else {
            syncNeeded = false;
          }
        }
      } catch (error) {
        console.error('[Offline Sync] Background sync failed:', error);
      } finally {
        isSyncing = false;
      }
    };

    window.addEventListener('online', syncData);
    window.addEventListener('triggerSync', syncData);
    
    // Trigger immediately on mount to process any queues from previous sessions
    syncData();

    // Auto-sync heartbeat every 30 seconds if connection is unstable
    const interval = setInterval(syncData, 30000);

    return () => {
      window.removeEventListener('online', syncData);
      window.removeEventListener('triggerSync', syncData);
      clearInterval(interval);
    };
  }, []);
}
