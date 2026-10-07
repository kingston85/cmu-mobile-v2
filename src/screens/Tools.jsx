import { useState } from 'react';
import { Header, Card, Field, Combo, Select, Pill } from './ui';
import { money, amountInWords, feeLine, eq, fmtD, daysUntil } from '../lib/util';
import { scanQR } from '../lib/device';
import { verifyCode, isOnline } from '../lib/api';
import { rowsOf } from './Records';

/* ---------------- check a printed licence / clearance / bill */
function idFromCode(code) {
  const s = String(code || '');
  const m = s.match(/[?&]id=([^&]+)/) || s.toUpperCase().match(/CODE\s+(\S+)-[0-9A-F]{10}\b/) || s.toUpperCase().replace(/\s+/g, '').match(/^(.+)-[0-9A-F]{10}$/);
  return m ? decodeURIComponent(m[1]).toUpperCase() : '';
}
export function Verify({ session, snap, back, go, flash }) {
  const [code, setCode] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const check = async c => {
    c = String(c || code).trim(); if (!c) return;
    setCode(c); setBusy(true); setRes(null);
    try {
      if (session.demo || !(await isOnline())) throw Object.assign(new Error('offline'), { offline: true });
      setRes(await verifyCode(session, c));
    } catch (e) {
      if (e.server) flash(e.message);
      const id = idFromCode(c);
      const local = id && (rowsOf(snap, 'licences').find(r => eq(r['Record ID'], id)) ? { kind: 'licences', id } : rowsOf(snap, 'clearances').find(r => eq(r.no, id)) ? { kind: 'clearances', id } : rowsOf(snap, 'bills').find(r => eq(r.no, id)) ? { kind: 'bills', id } : null);
      setRes({ offline: true, id, local });
    }
    setBusy(false);
  };
  const scan = async () => { try { const c = await scanQR(); if (c) check(c); } catch (e) { if (!/cancel/i.test(e.message || '')) flash('Scanner: ' + (e.message || e)); } };
  const lic = res && res.genuine && res.kind === 'licence' ? rowsOf(snap, 'licences').find(r => eq(r['Record ID'], res.id)) : null;
  return (<>
    <Header title="Check a document" sub="Licences, clearance letters and bills carry a CMU QR code" back={back} />
    <button className="primary wide big" onClick={scan} disabled={busy}>📷 Scan the QR code</button>
    <div className="card form">
      <Field label="…or type the code" hint='Shown on the document after "Code", e.g. LIC-067-1A2B3C4D5E'>
        <input value={code} onChange={e => setCode(e.target.value)} autoCapitalize="characters" />
      </Field>
      <button className="wide" disabled={busy || !code.trim()} onClick={() => check()}>{busy ? 'Checking…' : 'Check'}</button>
    </div>
    {res && res.genuine && <Card tone={res.valid ? 'ok' : 'warn'}>
      <h3 className="verdict">✔ GENUINE – {res.status}</h3>
      {res.lines.map((l, i) => <p key={i} className="vline">{l}</p>)}
      {lic && (() => { const d = daysUntil(lic['Expiry Date']); return d !== null ? <p><Pill tone={d < 0 ? 'bad' : d <= 60 ? 'warn' : 'ok'}>{d < 0 ? 'Expired' : d + ' days left'}</Pill></p> : null; })()}
      <button className="link" onClick={() => go('detail', { kind: res.kind === 'licence' ? 'licences' : res.kind === 'bill' ? 'bills' : 'clearances', id: res.id })}>Open the record</button>
    </Card>}
    {res && !res.offline && !res.genuine && <Card tone="bad"><h3 className="verdict">✖ NOT RECOGNISED</h3><p>{res.message}</p><p className="small">Keep the document and report it to the CMU.</p></Card>}
    {res && res.offline && <Card tone="warn"><h3 className="verdict">No network – authenticity not checked</h3>
      <p>The genuineness check needs the server. {res.local ? 'The record exists in the downloaded copy:' : res.id ? `${res.id} is not in the downloaded copy.` : 'This is not a CMU code.'}</p>
      {res.local && <button className="link" onClick={() => go('detail', res.local)}>Open {res.id}</button>}
      <p className="small">Check again when you have a signal.</p></Card>}
  </>);
}

/* ---------------- fee estimate (Qp = R × Hi × Qi) */
const blank = () => ({ std: '', qty: '', unit: 'kg', hmis: '', cat: '' });
export function Fee({ snap, back }) {
  const [lines, setLines] = useState([blank()]);
  const H = snap.hazards;
  const set = (i, k, v) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const calc = lines.map(l => (l.std ? feeLine(H, l) : null));
  const total = calc.reduce((a, c) => a + (c && c.fee ? c.fee : 0), 0);
  return (<>
    <Header title="Fee estimate" sub="RI/C&E-002-04/20 · Qp = R × Hi × Qi" back={back} />
    {!H.rows.length && <p className="warnbox">The Chemical Hazards table has not been downloaded yet – sync first.</p>}
    {lines.map((l, i) => {
      const c = calc[i];
      return (
        <div className="card form" key={i}>
          <div className="linehead"><b>Chemical {i + 1}</b>{lines.length > 1 && <button className="ghost small" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>Remove</button>}</div>
          <Field label="Chemical (Standard)"><Combo id="fchem" value={l.std} onChange={v => set(i, 'std', v)} options={H.rows.map(r => r.name)} /></Field>
          <div className="two">
            <Field label="Quantity"><input inputMode="decimal" value={l.qty} onChange={e => set(i, 'qty', e.target.value)} /></Field>
            <Field label="Unit"><Select value={l.unit} onChange={v => set(i, 'unit', v)} options={['kg', 'L', 'MT']} blank={null} /></Field>
          </div>
          {c && (c.hmis === null || !c.catName || !H.cats.some(x => eq(x[0], c.catName))) && <div className="two">
            <Field label="HMIS rating (from the SDS)"><Select value={l.hmis} onChange={v => set(i, 'hmis', v)} options={['0', '1', '2', '3', '4']} /></Field>
            <Field label="Fee category"><Select value={l.cat} onChange={v => set(i, 'cat', v)} options={H.cats.map(x => x[0])} /></Field>
          </div>}
          {c && <p className={c.fee !== null ? 'okbox' : 'warnbox'}>
            {c.row ? `HMIS ${c.hmis ?? '—'} · ${c.catName || 'no category'}${c.row.notes ? ' · ' + c.row.notes : ''}` : 'Not in the Chemical Hazards list.'}<br />
            {c.fee !== null ? <b>{c.working}</b> : c.note}</p>}
        </div>
      );
    })}
    <button className="wide" onClick={() => setLines(ls => [...ls, blank()])}>+ Add chemical</button>
    <Card tone="info"><div className="kv"><span>Estimated total</span><b className="big">US${money(total)}</b></div>
      {total > 0 && <p className="small">{amountInWords(total)} UNITED STATES DOLLARS</p>}
      <p className="small muted">Estimate only, from the Chemical Hazards sheet as downloaded at the last sync. The official bill is issued from the CMU Database.</p></Card>
  </>);
}
