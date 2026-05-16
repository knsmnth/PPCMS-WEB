/**
 * signatureService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD helpers for the `signatures` collection using the existing IDB pattern.
 */

import { getAllFromDB, getFromDB, putToDB, deleteFromDB, addToSyncQueue } from './db';

const COLLECTION = 'signatures';

const notifyUpdate = () => {
  window.dispatchEvent(new CustomEvent('localDataUpdated', { detail: COLLECTION }));
};

/**
 * @typedef {Object} Signature
 * @property {string}  id
 * @property {string}  fullName
 * @property {string}  position
 * @property {string}  department
 * @property {number}  signatureOrder   — lower = appears first within its type group
 * @property {'prepared_by'|'checked_by'|'approved_by'} signatureType
 * @property {boolean} isEnabled
 * @property {string}  createdAt
 * @property {string}  updatedAt
 */

/**
 * Get all signatures, sorted by signatureOrder.
 * @returns {Promise<Signature[]>}
 */
export async function getAllSignatures() {
  const all = await getAllFromDB(COLLECTION);
  return all.sort((a, b) => {
    // Primary sort: type order (prepared → checked → approved)
    const typeOrder = { prepared_by: 0, checked_by: 1, approved_by: 2 };
    const ta = typeOrder[a.signatureType] ?? 99;
    const tb = typeOrder[b.signatureType] ?? 99;
    if (ta !== tb) return ta - tb;
    return (a.signatureOrder ?? 0) - (b.signatureOrder ?? 0);
  });
}

/**
 * Get only enabled signatures, sorted and grouped.
 * @returns {Promise<Signature[]>}
 */
export async function getEnabledSignatures() {
  const all = await getAllSignatures();
  return all.filter(s => s.isEnabled !== false);
}

/**
 * Create a new signature.
 * @param {Omit<Signature, 'id'|'createdAt'|'updatedAt'>} data
 * @returns {Promise<Signature>}
 */
export async function createSignature(data) {
  const now = new Date().toISOString();
  const sig = {
    id: crypto.randomUUID(),
    ...data,
    isEnabled: data.isEnabled !== false,
    createdAt: now,
    updatedAt: now,
  };
  await putToDB(COLLECTION, sig);
  await addToSyncQueue({ type: 'create', collection: COLLECTION, payload: sig });
  notifyUpdate();
  return sig;
}

/**
 * Update an existing signature.
 * @param {Signature} sig
 * @returns {Promise<Signature>}
 */
export async function updateSignature(sig) {
  const updated = { ...sig, updatedAt: new Date().toISOString() };
  await putToDB(COLLECTION, updated);
  await addToSyncQueue({ type: 'update', collection: COLLECTION, payload: updated });
  notifyUpdate();
  return updated;
}

/**
 * Delete a signature.
 * @param {string} id
 */
export async function deleteSignature(id) {
  await deleteFromDB(COLLECTION, id);
  await addToSyncQueue({ type: 'delete', collection: COLLECTION, payload: { id } });
  notifyUpdate();
}

/**
 * Reorder signatures by updating signatureOrder values for a given type group.
 * @param {Signature[]} orderedList — full ordered list for ONE signatureType
 * @returns {Promise<void>}
 */
export async function reorderSignatures(orderedList) {
  for (let i = 0; i < orderedList.length; i++) {
    const sig = { ...orderedList[i], signatureOrder: i, updatedAt: new Date().toISOString() };
    await putToDB(COLLECTION, sig);
    await addToSyncQueue({ type: 'update', collection: COLLECTION, payload: sig });
  }
  notifyUpdate();
}
