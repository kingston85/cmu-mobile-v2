import { useMemo, useState } from 'react';
import { Header, Card, Field, Combo, Select } from './ui';
import { today, money, num, isNum, eq, feeLine, fmtD } from '../lib/util';
import { getGps, takePhoto } from '../lib/device';

const INSP_TYPES = ['Port clearance', 'Warehouse / storage', 'Mine site', 'Routine', 'Complaint', 'Follow-up', 'Effluent discharge'];
const COMPLIANCE = ['Compliant', 'Minor issues', 'Non-compliant'];

/** shared wrapper: validates, then hands the record to App (check online → queue → sync) */
function useForm(init) {
  const [v, setV] = useState(init);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, x) => setV(o => ({ ...o, [k]: x }));
  return { v, set, setV, err, setErr, busy, setBusy };
}
function Bar({ title, back, onSave, busy }) {
  return <Header title={title} back={back} right={<button className="ghost small strong" disabled={busy} onClick={onSave}>{busy ? '…' : 'Save'}</button>} />;
}
function Done({ busy, onSave, label = 'Save' }) {
  return <button className="primary wide" disabled={busy} onClick={onSave}>{busy ? 'Saving…' : label}</button>;
}
const need = (v, keys) => Object.fromEntries(keys.filter(k => !String(v[k] ?? '').trim()).map(k => [k, 'Required']));

/* ---------------- Register Company */
export function CompanyForm({ snap, submit, back, preset }) {
  const F = useForm({ name: '', sector: '', location: '', other: '', ...preset });
  const names = snap.tables.companies.map(c => c['Company Name']);
  const exact = names.find(n => eq(n, F.v.name));
  const key = s => String(s).toLowerCase().replace(/\b(inc|ltd|llc|limited|corp|corporation|company|co|the|liberia|group|plc|sa)\b/g, '').replace(/[^a-z0-9]/g, '');
  const similar = F.v.name.trim().length >= 4 && !exact ? names.filter(n => { const a = key(n), b = key(F.v.name); return a && b && (a.includes(b) || b.includes(a)); }).slice(0, 3) : [];
  const save = async () => {
    const e = need(F.v, ['name']); if (exact) e.name = 'Already registered';
    F.setErr(e); if (Object.keys(e).length) return;
    F.setBusy(true); const ok = await submit('company', F.v); F.setBusy(false); if (ok) back();
  };
  return (<>
    <Bar title="Register company" back={back} onSave={save} busy={F.busy} />
    <div className="card form">
      <Field label="Company name" req err={F.err.name}><input value={F.v.name} onChange={e => F.set('name', e.target.value)} /></Field>
      {exact && <p className="err">Already registered – open it from Find instead.</p>}
      {similar.length > 0 && <p className="warnbox">Similar names already registered: {similar.join(' · ')}. Check before saving.</p>}
      <Field label="Sector / Activity"><Combo id="sectors" value={F.v.sector} onChange={x => F.set('sector', x)} options={snap.lists.sectors} /></Field>
      <Field label="Location"><input value={F.v.location} onChange={e => F.set('location', e.target.value)} /></Field>
      <Field label="Other names recorded"><input value={F.v.other} onChange={e => F.set('other', e.target.value)} /></Field>
      <Done busy={F.busy} onSave={save} />
    </div>
  </>);
}

/* ---------------- Chemical Clearance (up to 20 lines) */
const blankLine = () => ({ rec: '', std: '', qty: '', unit: 'kg', bl: '' });
export function ClearanceForm({ snap, submit, back, preset }) {
  const F = useForm({ company: '', date: today(), ref: '', bl: '', eta: '', remarks: '', lines: [blankLine()], ...preset });
  const companies = useMemo(() => snap.tables.companies.map(c => c['Company Name']).sort(), [snap]);
  const setLine = (i, k, x) => F.setV(o => ({ ...o, lines: o.lines.map((l, j) => (j === i ? { ...l, [k]: x } : l)) }));
  const coOk = companies.some(n => eq(n, F.v.company));
  const quotas = snap.insights.quotas.filter(q => eq(q.co, F.v.company) && q.active);
  const save = async () => {
    const e = need(F.v, ['company', 'date']);
    if (F.v.company && !coOk) e.company = 'Not a registered company – register it first';
    const lines = F.v.lines.filter(l => l.rec.trim() || l.std.trim());
    if (!lines.length) e.lines = 'Add at least one chemical';
    lines.forEach((l, i) => { if (!isNum(l.qty)) e['q' + i] = 'Quantity?'; });
    F.setErr(e); if (Object.keys(e).length) return;
    F.setBusy(true);
    const ok = await submit('clearance', { ...F.v, company: companies.find(n => eq(n, F.v.company)), lines: lines.map(l => ({ ...l, rec: l.rec || l.std })) });
    F.setBusy(false); if (ok) back();
  };
  return (<>
    <Bar title="New chemical clearance" back={back} onSave={save} busy={F.busy} />
    <div className="card form">
      <Field label="Company" req err={F.err.company}><Combo id="cos" value={F.v.company} onChange={x => F.set('company', x)} options={companies} /></Field>
      <div className="two">
        <Field label="Clearance date" req err={F.err.date}><input type="date" value={F.v.date} onChange={e => F.set('date', e.target.value)} /></Field>
        <Field label="ETA"><input type="date" value={F.v.eta} onChange={e => F.set('eta', e.target.value)} /></Field>
      </div>
      <Field label="EPA Clearance Ref. No."><input value={F.v.ref} onChange={e => F.set('ref', e.target.value)} /></Field>
      <Field label="B/L / Invoice / AWB No." hint="Used for every line unless a line has its own"><input value={F.v.bl} onChange={e => F.set('bl', e.target.value)} /></Field>
      <Field label="Remarks"><textarea rows={2} value={F.v.remarks} onChange={e => F.set('remarks', e.target.value)} /></Field>
      {quotas.length > 0 && <p className="infobox">Licensed quotas for this company: {quotas.map(q => `${q.chem} ${q.pct === null ? '' : Math.round(q.pct * 100) + '% used'}`).join(' · ')}</p>}
    </div>
    {F.v.lines.map((l, i) => {
      const fee = l.std ? feeLine(snap.hazards, { std: l.std, qty: l.qty, unit: l.unit }) : null;
      return (
        <div className="card form" key={i}>
          <div className="linehead"><b>Chemical {i + 1}</b>{F.v.lines.length > 1 && <button className="ghost small" onClick={() => F.setV(o => ({ ...o, lines: o.lines.filter((_, j) => j !== i) }))}>Remove</button>}</div>
          <Field label="Chemical as recorded (on the documents)"><input value={l.rec} onChange={e => setLine(i, 'rec', e.target.value)} /></Field>
          <Field label="Chemical (Standard)" hint="Pick from the list"><Combo id="chems" value={l.std} onChange={x => setLine(i, 'std', x)} options={snap.lists.chemicals} /></Field>
          <div className="two">
            <Field label="Quantity" req err={F.err['q' + i]}><input inputMode="decimal" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)} /></Field>
            <Field label="Unit"><Select value={l.unit} onChange={x => setLine(i, 'unit', x)} options={snap.lists.units.length ? snap.lists.units : ['kg', 'MT', 'L', 'pcs']} blank={null} /></Field>
          </div>
          <Field label="B/L for this line (if different)"><input value={l.bl} onChange={e => setLine(i, 'bl', e.target.value)} /></Field>
          {fee && <p className="hint">{fee.hmis !== null ? `HMIS ${fee.hmis}` : 'No HMIS rating'}{fee.catName ? ' · ' + fee.catName : ''}{fee.fee !== null ? ` · fee ≈ US$${money(fee.fee)}` : ''}</p>}
        </div>
      );
    })}
    {F.err.lines && <p className="err center">{F.err.lines}</p>}
    {F.v.lines.length < 20 && <button className="wide" onClick={() => F.setV(o => ({ ...o, lines: [...o.lines, blankLine()] }))}>+ Add another chemical</button>}
    <Done busy={F.busy} onSave={save} label="Save clearance" />
  </>);
}

/* ---------------- Record Payment (against a bill) */
export function PaymentForm({ snap, submit, back, preset }) {
  const F = useForm({ bill: '', amount: '', date: today(), receipt: '', purpose: '', remarks: '', ...preset });
  const bills = snap.insights.bills;
  const unpaid = bills.filter(b => !b.isPaid).sort((a, b) => String(a.no).localeCompare(String(b.no)));
  const b = bills.find(x => eq(x.no, F.v.bill));
  const over = b && num(F.v.amount) > b.out + 0.005;
  const dupR = F.v.receipt.trim() && snap.tables.payments.some(p => eq(p['Receipt No.'], F.v.receipt));
  const save = async () => {
    const e = need(F.v, ['bill', 'amount', 'date']);
    if (F.v.bill && !b) e.bill = 'Bill No. not found'; if (F.v.amount && !(num(F.v.amount) > 0)) e.amount = 'Above 0';
    F.setErr(e); if (Object.keys(e).length) return;
    F.setBusy(true); const ok = await submit('payment', { ...F.v, bill: b.no, amount: num(F.v.amount) }); F.setBusy(false); if (ok) back();
  };
  return (<>
    <Bar title="Record payment" back={back} onSave={save} busy={F.busy} />
    <div className="card form">
      <Field label="Bill being paid" req err={F.err.bill}>
        <Select value={unpaid.some(x => x.no === F.v.bill) ? F.v.bill : ''} onChange={x => { F.set('bill', x); const bb = bills.find(y => y.no === x); if (bb) F.set('amount', bb.out ? String(bb.out) : ''); }}
          options={unpaid.map(x => ({ value: x.no, label: `${x.no} · ${x.co} · owes ${money(x.out)}` }))} blank="— choose an unpaid bill —" />
        <input className="mt" placeholder="…or type any Bill No." value={F.v.bill} onChange={e => F.set('bill', e.target.value.toUpperCase())} />
      </Field>
      {b && <div className="infobox"><b>{b.co}</b><br />{b.type} · {fmtD(b.date)}<br />Billed US${money(b.billed)} · paid US${money(b.paid)} · <b>outstanding US${money(b.out)}</b></div>}
      <div className="two">
        <Field label="Amount (US$)" req err={F.err.amount}><input inputMode="decimal" value={F.v.amount} onChange={e => F.set('amount', e.target.value)} /></Field>
        <Field label="Payment date" req err={F.err.date}><input type="date" value={F.v.date} onChange={e => F.set('date', e.target.value)} /></Field>
      </div>
      {over && <p className="warnbox">More than the outstanding balance of US${money(b.out)}.</p>}
      <Field label="Receipt No."><input value={F.v.receipt} onChange={e => F.set('receipt', e.target.value)} /></Field>
      {dupR && <p className="warnbox">This receipt number is already recorded.</p>}
      <Field label="Purpose / services" hint="Leave blank to use the services on the bill"><Combo id="purp" value={F.v.purpose} onChange={x => F.set('purpose', x)} options={snap.lists.purposes} placeholder={b ? b.purpose : ''} /></Field>
      <Field label="Remarks"><input value={F.v.remarks} onChange={e => F.set('remarks', e.target.value)} /></Field>
      <Done busy={F.busy} onSave={save} label="Save payment" />
    </div>
  </>);
}

/* ---------------- Field inspection (GPS + photos) */
export function InspectionForm({ snap, submit, back, preset, flash }) {
  const F = useForm({ company: '', site: '', type: '', linked: '', date: today(), compliance: '', findings: '', actions: '', followUp: '', ...preset });
  const [photos, setPhotos] = useState([]);
  const [gpsBusy, setGpsBusy] = useState(false);
  const companies = useMemo(() => snap.tables.companies.map(c => c['Company Name']).sort(), [snap]);
  const gps = async () => {
    setGpsBusy(true);
    try { const g = await getGps(); F.setV(o => ({ ...o, lat: g.lat, lng: g.lng, acc: g.gps_accuracy_m })); flash(`Location captured (±${g.gps_accuracy_m} m)`); }
    catch (e) { flash('Could not get the location: ' + e.message); }
    setGpsBusy(false);
  };
  const photo = async () => { try { const d = await takePhoto(); if (d) setPhotos(p => [...p, { data: d, taken: new Date().toISOString() }]); } catch (e) { if (!/cancel/i.test(e.message)) flash(e.message); } };
  const save = async () => {
    const e = need(F.v, ['site', 'date']); F.setErr(e); if (Object.keys(e).length) return;
    F.setBusy(true); const ok = await submit('inspection', { ...F.v, company: companies.find(n => eq(n, F.v.company)) || F.v.company }, photos); F.setBusy(false); if (ok) back();
  };
  return (<>
    <Bar title="Field inspection" back={back} onSave={save} busy={F.busy} />
    <div className="card form">
      <Field label="Company"><Combo id="cos2" value={F.v.company} onChange={x => F.set('company', x)} options={companies} /></Field>
      <Field label="Site / facility" req err={F.err.site}><input value={F.v.site} onChange={e => F.set('site', e.target.value)} /></Field>
      <div className="two">
        <Field label="Date" req err={F.err.date}><input type="date" value={F.v.date} onChange={e => F.set('date', e.target.value)} /></Field>
        <Field label="Type"><Select value={F.v.type} onChange={x => F.set('type', x)} options={INSP_TYPES} /></Field>
      </div>
      <Field label="Linked record" hint="Licence, clearance or bill number, if any"><input value={F.v.linked} onChange={e => F.set('linked', e.target.value.toUpperCase())} /></Field>
      <Field label="Compliance"><Select value={F.v.compliance} onChange={x => F.set('compliance', x)} options={COMPLIANCE} /></Field>
      <Field label="Findings"><textarea rows={4} value={F.v.findings} onChange={e => F.set('findings', e.target.value)} /></Field>
      <Field label="Actions required"><textarea rows={3} value={F.v.actions} onChange={e => F.set('actions', e.target.value)} /></Field>
      <Field label="Follow-up date"><input type="date" value={F.v.followUp} onChange={e => F.set('followUp', e.target.value)} /></Field>
      <div className="gps"><span>GPS location</span>
        {F.v.lat ? <b>{F.v.lat}, {F.v.lng} (±{F.v.acc} m)</b> : <small className="muted">not captured</small>}
        <button type="button" onClick={gps} disabled={gpsBusy}>{gpsBusy ? 'Locating…' : F.v.lat ? 'Capture again' : '📍 Capture GPS'}</button></div>
      <div className="gps"><span>Photos ({photos.length})</span>
        <div className="photos">{photos.map((p, i) => <img key={i} src={`data:image/jpeg;base64,${p.data}`} alt="" onClick={() => confirm('Remove this photo?') && setPhotos(ps => ps.filter((_, j) => j !== i))} />)}</div>
        <button type="button" onClick={photo}>📷 Add photo</button></div>
      <Done busy={F.busy} onSave={save} label="Save inspection" />
    </div>
  </>);
}

/* ---------------- Notes & Issues */
export function IssueForm({ snap, submit, back, preset }) {
  const F = useForm({ register: '', record: '', issue: '', action: '', status: 'Open', ...preset });
  const save = async () => {
    const e = need(F.v, ['issue']); F.setErr(e); if (Object.keys(e).length) return;
    F.setBusy(true); const ok = await submit('issue', F.v); F.setBusy(false); if (ok) back();
  };
  return (<>
    <Bar title="Report a data issue" back={back} onSave={save} busy={F.busy} />
    <div className="card form">
      <Field label="Register"><Select value={F.v.register} onChange={x => F.set('register', x)} options={snap.lists.registers} /></Field>
      <Field label="Record" hint="ID of the record, e.g. LIC-067"><input value={F.v.record} onChange={e => F.set('record', e.target.value.toUpperCase())} /></Field>
      <Field label="Issue found" req err={F.err.issue}><textarea rows={4} value={F.v.issue} onChange={e => F.set('issue', e.target.value)} /></Field>
      <Field label="Action taken"><textarea rows={2} value={F.v.action} onChange={e => F.set('action', e.target.value)} /></Field>
      <Field label="Follow-up status"><Select value={F.v.status} onChange={x => F.set('status', x)} options={snap.lists.issueStatus} blank={null} /></Field>
      <Done busy={F.busy} onSave={save} />
    </div>
  </>);
}
