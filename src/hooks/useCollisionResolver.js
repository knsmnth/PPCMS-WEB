import { useEffect, useRef } from 'react';
import { getAllFromDB, putToDB, addToSyncQueue } from '../lib/db';

/**
 * 0 → "A", 1 → "B", 25 → "Z", 26 → "AA" …
 */
function indexToLetter(index) {
  let result = '';
  let n = index;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

export function useCollisionResolver() {
  const timeoutRef = useRef(null);

  useEffect(() => {
    const runResolution = async () => {
      try {
        // Direct IDB fetch — totally bypasses React state/renders for max performance
        const [projects, schedules] = await Promise.all([
          getAllFromDB('projects'),
          getAllFromDB('schedulesOfWork')
        ]);

        let projectsUpdated = false;
        let schedulesUpdated = false;
        
        // ─── 1. Resolve Project Code Collisions ────────────────────────────────
        const projectGroups = {};
        for (const p of projects) {
          if (!p.projectCode) continue;
          if (!projectGroups[p.projectCode]) projectGroups[p.projectCode] = [];
          projectGroups[p.projectCode].push(p);
        }

        const tempProjects = [...projects];

        for (const code in projectGroups) {
          if (projectGroups[code].length > 1) {
            // Sort by createdAt (deterministic: oldest keeps the code)
            const sorted = projectGroups[code].sort((a, b) => {
              if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
              return a.id.localeCompare(b.id);
            });
            const [keeper, ...duplicates] = sorted;
            
            for (const dup of duplicates) {
              const yearPrefix = new Date().getFullYear().toString().slice(-2);
              const thisYearProjects = tempProjects.filter(p => p.projectCode && p.projectCode.startsWith(yearPrefix + '.'));
              
              let maxNum = 0;
              for (const p of thisYearProjects) {
                const parts = p.projectCode.split('.');
                if (parts.length === 2) {
                  const num = parseInt(parts[1], 10);
                  if (!isNaN(num) && num > maxNum) maxNum = num;
                }
              }
              const newCode = `${yearPrefix}.${String(maxNum + 1).padStart(3, '0')}`;
              
              const idx = tempProjects.findIndex(p => p.id === dup.id);
              if (idx !== -1) tempProjects[idx] = { ...dup, projectCode: newCode };
              
              const updatedProject = { ...dup, projectCode: newCode, updatedAt: new Date().toISOString() };
              await putToDB('projects', updatedProject);
              await addToSyncQueue({ type: 'update', collection: 'projects', payload: updatedProject });
              projectsUpdated = true;

              // Cascade Project Code change to Schedules
              const projectSchedules = schedules.filter(s => s.projectId === dup.id);
              for (const s of projectSchedules) {
                 let letter = '';
                 if (s.order !== undefined && s.order !== null) {
                   letter = indexToLetter(s.order);
                 } else {
                   const parts = s.workCode ? s.workCode.split('.') : [];
                   letter = parts.length === 3 ? parts[2] : '';
                 }
                 const newWorkCode = letter ? `${newCode}.${letter}` : newCode;
                 
                 const updatedSchedule = { ...s, workCode: newWorkCode, updatedAt: new Date().toISOString() };
                 await putToDB('schedulesOfWork', updatedSchedule);
                 await addToSyncQueue({ type: 'update', collection: 'schedulesOfWork', payload: updatedSchedule });
                 schedulesUpdated = true;
                 
                 // Keep memory array fresh for the next phase
                 const sIdx = schedules.findIndex(x => x.id === s.id);
                 if (sIdx !== -1) schedules[sIdx] = updatedSchedule;
              }
            }
          }
        }

        // ─── 2. Resolve Schedule Order Collisions ──────────────────────────────
        const byProject = {};
        for (const s of schedules) {
          if (!byProject[s.projectId]) byProject[s.projectId] = [];
          byProject[s.projectId].push(s);
        }

        for (const projectId in byProject) {
          const projSchedules = byProject[projectId];
          const orders = projSchedules.map(s => s.order ?? 0);
          const hasDuplicates = new Set(orders).size !== orders.length;

          if (hasDuplicates) {
            const sorted = [...projSchedules].sort((a, b) => {
              const oA = a.order ?? 0;
              const oB = b.order ?? 0;
              if (oA !== oB) return oA - oB;
              if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
              return a.id.localeCompare(b.id);
            });

            const proj = tempProjects.find(p => p.id === projectId);
            const pCode = proj?.projectCode || '';

            for (let i = 0; i < sorted.length; i++) {
              const item = sorted[i];
              if (item.order !== i) {
                const newWorkCode = pCode ? `${pCode}.${indexToLetter(i)}` : item.workCode;
                const updatedSchedule = { ...item, order: i, workCode: newWorkCode, updatedAt: new Date().toISOString() };
                await putToDB('schedulesOfWork', updatedSchedule);
                await addToSyncQueue({ type: 'update', collection: 'schedulesOfWork', payload: updatedSchedule });
                schedulesUpdated = true;
              }
            }
          }
        }

        // Fire UI refresh strictly IF changes were actually made
        if (projectsUpdated) window.dispatchEvent(new CustomEvent('localDataUpdated', { detail: 'projects' }));
        if (schedulesUpdated) window.dispatchEvent(new CustomEvent('localDataUpdated', { detail: 'schedulesOfWork' }));
        if (projectsUpdated || schedulesUpdated) window.dispatchEvent(new Event('triggerSync'));

      } catch (err) {
        console.error('[Collision Resolver] Error during background sweep:', err);
      }
    };

    // Debouncer to prevent running on every single keystroke/sync chunk
    const scheduleResolution = (e) => {
      // Ignore irrelevant collection updates to save CPU
      if (e && e.detail && !['projects', 'schedulesOfWork'].includes(e.detail)) return;
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        runResolution();
      }, 3000); // 3 seconds of quiet time before sweeping
    };

    window.addEventListener('localDataUpdated', scheduleResolution);
    
    // Initial run on mount (debounced)
    scheduleResolution();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      window.removeEventListener('localDataUpdated', scheduleResolution);
    };
  }, []);
}
