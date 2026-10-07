/**
 * EPA LIBERIA – ERRS | CMU DATABASE 2026 — MOBILE APP API   (file: MobileAPI.gs)
 *
 * Add this as a SECOND file in the CMU Database Apps Script project (Extensions ▸ Apps Script ▸ ＋ ▸ Script ▸ name it MobileAPI).
 * Do NOT change Code.gs. This file re-uses its table engine (T_, NextID_, CompanyID_), checks (DUP_Similar_, QUO_Data_,
 * api_billStatus), QR verification (QR_Token_, QR_Lookup_) and the Activity Log, so records made on a phone are exactly
 * like records made on the forms.
 *
 * ONE-TIME SET-UP
 *  1. Save, choose the function  MOB_Setup  in the toolbar ▸ Run (allow the permissions).
 *     It creates the admin sheets "Mobile Users", "Mobile Uploads" and "Mobile Inspections".
 *  2. On "Mobile Users": for each officer type a PIN (4–8 digits), set Active = TRUE, check the Role (admin / staff / viewer).
 *  3. Deploy ▸ New deployment ▸ Web app ▸ Execute as: Me ▸ Who has access: Anyone ▸ Deploy.
 *     (If the database already has a web app deployment for the QR check page, use Deploy ▸ Manage deployments ▸ Edit ▸
 *      Version: New version instead — the same /exec link then serves both the QR page and the phones.)
 *  4. Give officers the /exec link. They sign in on the phone with their Google email + PIN.
 *  Optional: in Code.gs ▸ onOpen, after the Claude line, add   try { MOB_addMenu_(ui); } catch (err) { }
 *
 * The phone never edits or deletes existing records: it reads the registers and ADDS companies, clearances, payments,
 * data issues and field inspections. Updates and deletions stay on the desktop forms.
 */

/** true = the phones connect with the /exec link only (no email / PIN). Anyone who has the link can read the registers and
 *  add records, so keep the link inside the CMU. Set to false to require the "Mobile Users" email + PIN sign-in. */
var MOB_NO_LOGIN = true;

var MOB = { USERS: 'Mobile Users', UPLOADS: 'Mobile Uploads', INSP: 'Mobile Inspections', PHOTOS: 'CMU Inspection Photos', VERSION: '2026.10-1' };
var MOB_USER_HDR = ['Email', 'Name', 'Role', 'PIN', 'Active', 'Token', 'Last Sync', 'Device'];
var MOB_UP_HDR = ['Client ID', 'Type', 'Result', 'When', 'User'];
var MOB_INSP_HDR = ['Inspection ID', 'Inspection Date', 'Company ID', 'Company', 'Site / Facility', 'Inspection Type', 'Linked Record',
  'Compliance', 'Findings', 'Actions Required', 'Follow-up Date', 'Latitude', 'Longitude', 'GPS Accuracy (m)', 'Photos', 'Inspector', 'Recorded'];
try { [MOB.USERS, MOB.UPLOADS].forEach(function (n) { if (LOCK_ADMIN_HIDDEN.indexOf(n) < 0) LOCK_ADMIN_HIDDEN.push(n); }); } catch (e) { }
try { if (LOCK_STAFF.indexOf(MOB.INSP) < 0) LOCK_STAFF.push(MOB.INSP); } catch (e) { }   // staff may correct field inspections on the desktop

/* ================================================================ set-up and menu */
function MOB_addMenu_(ui) {
  ui.createMenu('📱 Mobile app')
    .addItem('Set up / repair', 'MOB_Setup')
    .addItem('Officers & PINs (open sheet)', 'MOB_OpenUsers')
    .addItem('Field inspections (open sheet)', 'MOB_OpenInspections')
    .addItem('Sign out all phones', 'MOB_ResetTokens')
    .addToUi();
}
function MOB_Setup() {
  var ss = ss_();
  PropertiesService.getScriptProperties().setProperty('CMU_SSID', ss.getId());
  var u = MOB_sheet_(MOB.USERS, MOB_USER_HDR);
  if (u.getLastRow() === 1) {
    var roles = {}; try { roles = ROLE_Map_(); } catch (e) { }
    var rows = Object.keys(roles).map(function (e) { return [e, '', roles[e], '', 'FALSE', '', '', '']; });
    if (rows.length) u.getRange(2, 1, rows.length, MOB_USER_HDR.length).setValues(rows);
  }
  u.getRange('D:D').setNumberFormat('@');
  u.getRange('E2:E').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['TRUE', 'FALSE'], true).build());
  u.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['admin', 'staff', 'viewer'], true).build());
  [230, 170, 80, 70, 70, 260, 140, 150].forEach(function (w, i) { u.setColumnWidth(i + 1, w); });
  MOB_sheet_(MOB.UPLOADS, MOB_UP_HDR);
  var ins = MOB_sheet_(MOB.INSP, MOB_INSP_HDR);
  ins.getRange('B2:B').setNumberFormat('dd-MMM-yyyy'); ins.getRange('K2:K').setNumberFormat('dd-MMM-yyyy');
  try { ins.setTabColor('#2F75B5'); } catch (e) { }
  [MOB.USERS, MOB.UPLOADS].forEach(function (n) { try { ss.getSheetByName(n).setTabColor('#C00000').hideSheet(); } catch (e) { } });
  try { if (LOCK_On_()) LOCK_Apply_(); } catch (e) { }
  var msg = 'Mobile app set up.\n\n1. Open the hidden sheet "Mobile Users": type a PIN for each officer, set Active = TRUE, check the Role.\n' +
    '2. Deploy ▸ New deployment ▸ Web app (Execute as: Me, Who has access: Anyone) and give the /exec link to the officers.';
  try { SpreadsheetApp.getUi().alert('CMU Mobile', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { Logger.log(msg); }
}
function MOB_sheet_(name, hdr) {
  var ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold').setBackground('#1F4E78').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}
function MOB_OpenUsers() { var s = MOB_sheet_(MOB.USERS, MOB_USER_HDR); s.showSheet(); s.activate(); }
function MOB_OpenInspections() { var s = MOB_sheet_(MOB.INSP, MOB_INSP_HDR); s.showSheet(); s.activate(); }
function MOB_ResetTokens() {
  var s = MOB_sheet_(MOB.USERS, MOB_USER_HDR);
  if (s.getLastRow() > 1) s.getRange(2, 6, s.getLastRow() - 1, 1).clearContent();
  try { SpreadsheetApp.getActive().toast('All phones are signed out.', 'CMU Mobile', 5); } catch (e) { }
}

/* ================================================================ web API (POST, JSON) */
function doPost(e) {
  var out;
  try {
    var b = JSON.parse(e.postData.contents || '{}');
    if (b.action === 'login') out = MOB_NO_LOGIN && !b.email ? { ok: true, token: '', user: MOB_openUser_(b.who), open: true } : MOB_login_(b);
    else {
      var u = MOB_auth_(b.token) || (MOB_NO_LOGIN ? MOB_openUser_(b.who) : null);
      if (!u) out = { ok: false, code: 'auth', error: 'Signed out – please sign in again.' };
      else if (b.action === 'pull') out = MOB_pull_(u);
      else if (b.action === 'push') out = MOB_push_(u, b.items || []);
      else if (b.action === 'check') { var c = MOB_check_(b.item || {}); out = c.error ? { ok: false, error: c.error } : { ok: true, warnings: c.warnings || [] }; }
      else if (b.action === 'photo') out = MOB_photo_(u, b.photo || {});
      else if (b.action === 'verify') out = MOB_verify_(u, String(b.code || ''));
      else out = { ok: false, error: 'Unknown action' };
    }
  } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------------------------------------------- users */
function MOB_users_() {
  var sh = MOB_sheet_(MOB.USERS, MOB_USER_HDR), n = sh.getLastRow() - 1;
  return { sh: sh, rows: n > 0 ? sh.getRange(2, 1, n, MOB_USER_HDR.length).getValues() : [] };
}
function MOB_role_(r, email) {
  r = String(r || '').toLowerCase();
  if (['admin', 'staff', 'viewer'].indexOf(r) >= 0) return r;
  try { var m = ROLE_Map_()[email]; if (m === 'admin' || m === 'staff' || m === 'viewer') return m; } catch (e) { }
  return 'staff';
}
function MOB_login_(b) {
  var email = String(b.email || '').trim().toLowerCase(), pin = String(b.pin || '').trim(), cache = CacheService.getScriptCache(), ck = 'mobfail_' + email;
  var fails = Number(cache.get(ck) || 0);
  if (fails >= 5) return { ok: false, error: 'Too many wrong PINs. Try again in 15 minutes.' };
  var U = MOB_users_();
  for (var i = 0; i < U.rows.length; i++) {
    var r = U.rows[i];
    if (String(r[0]).trim().toLowerCase() !== email) continue;
    if (!pin || String(r[3]).trim() !== pin) break;
    if (String(r[4]).toUpperCase() !== 'TRUE') return { ok: false, error: 'This account is not active. Ask a CMU admin.' };
    var token = String(r[5] || '');
    if (!token) { token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().slice(0, 8); U.sh.getRange(i + 2, 6).setValue(token); }
    U.sh.getRange(i + 2, 7, 1, 2).setValues([[nowText_(), String(b.device || '').slice(0, 60)]]);
    cache.remove(ck);
    var user = { email: email, name: String(r[1] || email), role: MOB_role_(r[2], email) };
    MOB_log_(user, 'Mobile sign-in', 'Mobile Users', email, String(b.device || ''));
    return { ok: true, token: token, user: user, version: MOB.VERSION };
  }
  cache.put(ck, String(fails + 1), 900);
  return { ok: false, error: 'Wrong email or PIN.' };
}
function MOB_auth_(token) {
  if (!token) return null;
  var U = MOB_users_();
  for (var i = 0; i < U.rows.length; i++) {
    var r = U.rows[i];
    if (String(r[5]) === String(token) && String(r[4]).toUpperCase() === 'TRUE') {
      var email = String(r[0]).trim().toLowerCase();
      return { email: email, name: String(r[1] || email), role: MOB_role_(r[2], email), row: i + 2, sh: U.sh };
    }
  }
  return null;
}
function MOB_openUser_(who) {
  var n = String(who || '').trim().slice(0, 60);
  return { email: n ? n : 'mobile-app', name: n || 'Mobile app', role: 'staff', row: 0, sh: null };
}
function MOB_log_(u, action, register, id, details) {
  try { EXT_LogSheet_().appendRow([new Date(), u.email + ' (mobile)', action, register || '', String(id || ''), details || '']); } catch (e) { }
}

/* ---------------------------------------------------------------- read everything the phone shows */
function MOB_ser_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : v;
}
function MOB_table_(name) {
  var t = T_(name), cols = t.cols, out = [];
  t.values().forEach(function (r) {
    if (trim_(r[0]) === '') return;
    var o = {}; cols.forEach(function (c, j) { o[c] = MOB_ser_(r[j]); }); out.push(o);
  });
  return out;
}
function MOB_listCol_(tbl, col) { try { return T_(tbl).column(col).map(str_).filter(function (x) { return x !== ''; }); } catch (e) { return []; } }
function MOB_pull_(u) {
  var D = INS_Data_(60, 30), Q = null, iso = function (d) { return d ? Utilities.formatDate(d, tz_(), 'yyyy-MM-dd') : ''; };
  try { Q = QUO_Data_(); } catch (e) { }
  var hz = [];
  try {
    var hs = sh_(EXT.HAZ);
    if (hs) hz = hs.getRange(HAZ_FIRST, 1, HAZ_LAST - HAZ_FIRST + 1, 8).getValues().filter(function (r) { return trim_(r[0]) !== ''; })
      .map(function (r) { return { name: str_(r[0]), cas: str_(r[1]), h: r[2], f: r[3], p: r[4], hmis: r[5], cat: str_(r[6]), notes: str_(r[7]) }; });
  } catch (e) { }
  var ins = [];
  var is = sh_(MOB.INSP);
  if (is && is.getLastRow() > 1) is.getRange(2, 1, is.getLastRow() - 1, MOB_INSP_HDR.length).getValues().forEach(function (r) {
    if (!trim_(r[0])) return; var o = {}; MOB_INSP_HDR.forEach(function (c, j) { o[c] = MOB_ser_(r[j]); }); ins.push(o);
  });
  if (u.sh && u.row) u.sh.getRange(u.row, 7).setValue(nowText_());
  return {
    ok: true, serverTime: new Date().toISOString(), user: { email: u.email, name: u.name, role: u.role },
    tables: {
      companies: MOB_table_('tblCompanies'), licences: MOB_table_('tblLicences'), licenceChemicals: MOB_table_('tblLicenceChemicals'),
      clearances: MOB_table_('tblClearances'), bills: MOB_table_('tblBills'), payments: MOB_table_('tblPayments'),
      issues: MOB_table_('tblIssues'), inspections: ins
    },
    insights: {
      alerts: D.alerts.map(function (x) { return { id: x.id, coId: x.coId, co: x.co, type: x.type || x.cat, no: x.no, expiry: iso(x.expiry), days: x.days }; }),
      bills: D.bills.map(function (b) { return { no: b.no, coId: b.coId, co: b.co, type: b.type, ref: b.ref, date: iso(b.date), billed: b.billed, paid: b.paid, out: b.out, age: b.age, isPaid: b.isPaid, status: b.status, purpose: b.purpose.join(', ') }; }),
      quotas: Q ? Q.rows.map(function (x) { return { lic: x.lic.id, licNo: x.lic.no, coId: x.lic.coId, co: x.lic.co, chem: x.ch.name, limit: x.ch.limit, perMonth: x.ch.perMonth, used: Math.round(x.basis * 100) / 100, pct: x.pct, status: x.status, active: x.active }; }) : []
    },
    lists: {
      chemicals: MOB_listCol_('tChemical', 'Chemical (Standard)'), units: MOB_listCol_('tUnit', 'Unit'), sectors: MOB_listCol_('tSector', 'Sector / Activity'),
      purposes: MOB_listCol_('tPurpose', 'Service / Purpose'), registers: ['Companies', 'Licences & Certificates', 'Chemical Clearances', 'Bills & Invoices', 'Payments & Receipts', 'Mobile Inspections'],
      issueStatus: ['Open', 'Verified', 'Closed']
    },
    hazards: { rows: hz, cats: HAZ_CATS, hi: HAZ_HI }
  };
}

/* ---------------------------------------------------------------- add records (queued on the phone, idempotent by client ID) */
function MOB_push_(u, items) {
  if (u.role === 'viewer') return { ok: false, error: 'Your account is view-only.' };
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var up = MOB_sheet_(MOB.UPLOADS, MOB_UP_HDR), done = {};
    if (up.getLastRow() > 1) up.getRange(2, 1, up.getLastRow() - 1, 3).getValues().forEach(function (r) { done[String(r[0])] = String(r[2]); });
    var results = [];
    items.forEach(function (it) {
      var cid = String(it.cid || '');
      if (!cid) return;
      if (done[cid]) { results.push({ cid: cid, status: 'ok', id: done[cid], repeat: true }); return; }
      var r;
      try {
        var chk = MOB_check_(it);
        if (chk.error) r = { status: 'error', error: chk.error };
        else if (chk.block && !it.force) r = { status: 'confirm', warnings: chk.warnings };
        else {
          var id = MOB_save_(u, it);
          r = { status: 'ok', id: id, warnings: chk.warnings };
          up.appendRow([cid, it.type, id, new Date(), u.email]); done[cid] = id;
        }
      } catch (err) { r = { status: 'error', error: String(err && err.message || err) }; }
      r.cid = cid; results.push(r);
    });
    SpreadsheetApp.flush();
    return { ok: true, results: results };
  } finally { lock.releaseLock(); }
}
function MOB_d_(v) { var d = ext_toDate_(v); return d ? dateCell_(d) : ''; }
function MOB_src_(u) { return 'Mobile app ' + nowText_() + ' (' + u.email + ')'; }

/** warnings for an item; block = the officer must confirm before it is saved (same questions as the desktop forms ask) */
function MOB_check_(it) {
  var d = it.data || {}, w = [], block = false;
  if (it.type === 'company') {
    var nm = trim_(d.name);
    if (!nm) return { error: 'Company name is required.' };
    if (T_('tblCompanies').match('Company Name', nm)) return { error: '"' + nm + '" is already registered.' };
    DUP_Similar_(nm, 3).forEach(function (s) { w.push('Similar company already registered: ' + s.id + ' ' + s.name + ' (' + Math.round(s.score * 100) + '% similar)'); block = true; });
  } else if (it.type === 'clearance') {
    var co = trim_(d.company), coId = CompanyID_(co);
    if (!coId) return { error: 'Company "' + co + '" is not registered. Register it first.' };
    var date = ext_toDate_(d.date);
    if (!date) return { error: 'Clearance date is missing or not valid.' };
    var lines = (d.lines || []).filter(function (l) { return trim_(l.rec) || trim_(l.std); });
    if (!lines.length) return { error: 'Add at least one chemical line.' };
    if (lines.length > 20) return { error: 'A clearance can have at most 20 chemical lines.' };
    try {
      var extra = lines.map(function (l, i) { return { id: 'NEW-' + i, no: 'this clearance', coId: coId, co: co, rec: str_(l.rec || l.std), std: str_(l.std), kg: quoKg_(l.qty, l.unit) || 0, date: date }; })
        .filter(function (x) { return x.kg; });
      if (extra.length) {
        var Q = QUO_Data_(extra);
        Q.rows.forEach(function (x) {
          if (!x.ch.lines.some(function (l) { return l.isNew; }) || x.ch.limit === null || x.pct <= 1.0000001) return;
          w.push('Over quota: ' + x.ch.name + ' – ' + fmtMoney_(x.basis) + ' kg of ' + fmtMoney_(x.ch.limit) + ' kg' + (x.ch.perMonth ? ' per month' : '') + ' (' + Math.round(x.pct * 100) + '%) on ' + x.lic.id + ' ' + x.lic.no); block = true;
        });
        Q.notOn.forEach(function (x) { if (x.line.isNew) { w.push('Not on licence ' + x.lic.id + ' ' + x.lic.no + ': ' + (x.line.rec || x.line.std)); block = true; } });
        if (Q.noLic.some(function (x) { return x.isNew; }) && Q.lics.some(function (l) { return l.coId === coId; })) { w.push(co + ' has no Chemical Importation Licence valid on ' + ext_fmtD_(date)); block = true; }
      }
    } catch (e) { }
  } else if (it.type === 'payment') {
    var st = api_billStatus(String(d.bill || ''));
    if (!st.co) return { error: 'Bill No. "' + d.bill + '" was not found.' };
    if (!(num_(d.amount) > 0)) return { error: 'The amount must be above 0.' };
    if (!ext_toDate_(d.date)) return { error: 'Payment date is missing or not valid.' };
    if (num_(d.amount) > st.bal + 0.005) { w.push('Amount US$' + fmtMoney_(num_(d.amount)) + ' is more than the outstanding balance US$' + fmtMoney_(st.bal) + ' on ' + st.bn + '.'); block = true; }
    if (trim_(d.receipt) && T_('tblPayments').countIf('Receipt No.', d.receipt) > 0) { w.push('Receipt No. ' + trim_(d.receipt) + ' is already recorded.'); block = true; }
  } else if (it.type === 'inspection') {
    if (!trim_(d.site)) return { error: 'Site / facility is required.' };
    if (!ext_toDate_(d.date)) return { error: 'Inspection date is missing or not valid.' };
    if (trim_(d.company) && !CompanyID_(d.company)) w.push('Company "' + d.company + '" is not registered – saved with the name only.');
  } else if (it.type === 'issue') {
    if (!trim_(d.issue)) return { error: 'Describe the issue found.' };
  } else return { error: 'Unknown record type ' + it.type };
  return { warnings: w, block: block };
}

function MOB_save_(u, it) {
  var d = it.data || {};
  if (it.type === 'company') {
    var t = T_('tblCompanies'), id = NextID_(t, 'Company ID', 'CMU-'), idx = t.addRow();
    t.setRow(idx, { 'Company ID': id, 'Company Name': trim_(d.name), 'Sector / Activity': d.sector || '', 'Location': d.location || '', 'Other Names Recorded': d.other || '' });
    if (idx > 1) t._fillCalculated(idx);
    MOB_log_(u, 'Saved new', t.sheet.getName(), id, trim_(d.name));
    return id;
  }
  if (it.type === 'clearance') {
    var tc = T_('tblClearances'), cln = NextID_(tc, 'Clearance No.', 'CLN-'), co = trim_(d.company), coId = CompanyID_(co), n = 0, first = '', last = '';
    (d.lines || []).forEach(function (l) {
      var rec = trim_(l.rec) || trim_(l.std); if (!rec) return;
      tc.refresh();
      var rid = NextID_(tc, 'Record ID', 'CLR-'), i = tc.addRow();
      tc.setRow(i, { 'Record ID': rid, 'Clearance No.': cln, 'Company ID': coId, 'Chemical as Recorded': rec, 'Chemical (Standard)': l.std || '',
        'Qty as Recorded': isNum_(l.qty) ? num_(l.qty) : (l.qty || ''), 'Unit': l.unit || '', 'B/L / Invoice / AWB No.': trim_(l.bl) || d.bl || '',
        'Clearance Ref. No.': d.ref || '', 'Clearance Date': MOB_d_(d.date), 'Remarks': d.remarks || '', 'ETA': MOB_d_(d.eta), 'Source': MOB_src_(u) });
      if (i > 1) tc._fillCalculated(i);
      if (!first) first = rid; last = rid; n++;
    });
    MOB_log_(u, 'Saved new', 'Chemical Clearances', cln, co + ' – ' + n + ' chemical line(s) (' + first + ' to ' + last + ')');
    return cln;
  }
  if (it.type === 'payment') {
    var st = api_billStatus(String(d.bill || '')), tp = T_('tblPayments'), pid = NextID_(tp, 'Record ID', 'PAY-'), pi = tp.addRow();
    tp.setRow(pi, { 'Record ID': pid, 'Company ID': CompanyID_(st.co), 'Name as Recorded': st.co, 'Purpose / Services': d.purpose || st.purpose,
      'Amount (USD)': num_(d.amount), 'Payment Date': MOB_d_(d.date), 'Receipt No.': d.receipt || '', 'Remarks': d.remarks || '', 'Bill No.': st.bn,
      'Record Group': 'Form entry', 'Source': MOB_src_(u) });
    if (pi > 1) tp._fillCalculated(pi);
    MOB_log_(u, 'Saved new', 'Payments & Receipts', pid, st.co + ' – US$' + fmtMoney_(num_(d.amount)) + ' – ' + st.bn);
    return pid;
  }
  if (it.type === 'issue') {
    var ti = T_('tblIssues'), ids = ti.column('Issue #').map(str_).filter(String), lastId = ids[ids.length - 1] || '', m = lastId.match(/^(.*?)(\d+)$/), iid;
    if (m) { var mx = 0; ids.forEach(function (x) { var k = x.match(/(\d+)$/); if (k && x.indexOf(m[1]) === 0) mx = Math.max(mx, +k[1]); }); var p = String(mx + 1); while (p.length < m[2].length) p = '0' + p; iid = m[1] + p; }
    else iid = String(ids.length + 1);
    var ii = ti.addRow();
    ti.setRow(ii, { 'Issue #': isNaN(Number(iid)) ? iid : Number(iid), 'Register': d.register || '', 'Record': d.record || '', 'Source': MOB_src_(u),
      'Issue Found': d.issue || '', 'Action Taken': d.action || '', 'Follow-up Status': d.status || 'Open' });
    if (ii > 1) ti._fillCalculated(ii);
    MOB_log_(u, 'Saved new', 'Notes & Issues', iid, String(d.issue || '').slice(0, 120));
    return String(iid);
  }
  if (it.type === 'inspection') {
    var sh = MOB_sheet_(MOB.INSP, MOB_INSP_HDR), mxi = 0;
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { var k = String(r[0]).match(/^INS-(\d+)/); if (k) mxi = Math.max(mxi, +k[1]); });
    var insId = 'INS-' + fmt000_(mxi + 1), cname = trim_(d.company), cId = cname ? CompanyID_(cname) : '';
    sh.appendRow([insId, MOB_d_(d.date), cId, cname, d.site || '', d.type || '', d.linked || '', d.compliance || '', d.findings || '', d.actions || '',
      MOB_d_(d.followUp), d.lat === undefined ? '' : d.lat, d.lng === undefined ? '' : d.lng, d.acc === undefined ? '' : d.acc, '', u.name + ' (' + u.email + ')', nowText_()]);
    MOB_log_(u, 'Field inspection', MOB.INSP, insId, (cname || '') + ' – ' + (d.site || '') + ' – ' + (d.compliance || ''));
    return insId;
  }
  throw new Error('Unknown record type');
}

/* ---------------------------------------------------------------- inspection photos → Google Drive */
function MOB_photo_(u, p) {
  if (u.role === 'viewer') return { ok: false, error: 'View-only account.' };
  var up = MOB_sheet_(MOB.UPLOADS, MOB_UP_HDR), map = {};
  if (up.getLastRow() > 1) up.getRange(2, 1, up.getLastRow() - 1, 3).getValues().forEach(function (r) { map[String(r[0])] = String(r[2]); });
  if (map[p.id]) return { ok: true, url: map[p.id] };
  var insId = map[p.inspectionCid];
  if (!insId) return { ok: false, error: 'Inspection not uploaded yet.' };
  var me = DriveApp.getFileById(ss_().getId()), ps = me.getParents(), parent = ps.hasNext() ? ps.next() : DriveApp.getRootFolder();
  var it = parent.getFoldersByName(MOB.PHOTOS), folder = it.hasNext() ? it.next() : parent.createFolder(MOB.PHOTOS);
  var file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(p.base64), 'image/jpeg', insId + '_' + String(p.id).slice(0, 8) + '.jpg'));
  var url = file.getUrl(), sh = MOB_sheet_(MOB.INSP, MOB_INSP_HDR), ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === insId) {
    var c = sh.getRange(i + 2, 15), cur = str_(c.getValue()); c.setValue(cur ? cur + '\n' + url : url); break;
  }
  up.appendRow([p.id, 'photo', url, new Date(), u.email]);
  return { ok: true, url: url };
}

/* ---------------------------------------------------------------- QR check of a printed licence / clearance / bill */
function MOB_verify_(u, code) {
  var kind = '', id = '', tok = '', m;
  code = String(code || '').trim();
  if ((m = code.match(/[?&]id=([^&]+)/)) && /[?&]t=/.test(code)) {
    id = decodeURIComponent(m[1]).toUpperCase(); tok = (code.match(/[?&]t=([0-9A-Fa-f]+)/) || [])[1] || '';
    kind = (code.match(/[?&]v=(\w+)/) || [])[1] || '';
  } else if ((m = code.toUpperCase().replace(/\s+/g, ' ').match(/CODE\s+(\S+)-([0-9A-F]{10})\b/)) || (m = code.toUpperCase().replace(/\s+/g, '').match(/^(.+)-([0-9A-F]{10})$/))) {
    id = m[1]; tok = m[2];
  }
  tok = String(tok).toUpperCase();
  if (!id || !tok) return { ok: true, genuine: false, message: 'This is not a CMU document code.' };
  if (!kind) kind = /^CLN/.test(id) ? 'clearance' : /^BN-/.test(id) ? 'bill' : 'licence';
  var info = null, good = false;
  try { good = QR_Token_(kind, id) === tok; if (good) info = QR_Lookup_(kind, id); } catch (e) { good = false; }
  MOB_log_(u, 'Document checked (mobile)', kind, id, good && info ? 'GENUINE – ' + info.status : 'NOT RECOGNISED');
  if (!good || !info) return { ok: true, genuine: false, id: id, kind: kind, message: 'NOT RECOGNISED – this code was not issued by the CMU Database. Treat the document as suspicious.' };
  return { ok: true, genuine: true, id: id, kind: kind, status: info.status, valid: info.ok, lines: info.lines };
}
