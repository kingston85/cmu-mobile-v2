# CMU Database – Android app (v1.1)

The phone app for the **CMU DATABASE 2026** Google Sheet (EPA Liberia · ERRS · Chemical Management Unit).
It works with your real registers, through a small extra file added to the database's Apps Script project.

## What officers can do on the phone

| Works offline | Needs a signal |
| --- | --- |
| Browse and search Companies, Licences & Certificates, Chemical Clearances, Bills, Payments, Notes & Issues, Field Inspections | **Check a document**: scan the QR code on a printed CRL / CIL / EDL licence, clearance letter or bill. The app says if it is genuine and still valid. |
| Company profile: licences with expiry, quotas, bills and what is owed, payments, clearances | Upload what was recorded on the phone, and download the latest registers (automatic when the signal returns) |
| Home screen: licences expiring or expired, bills unpaid for more than 30 days, import quotas | |
| **Record** a new company, a chemical clearance (up to 20 chemicals), a payment against a bill, a field inspection (GPS + photos), or a data issue | |
| Fee estimate with the official rule Qp = R × Hi × Qi, from your Chemical Hazards sheet | |

The phone **adds** records. It does not edit or delete existing records: that stays on the desktop forms.
The same checks as the desktop forms run before anything is saved: duplicate companies, licence import quotas,
payment above the balance, receipt number already used, company not registered. When a check finds something, the
officer sees it and decides whether to save anyway. IDs (CMU-, CLN-/CLR-, PAY-) come from the database itself, so
nothing ever clashes. Every phone record is on the **Activity Log** as "<email> (mobile)", with "Mobile app …" in the Source column.

## Step 1 – Add MobileAPI.gs to the CMU Database (10 minutes)

1. Open the CMU DATABASE Google Sheet ▸ **Extensions ▸ Apps Script**.
2. Click **＋** next to *Files* ▸ **Script**, name it `MobileAPI`, and paste in everything from `apps-script/MobileAPI.gs`. **Save.**
   Do not change Code.gs.
3. In the toolbar choose the function **MOB_Setup** ▸ **Run** and allow the permissions.
   This creates three sheets: *Mobile Users* (hidden), *Mobile Uploads* (hidden) and *Mobile Inspections*.
4. Open the hidden sheet **Mobile Users** (right-click the sheet tabs ▸ show, or from the 📱 menu below). For each officer:
   * **Email**: the address they will type on the phone
   * **Name**: shown in the Activity Log
   * **Role**: `staff` (can add records), `viewer` (read only), or `admin`
   * **PIN**: 4–8 digits, which you give them
   * **Active**: `TRUE`
   To block a lost phone, set Active = FALSE. To sign out every phone, clear the Token column.
5. **Deploy the web app**
   * If you have **not** set up the online QR check before: **Deploy ▸ New deployment ▸ ⚙ Web app**, with
     *Execute as:* **Me (the database owner)** and *Who has access:* **Anyone** ▸ **Deploy** ▸ copy the URL ending in `/exec`.
     You can also paste that same URL into *CMU Database ▸ ✨ Insights & Tools ▸ QR: set the online check link*, so printed QR codes open the check page.
   * If you **have** (QR: set the online check link): **Deploy ▸ Manage deployments ▸ ✏️ Edit ▸ Version: New version ▸ Deploy**.
     The URL stays the same, and it now serves both the QR check page and the phones.
6. Optional, for a menu: in Code.gs ▸ `onOpen`, after the line with `CLAUDE_addMenu_`, add
   `try { MOB_addMenu_(ui); } catch (err) { }`. This adds a **📱 Mobile app** menu.

Whenever you change MobileAPI.gs later: **Deploy ▸ Manage deployments ▸ Edit ▸ New version** (never a new deployment, because that changes the URL).

## Step 2 – Build the APK on GitHub

Replace the files in your `cmu-mobile` GitHub repository with the ones in this zip (Add file ▸ Upload files ▸ select
everything inside the unzipped folder ▸ Commit). The **Build Android APK** action runs again. Download
**CMU-Database-APK** from the finished run. It installs over the earlier test version.

## Step 3 – On each phone

Install the APK ▸ open **CMU Database** ▸ paste the `/exec` link, then sign in with your email and PIN ▸ allow Camera
(QR scanning, photos) and Location (inspections). The first sync downloads the registers. After that the app works offline.

## Where phone records go

| Recorded on the phone | Lands in |
| --- | --- |
| Register company | Companies (CMU-###), with the duplicate check |
| New clearance | Chemical Clearances: one Clearance No. (CLN-###), one CLR-### per chemical, with the quota check |
| Record payment | Payments & Receipts (PAY-###), linked to the Bill No. |
| Report data issue | Notes & Issues |
| Field inspection | Mobile Inspections (INS-###). Photos go to the Drive folder *CMU Inspection Photos* next to the spreadsheet |

## Release key

Test APKs use a test key, which is fine for the pilot. For the final rollout, make a private key once and keep it safe:

1. Install Java 21 and run `keytool -genkeypair -v -keystore cmu-release.jks -alias cmu -keyalg RSA -keysize 2048 -validity 10000`.
2. Convert it to text. On Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cmu-release.jks")) > key.txt`.
3. In GitHub ▸ Settings ▸ Secrets and variables ▸ Actions, add four secrets: `CMU_KEYSTORE_BASE64` (the text in key.txt), `CMU_KEYSTORE_PASSWORD`, `CMU_KEY_ALIAS` (`cmu`) and `CMU_KEY_PASSWORD`.
4. Re-run the build to get the release APK and an `.aab` for Google Play.

Staff then uninstall the test version once. Back up the key: if it is lost, phones cannot be updated.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "The server did not answer correctly" | Link must end in `/exec`, web app access must be **Anyone**, and MobileAPI.gs must be saved in the same project and deployed as a *new version*. |
| "Wrong email or PIN" | Check the Mobile Users sheet (email exactly as typed, PIN, Active = TRUE). Five wrong PINs lock that email for 15 minutes. |
| "Signed out – please sign in again" | The Token was cleared, or the account was set to Active = FALSE. |
| A record shows **Needs your OK** on the Sync screen | A check found something (similar company, over quota, amount above the balance). Read it, then tap Save anyway or Delete. |
| A record shows **Error** | E.g. the company is not registered yet. Register it first, then tap Try again. |
| Writes fail with permission errors | Deploy the web app *as the database owner* (an admin), so it can write to the locked registers. |
