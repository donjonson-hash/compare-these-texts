# Document Scanner 0.1.0

Independent Chrome extension pilot. Its package has its own identity, interface
and encrypted local draft; it does not contain the Compare Two Texts interface,
store key, analytics, remote AI or document upload endpoints.

## Build and install

From this branch's repository root:

```sh
npm ci --ignore-scripts
python3 standalone-scanner/build.py
node --experimental-vm-modules --test standalone-scanner/tests/*.test.mjs
```

Extract `standalone-scanner/artifacts/document-scanner-0.1.0.zip` to a permanent
folder. In `chrome://extensions`, enable Developer mode, choose **Load unpacked**,
and select that folder (the folder containing `manifest.json`). Pin Document
Scanner and click its icon to reopen it. Keep the extracted folder in place so
Chrome can retain the same extension and saved draft. This is a local pilot,
not a published Chrome Web Store listing.

## Workflow

1. Open PNG/JPEG (up to 10 MiB) or PDF (up to 20 MiB and 30 pages).
2. Preview the page. Optionally improve its image, then recognize the page or an area.
3. Choose English, Russian, or both. Correct text beside the original and confirm each page.
4. Open the reviewed document. Download corrected PDF, checked TXT, or unchanged original.
5. **Review text** reopens corrections. The confirmed document resumes in this extension.

## Limits

- Recognition is local Tesseract; handwriting often needs manual correction.
- UI is English; OCR supports English and Russian. No camera capture or cloud AI.
- Visible corrections use printed text and a white mask; they do not reproduce handwriting.
- PDF export requires recognized position-linked text. Text typed for a whole page
  without positions can be saved as TXT; recognize and correct fragments for PDF export.
- Rendered PDFs omit original annotations and form fields. Download original to retain them.
- Confirmed drafts are encrypted in this browser profile and expire after 7 days.
  The profile also holds the key. Unconfirmed review edits are not saved on reload.
- Chrome's storage remains separate from Compare Two Texts. Old CTT drafts are not imported.
- Existing document limits remain: 2,000 text lines, 500,000 characters, 32 MiB saved snapshot,
  64 MiB rendered page-image budget during PDF export.

CI installs the actual unpacked extension in Chromium and checks manual correction,
local recognition, export, saved resume, cancellation and the absence of external requests.
The archived package includes component licenses and source hashes in `provenance.json`.
