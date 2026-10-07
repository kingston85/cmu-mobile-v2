import { fmtD } from '../lib/util';

export function Header({ title, sub, back, right }) {
  return (
    <header className="top">
      {back && <button className="ghost" onClick={back} aria-label="Back">‹</button>}
      <div className="grow"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {right}
    </header>
  );
}
export const Card = ({ title, children, tone, className = '' }) => (
  <section className={`card ${tone ? 'tone-' + tone : ''} ${className}`}>{title && <h3>{title}</h3>}{children}</section>
);
export function Pill({ tone, children }) { return <span className={`pill ${tone || ''}`}>{children}</span>; }

const DATE_COL = /Date$|^ETA$|^Expiry/;
/** every filled field of a register row */
export function KV({ row, skip = [], link }) {
  return Object.entries(row).filter(([k, v]) => v !== '' && v !== null && v !== undefined && !skip.includes(k)).map(([k, v]) => (
    <div className="kv" key={k}>
      <span>{k}</span>
      {link && link[k] ? <button className="link" onClick={link[k]}>{String(v)}</button>
        : <b className={String(v).length > 40 ? 'pre' : ''}>{DATE_COL.test(k) ? fmtD(v) : typeof v === 'number' && /USD|Amount/.test(k) ? v.toLocaleString('en-US', { minimumFractionDigits: 2 }) : String(v)}</b>}
    </div>
  ));
}
export function Row({ title, sub, right, onClick, badge }) {
  return (
    <button className="card listrow" onClick={onClick}>
      <span className="grow"><b>{title || '(no name)'}</b>{sub && <small>{sub}</small>}</span>
      {badge}{right && <span className="right">{right}</span>}
    </button>
  );
}
export function Empty({ children }) { return <p className="empty">{children}</p>; }
export function Field({ label, req, children, err, hint }) {
  return (
    <label className={err ? 'bad' : ''}>{label}{req && <em> *</em>}{children}
      {hint && !err && <small className="hint">{hint}</small>}{err && <small className="err">{err}</small>}</label>
  );
}
/** pick from a long list with typing (datalist) */
export function Combo({ id, value, onChange, options, placeholder }) {
  return (<>
    <input list={id} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || 'Type to search…'} autoComplete="off" />
    <datalist id={id}>{options.slice(0, 600).map(o => <option key={o} value={o} />)}</datalist>
  </>);
}
export function Select({ value, onChange, options, blank = '—' }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      {blank !== null && <option value="">{blank}</option>}
      {options.map(o => typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
export function licTone(days) { return days === null ? '' : days < 0 ? 'bad' : days <= 60 ? 'warn' : 'ok'; }
