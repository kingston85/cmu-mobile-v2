import { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { db, getMeta, getSnapshot, outboxAll, pendingCount, queue, wipe, EMPTY_SNAP } from './lib/store';
import { login, sync, isOnline, checkItem } from './lib/api';
import { loadSession, saveSession, clearSession } from './lib/device';
import { fmtD, fmtWhen, money } from './lib/util';
import { Header, Card, Row, Empty, Pill } from './screens/ui';
import { Records, List, Detail, Search, Quotas, OutPill, KINDS } from './screens/Records';
import { CompanyForm, ClearanceForm, PaymentForm, InspectionForm, IssueForm } from './screens/Forms';
import { Verify, Fee } from './screens/Tools';

const APP_VERSION = '1.1.0';
const FORMS = { company: CompanyForm, clearance: ClearanceForm, payment: PaymentForm, inspection: InspectionForm, issue: IssueForm };
const TYPE_LABEL = { company: 'Company', clearance: 'Clearance', payment: 'Payment', inspection: 'Inspection', issue: 'Data issue' };

export default function App() {
  const [session, setSession] = useState(undefined);
  const [snap, setSnap] = useState(EMPTY_SNAP);
  const [hasSnap, setHasSnap] = useState(false);
  const [outbox, setOutbox] = useState([]);
  const [pending, setPending] = useState(0);
  const [stack, setStack] = useState([{ screen: 'home' }]);
  const [online, setOnline] = useState(true);
  const [sy, setSy] = useState({ busy: false, msg: '', error: '', last: null });
  const [toast, setToast] = useState('');

  const canEdit = session && session.user.role !== 'viewer';
  const view = stack.at(-1);
  const go = (screen, params = {}) => { setStack(s => [...s, { screen, params }]); window.scrollTo(0, 0); };
  const back = () => setStack(s => (s.length > 1 ? s.slice(0, -1) : s));
  const tab = screen => { setStack([{ screen }]); window.scrollTo(0, 0); };
  const flash = m => { setToast(m); clearTimeout(flash.t); flash.t = setTimeout(() => setToast(''), 3500); };

  const reload = useCallback(async () => {
    const s = await getSnapshot();
    if (s) { setSnap(s); setHasSnap(true); }
    setOutbox(await outboxAll());
    setPending(await pendingCount());
    const last = await getMeta('lastSync');
    setSy(x => ({ ...x, last }));
  }, []);

  const signOut = useCallback(async msg => { await clearSession(); setSession(null); setStack([{ screen: 'home' }]); if (msg) flash(msg); }, []);

  const runSync = useCallback(async (quiet = false) => {
    if (!session) return;
    setSy(x => ({ ...x, busy: true, msg: 'Starting…', error: '' }));
    try {
      const r = await sync(session, msg => setSy(x => ({ ...x, msg })));
      if (r.user && r.user.role !== session.user.role) { const s2 = { ...session, user: r.user }; await saveSession(s2); setSession(s2); }
      const parts = [r.sent && `${r.sent} record(s) uploaded`, r.photos && `${r.photos} photo(s)`, r.confirm && `${r.confirm} need your OK`, r.errors && `${r.errors} with errors`].filter(Boolean);
      setSy(x => ({ ...x, busy: false, msg: parts.length ? parts.join(', ') : 'Registers up to date' }));
      if (r.confirm || r.errors) flash('Some records need attention – see Sync.');
      else if (!quiet) flash('Sync complete');
    } catch (e) {
      setSy(x => ({ ...x, busy: false, error: e.message }));
      if (e.code === 'auth') return signOut('Your session ended – please sign in again.');
      if (!quiet) flash(e.message);
    }
    reload();
  }, [session, reload, signOut]);

  /** a form was filled: ask the server for warnings (when online), then keep it on the phone and upload */
  const submit = useCallback(async (type, data, photos = []) => {
    let force = false;
    if (await isOnline()) {
      try {
        const r = await checkItem(session, { type, data });
        if (r.warnings && r.warnings.length) {
          if (!confirm('Please check:\n\n• ' + r.warnings.join('\n• ') + '\n\nSave anyway?')) return false;
          force = true;
        }
      } catch (e) {
        if (e.code === 'auth') { signOut('Your session ended – please sign in again.'); return false; }
        if (e.server) { alert(e.message); return false; }      // the server said no (e.g. company not registered)
      }
    }
    await queue(type, data, photos, force);
    await reload();
    flash(`${TYPE_LABEL[type]} saved on the phone${(await isOnline()) ? ' – uploading…' : ' – it will upload when you have a signal'}`);
    if (await isOnline()) runSync(true);
    return true;
  }, [session, reload, runSync, signOut]);

  useEffect(() => { loadSession().then(s => setSession(s || null)); }, []);
  useEffect(() => { if (session) { reload().then(() => runSync(true)); } }, [session]); // eslint-disable-line

  const syncRef = useRef(runSync); syncRef.current = runSync;
  useEffect(() => {
    isOnline().then(setOnline);
    let h;
    Network.addListener('networkStatusChange', st => { setOnline(st.connected); if (st.connected) syncRef.current(true); }).then(x => (h = x)).catch(() => {});
    return () => h?.remove();
  }, []);
  const stackRef = useRef(stack); stackRef.current = stack;
  useEffect(() => {
    let h;
    CapApp.addListener('backButton', () => { if (stackRef.current.length > 1) setStack(s => s.slice(0, -1)); else CapApp.exitApp(); }).then(x => (h = x)).catch(() => {});
    return () => h?.remove();
  }, []);

  if (session === undefined) return <div className="splash"><div className="logo">CMU</div></div>;
  if (!session) return <Login onDone={async s => { await saveSession(s); setSession(s); }} />;

  const ctx = { session, snap, outbox, pending, online, canEdit, go, back, tab, flash, reload, runSync, sy, submit };
  let body;
  const p = view.params || {};
  if (!hasSnap && view.screen !== 'settings' && view.screen !== 'sync') body = <FirstSync {...ctx} />;
  else switch (view.screen) {
    case 'find': body = <Search {...ctx} />; break;
    case 'records': body = <Records {...ctx} />; break;
    case 'list': body = <List {...ctx} kind={p.kind} initialFilter={p.filter} />; break;
    case 'detail': body = <Detail {...ctx} kind={p.kind} id={p.id} />; break;
    case 'quotas': body = <Quotas {...ctx} coId={p.coId} />; break;
    case 'form': { const F = FORMS[p.form]; body = <F {...ctx} preset={p.preset} />; break; }
    case 'verify': body = <Verify {...ctx} />; break;
    case 'fee': body = <Fee {...ctx} />; break;
    case 'sync': body = <SyncScreen {...ctx} />; break;
    case 'settings': body = <Settings {...ctx} signOut={signOut} />; break;
    default: body = <Home {...ctx} />;
  }
  const root = stack[0].screen;
  return (
    <div className="app">
      {!online && <div className="banner offline">Offline – using the copy from {fmtWhen(sy.last)}{pending ? ` · ${pending} waiting to upload` : ''}</div>}
      {online && sy.busy && <div className="banner busy">{sy.msg}</div>}
      <main>{body}</main>
      <nav className="tabs">
        {[['home', 'Home', '⌂'], ['find', 'Find', '⌕'], ['records', 'Registers', '☰'], ['sync', 'Sync', '⟳'], ['settings', 'More', '⚙']].map(([k, l, ic]) => (
          <button key={k} className={root === k ? 'on' : ''} onClick={() => tab(k)}><span className="ic">{ic}</span>{l}{k === 'sync' && pending > 0 && <b className="badge">{pending}</b>}</button>
        ))}
      </nav>
      {toast && <div className="toast" onClick={() => setToast('')}>{toast}</div>}
    </div>
  );
}

/* ---------------- sign in */
function Login({ onDone }) {
  const [apiUrl, setApiUrl] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErr('');
    const url = apiUrl.trim();
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) return setErr('Paste the CMU web app link – it starts with https://script.google.com/ and ends with /exec');
    setBusy(true);
    try { const r = await login(url, email.trim(), pin.trim(), navigator.userAgent.slice(0, 60)); onDone({ apiUrl: url, token: r.token, user: r.user }); }
    catch (ex) { setErr(ex.message); }
    setBusy(false);
  };
  return (
    <div className="login">
      <div className="brand"><div className="logo">CMU</div><h1>CMU Database</h1><p>Chemical Management Unit · EPA Liberia · ERRS</p></div>
      <form onSubmit={submit} className="card form">
        <label>Server link<input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" autoCapitalize="off" autoCorrect="off" /></label>
        <label>Your email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoCapitalize="off" /></label>
        <label>PIN<input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} /></label>
        {err && <p className="err">{err}</p>}
        <button className="primary wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted small">Your CMU admin gives you the link and a PIN (sheet “Mobile Users”).</p>
      </form>
      <p className="muted small center">v{APP_VERSION}</p>
    </div>
  );
}

function FirstSync({ sy, runSync, online }) {
  return (<>
    <Header title="CMU Database" />
    <Card title="Download the registers">
      <p>The first time, the phone needs a signal to download the companies, licences, clearances, bills and payments. After that it works offline.</p>
      {sy.error && <p className="err">{sy.error}</p>}
      <button className="primary wide" disabled={sy.busy || !online} onClick={() => runSync()}>{sy.busy ? sy.msg : online ? 'Download now' : 'Waiting for a signal…'}</button>
    </Card>
  </>);
}

/* ---------------- home */
function Home({ session, snap, outbox, pending, canEdit, go, sy, runSync }) {
  const ins = snap.insights;
  const soon = ins.alerts.filter(a => a.days >= 0 && a.days <= 30), expired = ins.alerts.filter(a => a.days < 0);
  const unpaid = ins.bills.filter(b => !b.isPaid), old = unpaid.filter(b => b.age > 30);
  const outAmt = unpaid.reduce((a, b) => a + b.out, 0);
  const ym = new Date().toISOString().slice(0, 7);
  const clrMonth = new Set(snap.tables.clearances.filter(c => String(c['Clearance Date']).startsWith(ym)).map(c => c['Clearance No.'])).size;
  const attention = outbox.filter(o => o.status === 'confirm' || o.status === 'error');
  const over = ins.quotas.filter(q => q.status === 'OVER QUOTA' && q.active);
  return (<>
    <header className="top hero">
      <div className="grow"><h1>CMU Database</h1><p>{session.user.name} · {session.user.role}</p></div>
      <button className="ghost" onClick={() => runSync()} disabled={sy.busy} aria-label="Sync">{sy.busy ? '…' : '⟳'}</button>
    </header>
    <button className="syncline" onClick={() => go('sync')}>
      <span className={`dot ${pending ? 'warn' : 'ok'}`} />{pending ? `${pending} waiting to upload` : 'Everything uploaded'} · updated {fmtWhen(sy.last)}
    </button>
    {attention.length > 0 && <Card tone="warn"><b>{attention.length} record(s) need your attention</b> <button className="link" onClick={() => go('sync')}>Open Sync</button></Card>}
    <div className="grid g4">
      <button className="stat" onClick={() => go('list', { kind: 'licences', filter: 'soon' })}><b className="c-orange">{soon.length}</b><span>Licences expiring ≤30 d</span></button>
      <button className="stat" onClick={() => go('list', { kind: 'licences', filter: 'expired' })}><b className="c-red">{expired.length}</b><span>Expired, not renewed</span></button>
      <button className="stat" onClick={() => go('list', { kind: 'bills', filter: 'unpaid' })}><b className="c-red">{money(outAmt).replace(/\.\d\d$/, '')}</b><span>US$ unpaid ({unpaid.length} bills)</span></button>
      <button className="stat" onClick={() => go('list', { kind: 'clearances' })}><b className="c-green">{clrMonth}</b><span>Clearances this month</span></button>
    </div>
    <h2 className="sect">Field tools</h2>
    <div className="tiles">
      <button className="tile accent" onClick={() => go('verify')}><i>🔎</i><b>Check a document</b><small>Scan the QR code</small></button>
      {canEdit && <button className="tile" onClick={() => go('form', { form: 'inspection' })}><i>🔍</i><b>Field inspection</b><small>GPS + photos</small></button>}
      {canEdit && <button className="tile" onClick={() => go('form', { form: 'clearance' })}><i>🧪</i><b>New clearance</b><small>Up to 20 chemicals</small></button>}
      {canEdit && <button className="tile" onClick={() => go('form', { form: 'payment' })}><i>💵</i><b>Record payment</b><small>Against a bill</small></button>}
      <button className="tile" onClick={() => go('fee')}><i>💲</i><b>Fee estimate</b><small>R × Hi × Qi</small></button>
      {canEdit && <button className="tile" onClick={() => go('form', { form: 'company' })}><i>🏢</i><b>Register company</b><small>Checks duplicates</small></button>}
      {canEdit && <button className="tile" onClick={() => go('form', { form: 'issue' })}><i>📌</i><b>Report data issue</b><small>Notes & Issues</small></button>}
      <button className="tile" onClick={() => go('quotas')}><i>⚖️</i><b>Import quotas</b><small>{over.length ? `${over.length} over quota` : 'Licensed quantities'}</small></button>
    </div>
    {expired.length + soon.length > 0 && <Card title={`Licences to renew (${soon.length + expired.length})`} tone="warn">
      {[...expired, ...soon].slice(0, 8).map(a => <button key={a.id} className="row" onClick={() => go('detail', { kind: 'licences', id: a.id })}>
        {a.co} <Pill tone={a.days < 0 ? 'bad' : 'warn'}>{a.days < 0 ? `expired ${-a.days} d ago` : `${a.days} d left`}</Pill><small>{a.type} · {a.no} · {fmtD(a.expiry)}</small></button>)}
    </Card>}
    {old.length > 0 && <Card title={`Bills unpaid > 30 days (${old.length})`} tone="bad">
      {old.slice(0, 8).map(b => <button key={b.no} className="row" onClick={() => go('detail', { kind: 'bills', id: b.no })}>{b.co} · US${money(b.out)}<small>{b.no} · {b.age} days</small></button>)}
    </Card>}
  </>);
}

/* ---------------- sync */
function SyncScreen({ session, outbox, pending, online, sy, runSync, reload, flash }) {
  const act = async (o, how) => {
    if (how === 'discard') { if (!confirm('Delete this record from the phone? It has not been saved in the database.')) return; await db.outbox.delete(o.cid); await db.photos.where('inspectionCid').equals(o.cid).delete(); }
    else await db.outbox.update(o.cid, { status: 'queued', force: how === 'force' });
    await reload(); if (how !== 'discard') runSync(true); else flash('Deleted');
  };
  const waiting = outbox.filter(o => o.status !== 'ok'), sent = outbox.filter(o => o.status === 'ok');
  return (<>
    <Header title="Sync" sub="Phone ⇄ CMU Database (Google Sheet)" />
    <Card>
      <div className="kv"><span>Network</span><b>{online ? 'Online' : 'Offline'}</b></div>
      <div className="kv"><span>Waiting to upload</span><b>{pending}</b></div>
      <div className="kv"><span>Registers downloaded</span><b>{fmtWhen(sy.last)}</b></div>
      {sy.msg && !sy.busy && !sy.error && <p className="ok">{sy.msg}</p>}
      {sy.error && <p className="err">{sy.error}</p>}
      <button className="primary wide" disabled={sy.busy || !online} onClick={() => runSync()}>{sy.busy ? sy.msg : 'Sync now'}</button>
      {session.user.role === 'viewer' && <p className="muted small">View-only account: sync downloads the registers.</p>}
    </Card>
    {waiting.length > 0 && <h2 className="sect">Made on this phone</h2>}
    {waiting.map(o => (
      <Card key={o.cid} tone={o.status === 'confirm' ? 'warn' : o.status === 'error' ? 'bad' : ''}>
        <div className="linehead"><b>{TYPE_LABEL[o.type]}</b><OutPill o={o} /></div>
        <p className="small">{summary(o)}</p>
        <p className="muted small">Made {fmtWhen(o.created)}</p>
        {o.status === 'confirm' && <><ul className="warns">{(o.warnings || []).map((w, i) => <li key={i}>{w}</li>)}</ul>
          <div className="quick"><button className="primary" onClick={() => act(o, 'force')}>Save anyway</button><button className="danger" onClick={() => act(o, 'discard')}>Delete</button></div></>}
        {o.status === 'error' && <><p className="err">{o.error}</p><div className="quick"><button onClick={() => act(o, 'retry')}>Try again</button><button className="danger" onClick={() => act(o, 'discard')}>Delete</button></div></>}
      </Card>
    ))}
    {sent.length > 0 && <Card title={`Uploaded recently (${sent.length})`}>{sent.slice(0, 30).map(o => <div className="kv" key={o.cid}><span>{TYPE_LABEL[o.type]} · {summary(o)}</span><b>{o.resultId}</b></div>)}</Card>}
    {!outbox.length && <Empty>Nothing made on this phone yet.</Empty>}
  </>);
}
function summary(o) {
  const d = o.data;
  return o.type === 'company' ? d.name : o.type === 'clearance' ? `${d.company} – ${(d.lines || []).length} chemical(s)` : o.type === 'payment' ? `${d.bill} – US$${money(d.amount)}`
    : o.type === 'inspection' ? `${d.site}${d.company ? ' – ' + d.company : ''}` : String(d.issue || '').slice(0, 60);
}

/* ---------------- settings */
function Settings({ session, pending, signOut, reload, flash, snap, go }) {
  const out = () => { if (pending && !confirm(`${pending} record(s) have not been uploaded yet. Sign out anyway? They stay on this phone.`)) return; signOut(); };
  const erase = async () => { if (!confirm('Erase all CMU data on this phone? Records not yet uploaded will be lost.')) return; await wipe(); await reload(); flash('Phone data erased'); };
  const t = snap.tables;
  return (<>
    <Header title="More" />
    <Card>
      <div className="kv"><span>Signed in as</span><b>{session.user.name}</b></div>
      <div className="kv"><span>Email</span><b>{session.user.email}</b></div>
      <div className="kv"><span>Role</span><b>{session.user.role}</b></div>
      <div className="kv"><span>Server</span><b className="pre small">{session.apiUrl.replace(/^https:\/\/script\.google\.com\/macros\/s\//, '…/').slice(0, 40)}</b></div>
    </Card>
    <Card title="On this phone">
      {Object.entries(KINDS).map(([k, K]) => <div className="kv" key={k}><span>{K.label}</span><b>{k === 'clearances' ? new Set(t.clearances.map(c => c['Clearance No.'])).size : k === 'bills' ? snap.insights.bills.length : (t[k] || []).length}</b></div>)}
    </Card>
    <Row title="🔍 Field inspections" sub="Inspections made with the app" onClick={() => go('list', { kind: 'inspections' })} />
    <Row title="📌 Notes & Issues" onClick={() => go('list', { kind: 'issues' })} />
    <button className="wide" onClick={out}>Sign out</button>
    <button className="danger wide" onClick={erase}>Erase data on this phone</button>
    <p className="muted small center">CMU Database mobile v{APP_VERSION} · EPA Liberia · ERRS</p>
  </>);
}
