/**
 * printUtils.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared, pure utility functions for print/PDF layout and cost calculation.
 * No React deps — safe to import anywhere including non-component modules.
 */

// ─── Currency Formatting ──────────────────────────────────────────────────────

/**
 * Format a number as Philippine Peso, always 2 decimal places.
 * @param {number} value
 * @returns {string} e.g. "₱1,234.56"
 */
export function formatCurrency(value) {
  const n = Number(value) || 0;
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a number with comma separators and 2 decimal places (no ₱ symbol).
 * @param {number} value
 * @returns {string} e.g. "1,234.56"
 */
export function formatNumber(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Work Code Utilities ──────────────────────────────────────────────────────

/**
 * Extract the display portion of a work code for the project header.
 *
 * Examples:
 *   21.001.A  → "001.A"
 *   21.002.B  → "002.B"
 *   26.003.A.1 → "003.A.1"
 *   "" / null  → ""
 *
 * Logic: Strip the leading "YY." prefix (2 digits + dot), keep the rest.
 *
 * @param {string} workCode
 * @returns {string}
 */
export function extractDisplayCode(workCode) {
  if (!workCode) return '';
  const parts = workCode.split('.');
  if (parts.length > 2) {
    return parts.slice(2).join('.');
  }
  return '';
}

/**
 * Build the alphabetical letter label for a main schedule (0-based index).
 * 0 → "A", 1 → "B", 25 → "Z", 26 → "AA"
 * @param {number} index
 * @returns {string}
 */
export function indexToLetter(index) {
  let result = '';
  let n = index;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

// ─── Hierarchical Schedule Builder ───────────────────────────────────────────

/**
 * Build a flat, hierarchically ordered array of schedules for a given project.
 * Order: A (main) → A.1 (sub) → A.2 (sub) → B (main) → B.1 (sub) → …
 *
 * @param {Array<object>} allSchedules - All schedulesOfWork records
 * @param {string}        projectId
 * @param {boolean}       [excludeExcluded=true] - Filter out isExcluded records
 * @returns {Array<{ schedule: object, level: number, letterLabel: string, numberLabel: string }>}
 */
export function buildHierarchicalSchedules(allSchedules, projectId, excludeExcluded = true) {
  const projectSchedules = allSchedules.filter(s => {
    if (s.projectId !== projectId) return false;
    if (excludeExcluded && s.isExcluded) return false;
    return true;
  });

  const roots = projectSchedules
    .filter(s => !s.parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const result = [];

  roots.forEach((root, rootIdx) => {
    const letter = indexToLetter(rootIdx);
    result.push({
      schedule: root,
      level: 0,
      letterLabel: `${letter}.`,
      numberLabel: letter,
    });

    const children = projectSchedules
      .filter(s => s.parentId === root.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    children.forEach((child, childIdx) => {
      result.push({
        schedule: child,
        level: 1,
        letterLabel: `${letter}.${childIdx + 1}`,
        numberLabel: `${letter}.${childIdx + 1}`,
      });
    });
  });

  return result;
}

// ─── Print Totals Computation ─────────────────────────────────────────────────

/**
 * Compute the breakdown totals for a single summary (work-group),
 * reading all data from in-memory arrays (not IDB).
 *
 * Mirrors the logic in billing.js / VirtualizedSummaryTable, but as a pure function.
 *
 * @param {object} summary
 * @param {Array<object>} allItems - All summaryItems
 * @param {object|null} project
 * @returns {{ materialTotal: number, laborTotal: number, equipmentTotal: number, ocmTotal: number, total: number }}
 */
export function computeSummaryTotals(summary, allItems, project) {
  if (summary.isExcluded) {
    return { materialTotal: 0, laborTotal: 0, equipmentTotal: 0, ocmTotal: 0, total: 0 };
  }

  const groupItems = allItems.filter(i => i.summaryId === summary.id && !i.isExcluded);
  const totalBaseCost = groupItems.reduce((sum, i) => sum + (i.totalCost || 0), 0);

  const isLaborType = summary.type === 'labor';
  const showLabor = (summary.type === 'material' || summary.type === 'bulk') && summary.showLabor !== false;
  const showTools = summary.showTools !== false;
  const showOcm = summary.showOcm !== false;

  const laborPerc = summary.laborPercentage || project?.defaultLaborPercentage || 0;
  const toolsPerc = summary.toolsPercentage || project?.defaultToolsPercentage || 0;
  const ocmPerc = summary.ocmPercentage || project?.defaultOcmPercentage || 0;

  const laborTotal = isLaborType
    ? totalBaseCost
    : (showLabor && !summary.excludeLabor ? totalBaseCost * (laborPerc / 100) : 0);

  const equipmentTotal = (showTools && !summary.excludeTools)
    ? totalBaseCost * (toolsPerc / 100)
    : 0;

  const ocmBase = isLaborType
    ? totalBaseCost + equipmentTotal
    : totalBaseCost + laborTotal + equipmentTotal;

  const ocmTotal = (showOcm && !summary.excludeOcm)
    ? ocmBase * (ocmPerc / 100)
    : 0;

  const materialTotal = isLaborType ? 0 : totalBaseCost;

  const total = isLaborType
    ? totalBaseCost + equipmentTotal + ocmTotal
    : totalBaseCost + laborTotal + equipmentTotal + ocmTotal;

  return { materialTotal, laborTotal, equipmentTotal, ocmTotal, total };
}

/**
 * Compute aggregate totals for a single schedule (may have multiple summaries).
 *
 * @param {object}        schedule
 * @param {Array<object>} allSummaries
 * @param {Array<object>} allItems
 * @param {object|null}   project
 * @returns {{ materialTotal, laborTotal, equipmentTotal, ocmTotal, total }}
 */
export function computeScheduleTotals(schedule, allSummaries, allItems, project) {
  if (schedule.isExcluded) {
    return { materialTotal: 0, laborTotal: 0, equipmentTotal: 0, ocmTotal: 0, total: 0 };
  }

  const summaries = allSummaries.filter(
    s => s.scheduleOfWorkId === schedule.id && !s.isExcluded
  );

  const zero = { materialTotal: 0, laborTotal: 0, equipmentTotal: 0, ocmTotal: 0, total: 0 };

  return summaries.reduce((acc, summary) => {
    const t = computeSummaryTotals(summary, allItems, project);
    return {
      materialTotal: acc.materialTotal + t.materialTotal,
      laborTotal: acc.laborTotal + t.laborTotal,
      equipmentTotal: acc.equipmentTotal + t.equipmentTotal,
      ocmTotal: acc.ocmTotal + t.ocmTotal,
      total: acc.total + t.total,
    };
  }, zero);
}

/**
 * Compute aggregate totals for an entire project.
 * Includes main schedule totals + sub-schedule totals under each main.
 *
 * @param {string}        projectId
 * @param {Array<object>} allSchedules
 * @param {Array<object>} allSummaries
 * @param {Array<object>} allItems
 * @param {object|null}   project
 * @returns {{ materialTotal, laborTotal, equipmentTotal, ocmTotal, grandTotal }}
 */
export function computeProjectPrintTotals(projectId, allSchedules, allSummaries, allItems, project) {
  // Use buildHierarchicalSchedules to ensure we properly drop orphaned sub-schedules
  // (e.g., if a main schedule is excluded, its sub-schedules must also be excluded).
  const validSchedules = buildHierarchicalSchedules(allSchedules, projectId, true).map(e => e.schedule);

  const zero = { materialTotal: 0, laborTotal: 0, equipmentTotal: 0, ocmTotal: 0 };

  const totals = validSchedules.reduce((acc, sched) => {
    const t = computeScheduleTotals(sched, allSummaries, allItems, project);
    return {
      materialTotal: acc.materialTotal + t.materialTotal,
      laborTotal: acc.laborTotal + t.laborTotal,
      equipmentTotal: acc.equipmentTotal + t.equipmentTotal,
      ocmTotal: acc.ocmTotal + t.ocmTotal,
    };
  }, zero);

  return {
    ...totals,
    grandTotal: totals.materialTotal + totals.laborTotal + totals.equipmentTotal + totals.ocmTotal,
  };
}

/**
 * Get the items for a specific schedule (directly attached summaries' items).
 *
 * @param {string}        scheduleId
 * @param {Array<object>} allSummaries
 * @param {Array<object>} allItems
 * @returns {Array<object>}
 */
export function getScheduleItems(scheduleId, allSummaries, allItems) {
  const summaryIds = allSummaries
    .filter(s => s.scheduleOfWorkId === scheduleId)
    .map(s => s.id);
  return allItems.filter(i => summaryIds.includes(i.summaryId));
}
