// Formatting, search and the fee calculation (same rule as the desktop: Qp = R × Hi × Qi, RI/C&E-002-04/20).

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const today = () => new Date().toISOString().slice(0, 10);
export const fmtD = iso => {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${MON[+m[2] - 1]}-${m[1]}` : String(iso);
};
export const fmtWhen = iso => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never');
export const money = n => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = v => { const n = Number(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? 0 : n; };
export const isNum = v => String(v ?? '').trim() !== '' && !isNaN(Number(String(v).replace(/,/g, '')));
export const daysUntil = iso => (iso ? Math.round((new Date(iso + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 864e5) : null);
export const eq = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/** all words must appear somewhere in the record */
export function matches(obj, q) {
  if (!q) return true;
  const hay = Object.values(obj).join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

/** one entry per Clearance No. */
export function groupClearances(rows) {
  const by = new Map();
  for (const r of rows) {
    const k = r['Clearance No.'] || r['Record ID'];
    if (!by.has(k)) by.set(k, { no: k, coId: r['Company ID'], co: r['Company Name'], date: r['Clearance Date'], ref: r['Clearance Ref. No.'], bl: r['B/L / Invoice / AWB No.'], kg: 0, lines: [] });
    const g = by.get(k);
    g.lines.push(r);
    g.kg += num(r['Qty (kg)']);
    if (r['Clearance Date'] && (!g.date || r['Clearance Date'] < g.date)) g.date = r['Clearance Date'];
  }
  return [...by.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.no).localeCompare(String(a.no)));
}

/* ---------------- amount in words (as on the bill letters) */
const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
function w999(n) {
  let s = '';
  if (n >= 100) { s = ONES[Math.floor(n / 100)] + ' HUNDRED'; n %= 100; if (n) s += ' '; }
  if (n >= 20) { s += TENS[Math.floor(n / 10)]; if (n % 10) s += '-' + ONES[n % 10]; } else if (n) s += ONES[n];
  return s;
}
export function amountInWords(amt) {
  const r = Math.round(num(amt) * 100) / 100, d = Math.floor(r), c = Math.round((r - d) * 100);
  const scl = ['', ' THOUSAND', ' MILLION', ' BILLION'];
  let s = '', n = d, i = 0;
  while (n > 0 && i < 4) { const ch = n % 1000; if (ch) s = w999(ch) + scl[i] + (s ? ' ' + s : ''); n = Math.floor(n / 1000); i++; }
  s = s || 'ZERO';
  if (c > 0) s += ' AND ' + String(c).padStart(2, '0') + '/100';
  return s;
}

/* ---------------- fee estimate (offline, from the Chemical Hazards sheet) */
export function toKg(q, unit) {
  if (!isNum(q)) return null;
  const u = String(unit || '').toLowerCase().replace(/\s+/g, '');
  q = num(q);
  if (/^(kg|kgs|l|ltr|litre|liter|litres|liters)$/.test(u)) return q;
  if (/^(mt|t|ton|tons|tonne|tonnes)$/.test(u)) return q * 1000;
  if (/^g$/.test(u)) return q / 1000;
  return null;
}
export function feeLine(hazards, line) {
  const row = hazards.rows.find(r => eq(r.name, line.std)) || null;
  const hmisRaw = line.hmis !== '' && line.hmis != null ? line.hmis : row ? row.hmis : '';
  const hmis = isNum(hmisRaw) ? num(hmisRaw) : null;
  const catName = line.cat || (row ? row.cat : '');
  const cat = hazards.cats.find(c => eq(c[0], catName));
  const hiRow = hazards.hi.find(h => h[0] === hmis);
  const kg = toKg(line.qty, line.unit);
  const out = { row, hmis, catName, kg, fee: null, note: '' };
  if (!cat) out.note = 'Fee category missing – pick one.';
  else if (hmis === null) out.note = 'HMIS rating missing – take it from the SDS (never guessed).';
  else if (!hiRow) out.note = 'HMIS must be 0–4.';
  else if (kg === null) out.note = 'Quantity/unit cannot be converted to kg (pcs, cylinders…).';
  else {
    const q = cat[1] === 'MT' ? kg / 1000 : kg;
    out.fee = Math.round(cat[2] * hiRow[1] * q * 100) / 100;
    out.working = `${cat[2]} × ${hiRow[1]} × ${q.toLocaleString()} ${cat[1] === 'MT' ? 'MT' : 'kg'} = US$${money(out.fee)}`;
  }
  return out;
}
