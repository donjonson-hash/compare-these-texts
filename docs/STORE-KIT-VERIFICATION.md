# Compare Two Texts 0.37.6 — final store audit

Prepared October 30, 2026. This kit is a Chrome Web Store submission candidate;
it is not a store approval or a submitted listing.

## PDF import release correction

Version 0.37.6 packages the shared `about:blank` link-placeholder compatibility
fix (PR #38), which was deployed to the website after the 0.37.5 store package
was built. The importer and PDF modules in the offline ZIP match the build.
The installed-extension check opens a synthetic six-page PDF with three inert
placeholders, edits and downloads it, undoes the edit, compares it with a copy
without annotations, and rejects a chained action while preserving the open file.
Existing PDF-link tests cover query/fragment variants and additional actions.

## Scope and findings

The extension is a local document comparison and editing workspace, not a
launcher for an online conversion service. Manifest V3 declares no API or host
permissions. Its CSP blocks network connections and remote scripts. Core work
runs through local Workers. Libraries, fonts and their licenses are bundled.

A confirmed compatibility defect was corrected during this audit: PDF.js used
URL.parse, absent in Chrome 120–125, and could omit link-annotation evidence.
All application PDF readers now load a local compatibility entry first. The
regression test removes native URL.parse and exercises normal links, export
warnings and unsupported chained actions. Vendor bytes remain unchanged.

Welcome opens automatically only on first installation. Existing saved work is
protected when opening a demo. Welcome now describes comparison and single-file
Edit & export, Undo and PDF preview. The packaged editor and welcome are in
English; 22 store metadata locales and full descriptions are prepared.

In document comparison, **All tools** opens three labeled sections:
**Review & edit**, **Files & settings** and **Reports**. Existing secondary
controls stay available inside those sections while the main header remains
compact. Welcome and submission instructions no longer promise Redo; the
application provides Undo only.

Document data, edits and supported undo history are retained locally in separate
comparison/editor drafts, encrypted with AES-GCM-256. They expire after seven days without opening or
saving; removal occurs when the workspace next opens. Privacy materials state
local handling explicitly and do not equate it with no data handling.

## Encrypted draft storage in 0.37.4

The complete validated payload (filenames, sources, edits, supported undo history
and reports) is encrypted before IndexedDB persistence. Each record uses a fresh
96-bit nonce, a 256-bit non-extractable Web Crypto key and a 128-bit GCM tag.
Authenticated metadata binds the record to its workspace, schema, ownership
token, encryption revision and timestamps. Only that metadata remains plaintext.

The key is stored in the same local browser profile for password-free resume.
This does not protect against code running in an unlocked profile and is not a
password vault. Deleting/expiring a draft removes its logical record and key;
forensic erasure from browser disk files or backups is not promised. Downloaded
documents use their ordinary formats and are not encrypted by this feature.

Valid older drafts migrate on load. Crypto operations run outside IndexedDB
transactions, followed by an atomic ownership/revision check before writing.
Failed crypto or storage operations leave the previous record intact. No
plaintext persistence fallback is allowed. Database version 2 prevents older
version-1 code from reopening the store and saving plaintext again.

Real Web Crypto tests cover tampering, missing/wrong keys, failed migration,
quota failures, expiration, concurrent readers/writers/deletion and both draft
types. The installed-extension check inspects actual IndexedDB records,
migrates a version-1 fixture, restarts the browser profile and restores document
downloads. ENCRYPTED-STORAGE-CHECK.json binds that check to the installation ZIP.

## Release gates

The release pipeline runs the following before producing the downloadable kit:

- npm audit --audit-level=high (development dependencies, not shipped packages).
- npm test: document engines, persistence, export, compatibility and onboarding.
- npm run check: manifests, versions, permissions, CSP, local asset closure,
  license/font hashes, JavaScript syntax and both extension ZIPs.
- REQUIRE_EXTENSION=1 npm run check:extension: actual installed Chromium
  extension, automatic welcome, offline editing/download, encrypted storage,
  legacy migration and restoration after a full browser restart.
- npm run check:compact: comparison, single-document replacement, PDF preview
  and download, navigation and preservation of existing edits.
- npm run store:assets: five screenshots and two promotional images captured
  from the exact packaged assets with built-in fictional examples only.
- npm run package:store: PNG dimensions, size budget, archive integrity,
  localization and image hashes bound to the exact Chrome ZIP.

See the release PR and its checks in the repository:
https://github.com/donjonson-hash/compare-these-texts/pulls

AUDIT-RESULTS.json records package-level results. SCREENSHOT-PROVENANCE.json
binds all images to the Chrome archive hash and capture browser. SHA256SUMS.txt
covers each delivered file. Do not replace a ZIP while keeping old screenshots.

## Graphics

Five full-bleed screenshots: 1280×800, document comparison, table comparison,
single-document editing, PDF preview, welcome. Promo tiles: 440×280 and 1400×560.
Each PNG is below the kit's 800 KB budget. Existing blue document icons are
preserved at 16/32/48/64/128 px. The store icon has 96×96 artwork centered on a
transparent 128×128 canvas. The website and packaged workspace use a shared
green CTT mark drawn as SVG paths; it fits inside its frame without relying on
installed fonts. The extension's toolbar document symbol is unchanged.

## Practical limits

Chrome's declared minimum is 120. Missing-URL.parse behavior is simulated by the
regression test; a physical Chrome 120 installation was not exercised. Firefox
packaging is checked but this kit does not constitute an AMO submission or a
live Firefox certification. Translations have not been reviewed by every native
language speaker. Legacy .doc, OCR, arbitrary PDF layouts and unsupported Word
layouts are not promised. Preview Word-to-PDF results before downloading.

The owner completes account verification, contact details, distribution and
Privacy practices in the current dashboard before submission. No account data
or certification has been invented or submitted by this preparation.
