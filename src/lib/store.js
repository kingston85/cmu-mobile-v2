// Phone storage: the last copy of the registers (for offline use) + records waiting to upload.
import Dexie from 'dexie';

export const db = new Dexie('cmu-mobile');
db.version(1).stores({
  meta: 'key',
  outbox: 'cid, status, type, created',   // records made on the phone: queued | confirm | error | ok
  photos: 'id, inspectionCid, uploaded',
});

export const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });

export async function getMeta(key, fallback = null) {
  const r = await db.meta.get(key);
  return r ? r.value : fallback;
}
export const setMeta = (key, value) => db.meta.put({ key, value });

export const EMPTY_SNAP = {
  tables: { companies: [], licences: [], licenceChemicals: [], clearances: [], bills: [], payments: [], issues: [], inspections: [] },
  insights: { alerts: [], bills: [], quotas: [] },
  lists: { chemicals: [], units: ['kg', 'MT', 'L', 'pcs'], sectors: [], purposes: [], registers: [], issueStatus: ['Open', 'Verified', 'Closed'] },
  hazards: { rows: [], cats: [], hi: [] },
};
export const getSnapshot = () => getMeta('snapshot', null);
export const saveSnapshot = s => setMeta('snapshot', s);

export async function queue(type, data, photos = [], force = false) {
  const cid = uuid();
  await db.transaction('rw', db.outbox, db.photos, async () => {
    await db.outbox.put({ cid, type, data, created: new Date().toISOString(), status: 'queued', force });
    for (const p of photos) await db.photos.put({ id: uuid(), inspectionCid: cid, data: p.data, taken: p.taken, uploaded: 0 });
  });
  return cid;
}
export const outboxAll = () => db.outbox.orderBy('created').reverse().toArray();
export const pendingCount = async () =>
  (await db.outbox.where('status').anyOf('queued', 'confirm', 'error').count()) + (await db.photos.where('uploaded').equals(0).count());

export async function wipe() { await db.delete(); await db.open(); }
