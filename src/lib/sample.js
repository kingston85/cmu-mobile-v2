// Sample registers for trying the app without a server. All names are fictional ("DEMO").
const iso = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

const CO = [
  ['CMU-001', 'DEMO Gold Mining Inc', 'Mining', 'Grand Cape Mount'],
  ['CMU-002', 'DEMO Petroleum Liberia Ltd', 'Petroleum', 'Monrovia'],
  ['CMU-003', 'DEMO Agro Inputs', 'Agriculture', 'Bong'],
  ['CMU-004', 'DEMO Water Treatment Co', 'Water treatment', 'Montserrado'],
  ['CMU-005', 'DEMO Paints & Coatings', 'Manufacturing', 'Paynesville'],
];
const name = id => CO.find(c => c[0] === id)[1];

export function sampleSnapshot() {
  const companies = CO.map(c => ({ 'Company ID': c[0], 'Company Name': c[1], 'Sector / Activity': c[2], 'Location': c[3] }));
  const lic = (id, co, cat, type, no, issued, exp) => ({ 'Record ID': id, 'Company ID': co, 'Company Name': name(co), 'Licence Category': cat,
    'Licence / Certificate Type': type, 'Licence / Certificate No.': no, 'Date Issued': iso(issued), 'Expiry Date': iso(exp), 'Status': exp < 0 ? 'Expired' : 'Active' });
  const licences = [
    lic('LIC-001', 'CMU-001', 'Chemical Importation License (CIL)', 'Chemical Importation License', 'CIL-2026-014', -300, 65),
    lic('LIC-002', 'CMU-001', 'Chemical Registration License (CRL)', 'Annual Chemical Registration License', 'CRL-2026-031', -340, 25),
    lic('LIC-003', 'CMU-002', 'Chemical Registration License (CRL)', 'Annual Chemical Registration License', 'CRL-2025-088', -380, -15),
    lic('LIC-004', 'CMU-003', 'Chemical Importation License (CIL)', 'Chemical Importation License', 'CIL-2026-022', -120, 245),
    lic('LIC-005', 'CMU-004', 'Effluent Discharge License (EDL)', 'Annual Effluent Discharge License', 'EDL-2026-005', -200, 165),
  ];
  const licenceChemicals = [
    { 'Licence Record ID': 'LIC-001', 'Trade or IUPAC Name': 'Sodium cyanide', 'Stipulated Qty': 60, 'Unit': 'MT' },
    { 'Licence Record ID': 'LIC-001', 'Trade or IUPAC Name': 'Hydrated lime', 'Stipulated Qty': 200, 'Unit': 'MT' },
    { 'Licence Record ID': 'LIC-004', 'Trade or IUPAC Name': 'Glyphosate 41% SL', 'Stipulated Qty': 8000, 'Unit': 'L' },
  ];
  let n = 0;
  const clr = (no, co, d, ref, bl, lines) => lines.map(([rec, std, q, u]) => ({ 'Record ID': 'CLR-' + String(++n).padStart(3, '0'), 'Clearance No.': no, 'Company ID': co, 'Company Name': name(co),
    'Chemical as Recorded': rec, 'Chemical (Standard)': std, 'Qty as Recorded': q, 'Unit': u, 'Qty (kg)': u === 'MT' ? q * 1000 : q, 'Qty (MT)': (u === 'MT' ? q * 1000 : q) / 1000,
    'B/L / Invoice / AWB No.': bl, 'Clearance Ref. No.': ref, 'Clearance Date': iso(d) }));
  const clearances = [
    ...clr('CLN-001', 'CMU-001', -110, 'EPA/CMU/CLR/101', 'MSCU1100221', [['NaCN briquettes 98%', 'Sodium cyanide', 22, 'MT'], ['Quicklime', 'Hydrated lime', 40, 'MT']]),
    ...clr('CLN-002', 'CMU-001', -40, 'EPA/CMU/CLR/117', 'MSCU1100498', [['Sodium cyanide', 'Sodium cyanide', 26, 'MT']]),
    ...clr('CLN-003', 'CMU-003', -18, 'EPA/CMU/CLR/124', 'CMAU5531002', [['Roundup 41 SL', 'Glyphosate', 2400, 'L']]),
    ...clr('CLN-004', 'CMU-004', -6, 'EPA/CMU/CLR/129', 'HLCU8890113', [['Aluminium sulphate', 'Aluminium sulphate', 30, 'MT'], ['Calcium hypochlorite 70%', 'Calcium hypochlorite', 8, 'MT']]),
  ];
  const bl = (bid, no, co, svc, amt, d, type, ref) => ({ 'Bill ID': bid, 'Bill No.': no, 'Company ID': co, 'Company Name': name(co), 'Purpose / Licence Billed': svc, 'Amount Billed (USD)': amt, 'Bill Date': iso(d), 'Bill Type': type, 'Bill Ref. No.': ref });
  const bills = [
    bl('BIL-001', 'BN-2026-001', 'CMU-001', 'Chemical Clearance', 4290, -105, 'Chemical Clearance', 'EPA/CMU/B/201'),
    bl('BIL-002', 'BN-2026-002', 'CMU-001', 'Chemical Clearance', 4225, -38, 'Chemical Clearance', 'EPA/CMU/B/214'),
    bl('BIL-003', 'BN-2026-003', 'CMU-002', 'Annual Chemical Registration License', 2500, -70, 'Licence – Renewal', 'EPA/CMU/B/209'),
    bl('BIL-004', 'BN-2026-004', 'CMU-003', 'Chemical Clearance', 360, -16, 'Chemical Clearance', 'EPA/CMU/B/219'),
  ];
  const payments = [
    { 'Record ID': 'PAY-001', 'Company ID': 'CMU-001', 'Company Name': name('CMU-001'), 'Purpose / Services': 'Chemical Clearance', 'Amount (USD)': 4290, 'Payment Date': iso(-95), 'Receipt No.': 'CBL-77120', 'Bill No.': 'BN-2026-001' },
    { 'Record ID': 'PAY-002', 'Company ID': 'CMU-002', 'Company Name': name('CMU-002'), 'Purpose / Services': 'Annual Chemical Registration License', 'Amount (USD)': 1000, 'Payment Date': iso(-50), 'Receipt No.': 'CBL-77391', 'Bill No.': 'BN-2026-003' },
  ];
  const issues = [{ 'Issue #': 1, 'Register': 'Companies', 'Record': 'CMU-002', 'Issue Found': 'Company name spelled two ways on old receipts', 'Action Taken': 'Other name recorded', 'Follow-up Status': 'Open' }];
  const inspections = [{ 'Inspection ID': 'INS-001', 'Inspection Date': iso(-12), 'Company ID': 'CMU-001', 'Company': name('CMU-001'), 'Site / Facility': 'Cyanide magazine', 'Inspection Type': 'Mine site', 'Compliance': 'Minor issues', 'Findings': 'Spill kit incomplete.', 'Latitude': 7.0457, 'Longitude': -11.0678 }];

  // ---- the alerts the server would compute
  const days = d => Math.round((new Date(d + 'T00:00:00') - new Date(iso(0) + 'T00:00:00')) / 864e5);
  const alerts = licences.map(l => ({ id: l['Record ID'], coId: l['Company ID'], co: l['Company Name'], type: l['Licence / Certificate Type'], no: l['Licence / Certificate No.'], expiry: l['Expiry Date'], days: days(l['Expiry Date']) }))
    .filter(a => a.days <= 60 && a.days >= -30).sort((a, b) => a.days - b.days);
  const billSum = bills.map(b => {
    const paid = payments.filter(p => p['Bill No.'] === b['Bill No.']).reduce((a, p) => a + p['Amount (USD)'], 0), out = Math.max(0, b['Amount Billed (USD)'] - paid);
    return { no: b['Bill No.'], coId: b['Company ID'], co: b['Company Name'], type: b['Bill Type'], ref: b['Bill Ref. No.'], date: b['Bill Date'], billed: b['Amount Billed (USD)'], paid, out,
      age: -days(b['Bill Date']), isPaid: out <= 0.005, status: out <= 0.005 ? 'Paid' : paid ? 'Part-paid' : 'Unpaid', purpose: b['Purpose / Licence Billed'] };
  });
  const quotas = [
    { lic: 'LIC-001', licNo: 'CIL-2026-014', coId: 'CMU-001', co: name('CMU-001'), chem: 'Sodium cyanide', limit: 60000, perMonth: false, used: 48000, pct: 0.8, status: 'Near limit (80%+)', active: true },
    { lic: 'LIC-001', licNo: 'CIL-2026-014', coId: 'CMU-001', co: name('CMU-001'), chem: 'Hydrated lime', limit: 200000, perMonth: false, used: 40000, pct: 0.2, status: 'OK', active: true },
    { lic: 'LIC-004', licNo: 'CIL-2026-022', coId: 'CMU-003', co: name('CMU-003'), chem: 'Glyphosate 41% SL', limit: 8000, perMonth: false, used: 2400, pct: 0.3, status: 'OK', active: true },
  ];
  return {
    tables: { companies, licences, licenceChemicals, clearances, bills, payments, issues, inspections },
    insights: { alerts, bills: billSum, quotas },
    lists: {
      chemicals: ['Sodium cyanide', 'Hydrated lime', 'Glyphosate', 'Aluminium sulphate', 'Calcium hypochlorite', 'Hydrochloric acid', 'Caustic soda', 'Other / Unspecified'],
      units: ['kg', 'MT', 'L', 'pcs'], sectors: ['Mining', 'Petroleum', 'Agriculture', 'Water treatment', 'Manufacturing', 'Health', 'Construction'],
      purposes: ['Chemical Clearance', 'Annual Chemical Registration License', 'Chemical Importation License'],
      registers: ['Companies', 'Licences & Certificates', 'Chemical Clearances', 'Bills & Invoices', 'Payments & Receipts', 'Mobile Inspections'], issueStatus: ['Open', 'Verified', 'Closed'],
    },
    hazards: {
      rows: [
        { name: 'Sodium cyanide', hmis: 3, cat: 'Sodium Cyanide', notes: 'Toxic – keep dry, away from acids' },
        { name: 'Hydrated lime', hmis: 2, cat: 'Industrial Chemicals Class B', notes: 'Irritant' },
        { name: 'Glyphosate', hmis: 2, cat: 'Agrochemicals', notes: '' },
        { name: 'Aluminium sulphate', hmis: 1, cat: 'Industrial Chemicals Class B', notes: '' },
        { name: 'Calcium hypochlorite', hmis: 3, cat: 'Industrial Chemicals Class A', notes: 'Oxidiser' },
        { name: 'Hydrochloric acid', hmis: 3, cat: 'Industrial Chemicals Class A', notes: 'Corrosive' },
      ],
      cats: [['Petrochemicals', 'kg', 0.05], ['Agrochemicals', 'kg', 0.15], ['Explosives', 'MT', 1.875], ['Laboratory Chemicals', 'kg', 0.05],
        ['Industrial Chemicals Class A', 'kg', 0.5], ['Industrial Chemicals Class B', 'kg', 0.4], ['Sodium Cyanide', 'MT', 6.5]],
      hi: [[0, 1], [1, 1.5], [2, 2], [3, 2.5], [4, 3]],
    },
  };
}
