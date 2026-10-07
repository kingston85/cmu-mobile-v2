// Talks to MobileAPI.gs (the CMU Database web app) and keeps the phone in step with it.
import { Network } from '@capacitor/network';
import { db, saveSnapshot, setMeta } from './store';

async function call(apiUrl, body) {
  // CapacitorHttp (capacitor.config.json) sends this natively on Android: no CORS, follows the Google redirect.
  const res = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch {
    throw new Error('The server did not answer correctly. Check the link ends in /exec, the web app is deployed for "Anyone", and MobileAPI.gs is installed.');
  }
  if (!data.ok) { const e = new Error(data.error || 'Server error'); e.code = data.code; e.server = true; throw e; }
  return data;
}

export async function isOnline() {
  try { return (await Network.getStatus()).connected; } catch { return navigator.onLine; }
}
const B = (s, o) => ({ ...o, token: s.token || '', who: (s.user && s.user.name) || '' });
/** connect with the server link only (MobileAPI.gs with MOB_NO_LOGIN = true) */
export async function connect(apiUrl, who) {
  const r = await call(apiUrl, { action: 'login', who });
  return { apiUrl, token: r.token || '', user: r.user || { name: who || 'Mobile app', role: 'staff' } };
}
export const verifyCode = (s, code) => call(s.apiUrl, B(s, { action: 'verify', code }));
export const checkItem = (s, item) => call(s.apiUrl, B(s, { action: 'check', item }));

let running = null;
export function sync(session, progress = () => {}) {
  if (!running) running = run(session, progress).finally(() => { running = null; });
  return running;
}

async function run(s, progress) {
  if (s.demo) {                                   // sample data: nothing leaves the phone
    const { sampleSnapshot } = await import('./sample');
    await saveSnapshot(sampleSnapshot());
    await setMeta('lastSync', new Date().toISOString());
    return { sent: 0, photos: 0, confirm: 0, errors: 0, demo: true };
  }
  if (!(await isOnline())) throw new Error('No network. Everything is saved on this phone and will upload later.');
  const out = { sent: 0, photos: 0, confirm: 0, errors: 0 };

  // 1  upload records made on the phone (in the order they were made, so a new company goes before its clearance)
  if (s.user.role !== 'viewer') {
    const items = (await db.outbox.where('status').anyOf('queued', 'error').toArray()).sort((a, b) => a.created.localeCompare(b.created));
    for (let i = 0; i < items.length; i += 15) {
      const batch = items.slice(i, i + 15);
      progress(`Uploading ${Math.min(i + 15, items.length)} of ${items.length}…`);
      const res = await call(s.apiUrl, B(s, { action: 'push', items: batch.map(b => ({ cid: b.cid, type: b.type, data: b.data, force: !!b.force })) }));
      for (const r of res.results) {
        const patch = { status: r.status, warnings: r.warnings || [], error: r.error || '', resultId: r.id || '', sentAt: r.status === 'ok' ? new Date().toISOString() : '' };
        await db.outbox.update(r.cid, patch);
        if (r.status === 'ok') out.sent++; else if (r.status === 'confirm') out.confirm++; else out.errors++;
      }
    }
    // 2  inspection photos (only once their inspection is on the server)
    const photos = await db.photos.where('uploaded').equals(0).toArray();
    for (const [n, p] of photos.entries()) {
      const parent = await db.outbox.get(p.inspectionCid);
      if (!parent) { await db.photos.delete(p.id); continue; }
      if (parent.status !== 'ok') continue;
      progress(`Uploading photo ${n + 1} of ${photos.length}…`);
      const r = await call(s.apiUrl, B(s, { action: 'photo', photo: { id: p.id, inspectionCid: p.inspectionCid, base64: p.data, taken: p.taken } }));
      await db.photos.update(p.id, { uploaded: 1, url: r.url });
      out.photos++;
    }
  }

  // 3  download the registers
  progress('Downloading the registers…');
  const snap = await call(s.apiUrl, B(s, { action: 'pull' }));
  await saveSnapshot({ tables: snap.tables, insights: snap.insights, lists: snap.lists, hazards: snap.hazards });
  await setMeta('lastSync', new Date().toISOString());
  // keep uploaded items for 14 days as a history, then forget them
  const old = new Date(Date.now() - 14 * 864e5).toISOString();
  const done = await db.outbox.where('status').equals('ok').toArray();
  for (const d of done) if ((d.sentAt || d.created) < old) await db.outbox.delete(d.cid);
  out.user = snap.user;
  return out;
}
