import { useMemo, useState } from 'react';
import { Header, Card, KV, Row, Empty, Pill, licTone } from './ui';
import { fmtD, money, num, daysUntil, matches, groupClearances, eq } from '../lib/util';
import { toCsv, shareCsv } from '../lib/device';

/* ---------------- what each register looks like on the phone */
export const KINDS = {
  companies: { label: 'Companies', icon: '🏢', key: 'Company ID', outbox: 'company' },
  licences: { label: 'Licences & Certificates', icon: '📜', key: 'Record ID' },
  clearances: { label: 'Chemical Clearances', icon: '🧪', key: 'no', outbox: 'clearance' },
  bills: { label: 'Bills & Invoices', icon: '🧾', key: 'no' },
  payments: { label: 'Payments & Receipts', icon: '💵', key: 'Record ID', outbox: 'payment' },
  inspections: { label: 'Field Inspections', icon: '🔍', key: 'Inspection ID', outbox: 'inspection' },
  issues: { label: 'Notes & Issues', icon: '📌', key: 'Issue #', outbox: 'issue' },
};
export function rowsOf(snap, kind) {
  const t = snap.tables;
  if (kind === 'clearances') return groupClearances(t.clearances);
  if (kind === 'bills') return [...snap.insights.bills].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return t[kind] || [];
}
const OUTBOX_TITLE = {
  company: d => d.name, clearance: d => `${d.company} – ${(d.lines || []).length} chemical(s)`, payment: d => `${d.bill} – US$${money(d.amount)}`,
  inspection: d => `${d.site}${d.company ? ' – ' + d.company : ''}`, issue: d => d.issue,
};
export function display(kind, r) {
  switch (kind) {
    case 'companies': return { title: r['Company Name'], sub: [r['Company ID'], r['Sector / Activity'], r['Location']].filter(Boolean).join(' · ') };
    case 'licences': {
      const d = daysUntil(r['Expiry Date']);
      return { title: r['Licence / Certificate Type'] || r['Licence Category'], sub: [r['Company Name'], r['Licence / Certificate No.'], r['Expiry Date'] && 'expires ' + fmtD(r['Expiry Date'])].filter(Boolean).join(' · '),
        badge: d === null ? null : <Pill tone={licTone(d)}>{d < 0 ? 'Expired' : d <= 60 ? `${d} d left` : 'Active'}</Pill> };
    }
    case 'clearances': return { title: `${r.no} · ${r.co}`, sub: `${r.lines.length} chemical(s) · ${money(r.kg)} kg · ${fmtD(r.date)}` };
    case 'bills': return { title: `${r.no} · ${r.co}`, sub: [r.type || r.purpose, fmtD(r.date)].filter(Boolean).join(' · '), right: 'US$' + money(r.billed),
      badge: <Pill tone={r.isPaid ? 'ok' : r.age > 30 ? 'bad' : 'warn'}>{r.isPaid ? 'Paid' : 'Owes ' + money(r.out)}</Pill> };
    case 'payments': return { title: r['Company Name'] || r['Name as Recorded'], sub: [r['Record ID'], r['Receipt No.'] && 'Rcpt ' + r['Receipt No.'], fmtD(r['Payment Date']), r['Bill No.']].filter(Boolean).join(' · '), right: 'US$' + money(r['Amount (USD)']) };
    case 'inspections': return { title: r['Site / Facility'], sub: [r['Inspection ID'], r['Company'], fmtD(r['Inspection Date'])].filter(Boolean).join(' · '),
      badge: r['Compliance'] ? <Pill tone={r['Compliance'] === 'Compliant' ? 'ok' : r['Compliance'] === 'Non-compliant' ? 'bad' : 'warn'}>{r['Compliance']}</Pill> : null };
    case 'issues': return { title: String(r['Issue Found'] || '').slice(0, 80), sub: ['#' + r['Issue #'], r['Register'], r['Record']].filter(Boolean).join(' · '), badge: <Pill tone={/open/i.test(r['Follow-up Status']) ? 'warn' : 'ok'}>{r['Follow-up Status'] || '—'}</Pill> };
    default: return { title: '' };
  }
}

/* ---------------- list of the registers */
export function Records({ snap, go }) {
  return (<>
    <Header title="Registers" sub="Copy downloaded at the last sync" />
    {Object.entries(KINDS).map(([k, K]) => (
      <Row key={k} title={`${K.icon}  ${K.label}`} right={<b>{rowsOf(snap, k).length}</b>} onClick={() => go('list', { kind: k })} />
    ))}
    <Row title="⚖️  Import quotas" sub="Licensed quantities against clearances" right={<b>{snap.insights.quotas.length}</b>} onClick={() => go('quotas')} />
  </>);
}

const FILTERS = {
  licences: [['all', 'All'], ['soon', 'Expiring ≤60 d'], ['expired', 'Expired'], ['active', 'Active']],
  bills: [['all', 'All'], ['unpaid', 'Unpaid'], ['old', 'Unpaid > 30 d'], ['paid', 'Paid']],
  inspections: [['all', 'All'], ['nc', 'Non-compliant'], ['minor', 'Minor issues']],
};
function filt(kind, f, r) {
  if (f === 'all') return true;
  if (kind === 'licences') { const d = daysUntil(r['Expiry Date']); return f === 'soon' ? d !== null && d >= 0 && d <= 60 : f === 'expired' ? d !== null && d < 0 : d !== null && d >= 0; }
  if (kind === 'bills') return f === 'paid' ? r.isPaid : f === 'old' ? !r.isPaid && r.age > 30 : !r.isPaid;
  if (kind === 'inspections') return f === 'nc' ? r['Compliance'] === 'Non-compliant' : r['Compliance'] === 'Minor issues';
  return true;
}
export function List({ kind, initialFilter, snap, outbox, go, back, flash }) {
  const K = KINDS[kind];
  const [q, setQ] = useState('');
  const [f, setF] = useState(initialFilter || 'all');
  const all = useMemo(() => rowsOf(snap, kind), [snap, kind]);
  const rows = useMemo(() => all.filter(r => filt(kind, f, r) && matches(kind === 'clearances' ? { ...r, lines: r.lines.map(l => l['Chemical as Recorded'] + ' ' + l['Chemical (Standard)']).join(' ') } : r, q)), [all, kind, f, q]);
  const waiting = outbox.filter(o => o.type === K.outbox && o.status !== 'ok');
  const exportCsv = async () => {
    const flat = kind === 'clearances' ? snap.tables.clearances : kind === 'bills' ? snap.tables.bills : rows;
    const cols = Object.keys(flat[0] || {}).map(c => ({ label: c, value: r => r[c] }));
    try { await shareCsv(`CMU_${K.label.replace(/\W+/g, '_')}.csv`, toCsv(flat, cols)); } catch (e) { flash(e.message); }
  };
  return (<>
    <Header title={K.label} back={back} right={<button className="ghost small" onClick={exportCsv}>CSV</button>} />
    <input className="search" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
    {FILTERS[kind] && <div className="chips">{FILTERS[kind].map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}</div>}
    {waiting.map(o => <Row key={o.cid} title={OUTBOX_TITLE[o.type](o.data)} sub="Made on this phone" badge={<OutPill o={o} />} onClick={() => go('sync')} />)}
    <p className="muted small">{rows.length} of {all.length}</p>
    {!rows.length && <Empty>Nothing matches.</Empty>}
    {rows.slice(0, 300).map(r => { const d = display(kind, r); return <Row key={r[K.key]} {...d} onClick={() => go('detail', { kind, id: r[K.key] })} />; })}
    {rows.length > 300 && <p className="muted small center">Showing 300 – search to narrow down.</p>}
  </>);
}
export function OutPill({ o }) {
  return <Pill tone={o.status === 'ok' ? 'ok' : o.status === 'queued' ? 'info' : o.status === 'confirm' ? 'warn' : 'bad'}>
    {o.status === 'ok' ? 'Uploaded ' + (o.resultId || '') : o.status === 'queued' ? 'Waiting to upload' : o.status === 'confirm' ? 'Needs your OK' : 'Error'}</Pill>;
}

/* ---------------- search everything */
export function Search({ snap, go }) {
  const [q, setQ] = useState('');
  const hits = useMemo(() => {
    if (q.trim().length < 2) return [];
    return Object.keys(KINDS).flatMap(k => rowsOf(snap, k).filter(r => matches(k === 'clearances' ? { ...r, lines: r.lines.map(l => l['Chemical as Recorded']).join(' ') } : r, q)).slice(0, 8).map(r => ({ k, r })));
  }, [q, snap]);
  return (<>
    <Header title="Find" sub="Companies, licences, clearances, bills, payments, inspections" />
    <input className="search big" autoFocus placeholder="Name, ID, licence no., B/L, receipt…" value={q} onChange={e => setQ(e.target.value)} />
    {q.trim().length >= 2 && !hits.length && <Empty>No records match “{q}”.</Empty>}
    {hits.map(({ k, r }) => { const d = display(k, r); return <Row key={k + r[KINDS[k].key]} {...d} title={`${KINDS[k].icon} ${d.title}`} onClick={() => go('detail', { kind: k, id: r[KINDS[k].key] })} />; })}
  </>);
}

/* ---------------- quotas */
export function Quotas({ snap, back, go, coId }) {
  const rows = snap.insights.quotas.filter(x => !coId || x.coId === coId);
  return (<>
    <Header title="Import quotas" sub="Chemical Importation Licences vs quantities cleared" back={back} />
    {!rows.length && <Empty>No licensed quantities on record.</Empty>}
    {rows.map((x, i) => <QuotaRow key={i} x={x} onClick={() => go('detail', { kind: 'licences', id: x.lic })} />)}
  </>);
}
function QuotaRow({ x, onClick }) {
  const pct = x.pct === null ? null : Math.round(x.pct * 100);
  return (
    <button className="card listrow" onClick={onClick}>
      <span className="grow"><b>{x.chem}</b><small>{x.co} · {x.lic} {x.licNo}{x.perMonth ? ' · per month' : ''}{x.active ? '' : ' · licence expired'}</small>
        {pct !== null && <span className="bar"><i style={{ width: Math.min(pct, 100) + '%' }} className={pct > 100 ? 'bad' : pct >= 80 ? 'warn' : 'ok'} /></span>}
        <small>{x.limit === null ? 'No quantity on licence' : `${money(x.used)} of ${money(x.limit)} kg`}</small></span>
      <Pill tone={x.status === 'OVER QUOTA' ? 'bad' : /Near/.test(x.status) ? 'warn' : x.status === 'OK' ? 'ok' : ''}>{pct === null ? '—' : pct + '%'}</Pill>
    </button>
  );
}

/* ---------------- record details */
export function Detail({ kind, id, snap, go, back, canEdit }) {
  const r = rowsOf(snap, kind).find(x => String(x[KINDS[kind].key]) === String(id));
  if (!r) return <><Header title="Not found" back={back} /><Empty>This record is not in the downloaded copy. Sync and try again.</Empty></>;
  const co = cid => () => go('detail', { kind: 'companies', id: cid });
  const t = snap.tables;
  switch (kind) {
    case 'companies': return <CompanyDetail r={r} snap={snap} go={go} back={back} canEdit={canEdit} />;
    case 'licences': {
      const chems = t.licenceChemicals.filter(c => eq(c['Licence Record ID'], r['Record ID']));
      const quotas = snap.insights.quotas.filter(q => q.lic === r['Record ID']);
      const d = daysUntil(r['Expiry Date']);
      return (<>
        <Header title={r['Licence / Certificate Type'] || r['Licence Category']} sub={r['Record ID']} back={back} />
        {d !== null && <Card tone={licTone(d)}><b>{d < 0 ? `Expired ${-d} day(s) ago` : `Valid – ${d} day(s) left`}</b></Card>}
        <Card><KV row={r} link={{ 'Company Name': co(r['Company ID']), 'Company ID': co(r['Company ID']) }} /></Card>
        {chems.length > 0 && <Card title={`Licensed chemicals (${chems.length})`}>{chems.map((c, i) => <div className="kv" key={i}><span>{c['Trade or IUPAC Name']}</span><b>{c['Stipulated Qty']} {c['Unit']}</b></div>)}</Card>}
        {quotas.length > 0 && <Card title="Quota use">{quotas.map((x, i) => <QuotaRow key={i} x={x} onClick={() => {}} />)}</Card>}
      </>);
    }
    case 'clearances': return (<>
      <Header title={r.no} sub={r.co} back={back} />
      <Card>
        <div className="kv"><span>Company</span><button className="link" onClick={co(r.coId)}>{r.co}</button></div>
        <div className="kv"><span>Clearance date</span><b>{fmtD(r.date)}</b></div>
        <div className="kv"><span>EPA Ref. No.</span><b>{r.ref || '—'}</b></div>
        <div className="kv"><span>B/L / Invoice</span><b>{r.bl || '—'}</b></div>
        <div className="kv"><span>Total</span><b>{money(r.kg)} kg ({money(r.kg / 1000)} MT)</b></div>
      </Card>
      {r.lines.map(l => <Card key={l['Record ID']} title={l['Chemical as Recorded']}>
        <div className="kv"><span>Standard name</span><b>{l['Chemical (Standard)'] || '—'}</b></div>
        <div className="kv"><span>Quantity</span><b>{l['Qty as Recorded']} {l['Unit']} = {money(l['Qty (kg)'])} kg</b></div>
        <div className="kv"><span>Record</span><b>{l['Record ID']}</b></div>
      </Card>)}
    </>);
    case 'bills': {
      const lines = t.bills.filter(b => b['Bill No.'] === r.no), pays = t.payments.filter(p => p['Bill No.'] === r.no);
      return (<>
        <Header title={r.no} sub={r.co} back={back} />
        <Card tone={r.isPaid ? 'ok' : r.age > 30 ? 'bad' : 'warn'}>
          <div className="kv"><span>Billed</span><b>US${money(r.billed)}</b></div>
          <div className="kv"><span>Paid</span><b>US${money(r.paid)}</b></div>
          <div className="kv"><span>Outstanding</span><b>US${money(r.isPaid ? 0 : r.out)}</b></div>
          <div className="kv"><span>Status</span><b>{r.status}{r.age !== null && !r.isPaid ? ` · ${r.age} days old` : ''}</b></div>
        </Card>
        <Card><div className="kv"><span>Company</span><button className="link" onClick={co(r.coId)}>{r.co}</button></div>
          <div className="kv"><span>Bill type</span><b>{r.type}</b></div><div className="kv"><span>Bill date</span><b>{fmtD(r.date)}</b></div>
          <div className="kv"><span>Bill Ref. No.</span><b>{r.ref || '—'}</b></div></Card>
        <Card title="Services">{lines.map(l => <div className="kv" key={l['Bill ID']}><span>{l['Purpose / Licence Billed']}{l['Chemical'] ? ' – ' + l['Chemical'] : ''}</span><b>US${money(l['Amount Billed (USD)'])}</b></div>)}</Card>
        <Card title={`Payments (${pays.length})`}>{pays.length ? pays.map(p => <div className="kv" key={p['Record ID']}><span>{fmtD(p['Payment Date'])} · {p['Receipt No.']}</span><b>US${money(p['Amount (USD)'])}</b></div>) : <p className="muted">None yet.</p>}</Card>
        {canEdit && !r.isPaid && <button className="primary wide" onClick={() => go('form', { form: 'payment', preset: { bill: r.no } })}>💵 Record payment on this bill</button>}
      </>);
    }
    case 'payments': return (<><Header title={r['Record ID']} sub={r['Company Name']} back={back} />
      <Card><KV row={r} link={{ 'Company Name': co(r['Company ID']), 'Bill No.': () => go('detail', { kind: 'bills', id: r['Bill No.'] }) }} /></Card></>);
    default: return (<><Header title={display(kind, r).title} back={back} /><Card><KV row={r} /></Card>
      {kind === 'inspections' && r['Latitude'] && <a className="primary wide center" href={`https://www.google.com/maps/search/?api=1&query=${r['Latitude']},${r['Longitude']}`} target="_blank" rel="noreferrer">📍 Open location in Maps</a>}</>);
  }
}

function CompanyDetail({ r, snap, go, back, canEdit }) {
  const id = r['Company ID'], t = snap.tables, mine = x => x['Company ID'] === id;
  const lic = t.licences.filter(mine), bills = snap.insights.bills.filter(b => b.coId === id), pays = t.payments.filter(mine);
  const clr = groupClearances(t.clearances.filter(mine)), ins = t.inspections.filter(i => i['Company ID'] === id), quotas = snap.insights.quotas.filter(q => q.coId === id);
  const billed = bills.reduce((a, b) => a + b.billed, 0), outst = bills.reduce((a, b) => a + (b.isPaid ? 0 : b.out), 0);
  const kg = clr.filter(c => String(c.date).startsWith(String(new Date().getFullYear()))).reduce((a, c) => a + c.kg, 0);
  return (<>
    <Header title={r['Company Name']} sub={id} back={back} />
    <div className="grid">
      <div className="stat"><b>{lic.length}</b><span>Licences</span></div>
      <div className="stat"><b>{money(kg / 1000)}</b><span>MT cleared this year</span></div>
      <div className={`stat ${outst > 0.005 ? 'alert' : ''}`}><b>{money(outst)}</b><span>US$ outstanding</span></div>
    </div>
    <Card><KV row={r} skip={['Company ID', 'Company Name']} /></Card>
    {canEdit && <div className="quick">
      <button className="primary" onClick={() => go('form', { form: 'clearance', preset: { company: r['Company Name'] } })}>+ Clearance</button>
      <button onClick={() => go('form', { form: 'inspection', preset: { company: r['Company Name'] } })}>+ Inspection</button>
    </div>}
    <Card title={`Licences & certificates (${lic.length})`}>
      {lic.map(l => { const d = daysUntil(l['Expiry Date']); return <button key={l['Record ID']} className="row" onClick={() => go('detail', { kind: 'licences', id: l['Record ID'] })}>
        {l['Licence / Certificate Type'] || l['Licence Category']} <Pill tone={licTone(d)}>{d === null ? '—' : d < 0 ? 'Expired' : fmtD(l['Expiry Date'])}</Pill><small>{l['Licence / Certificate No.']}</small></button>; })}
      {!lic.length && <p className="muted">None.</p>}
    </Card>
    {quotas.length > 0 && <button className="card listrow" onClick={() => go('quotas', { coId: id })}><span className="grow"><b>⚖️ Import quotas ({quotas.length})</b>
      <small>{quotas.filter(q => q.status === 'OVER QUOTA').length} over quota · {quotas.filter(q => /Near/.test(q.status)).length} near the limit</small></span></button>}
    <Card title={`Bills (${bills.length}) · billed US$${money(billed)}`}>
      {bills.slice(0, 15).map(b => <button key={b.no} className="row" onClick={() => go('detail', { kind: 'bills', id: b.no })}>{b.no} · {b.type} <Pill tone={b.isPaid ? 'ok' : 'warn'}>{b.isPaid ? 'Paid' : 'Owes ' + money(b.out)}</Pill><small>{fmtD(b.date)}</small></button>)}
      {!bills.length && <p className="muted">None.</p>}
    </Card>
    <Card title={`Payments (${pays.length})`}>{pays.slice(0, 15).map(p => <button key={p['Record ID']} className="row" onClick={() => go('detail', { kind: 'payments', id: p['Record ID'] })}>US${money(p['Amount (USD)'])} · {p['Receipt No.']}<small>{fmtD(p['Payment Date'])} · {p['Bill No.']}</small></button>)}{!pays.length && <p className="muted">None.</p>}</Card>
    <Card title={`Clearances (${clr.length})`}>{clr.slice(0, 15).map(c => <button key={c.no} className="row" onClick={() => go('detail', { kind: 'clearances', id: c.no })}>{c.no} · {money(c.kg)} kg<small>{fmtD(c.date)} · {c.lines.map(l => l['Chemical (Standard)'] || l['Chemical as Recorded']).join(', ')}</small></button>)}{!clr.length && <p className="muted">None.</p>}</Card>
    {ins.length > 0 && <Card title={`Field inspections (${ins.length})`}>{ins.map(i => <button key={i['Inspection ID']} className="row" onClick={() => go('detail', { kind: 'inspections', id: i['Inspection ID'] })}>{i['Site / Facility']} · {i['Compliance']}<small>{fmtD(i['Inspection Date'])}</small></button>)}</Card>}
  </>);
}
