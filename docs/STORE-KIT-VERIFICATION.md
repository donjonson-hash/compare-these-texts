# Compare Two Texts 0.37.1 — final store audit

Prepared October 24, 2026. This kit is a Chrome Web Store submission candidate;
it is not a store approval or a submitted listing.

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
Edit & export, Undo/Redo and PDF preview. The packaged editor and welcome are in
English; 22 store metadata locales and full descriptions are prepared.

Document data, edits and supported undo history are retained locally in separate
comparison/editor drafts. They expire after seven days without opening or
saving; removal occurs when the workspace next opens. Privacy materials state
local handling explicitly and do not equate it with no data handling.

## Release gates

The release pipeline runs the following before producing the downloadable kit:

- npm audit --audit-level=high (development dependencies, not shipped packages).
- npm test: document engines, persistence, export, compatibility and onboarding.
- npm run check: manifests, versions, permissions, CSP, local asset closure,
  license/font hashes, JavaScript syntax and both extension ZIPs.
- REQUIRE_EXTENSION=1 npm run check:extension: actual installed Chromium
  extension, automatic welcome, offline editing/download and saved work.
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
transparent 128×128 canvas. The site uses its existing green wordmark; this audit
does not replace the extension's document symbol.

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
