# Compare Two Texts

Current CTT website and offline Chrome/Firefox extension source: **0.37.2**.
The same files in `src/` produce the website and both extension packages.
Documents are processed locally; extension manifests request no permissions or
host permissions. Website: https://comparethesetexts.com/.

## Compact comparison workspace

After document comparison, the main toolbar shows the difference count, navigation
and **All tools**. This window contains saved work, mode switching, **Change
files**, reports, search, zoom, guided review and amounts. Filenames and downloads
stay with each document; save errors and document scope limitations remain visible.
`npm run check:compact` checks keyboard focus, reading area, review/undo/download,
mode switching, mobile layout, saved-work restoration and file replacement.

**Home** opens a start screen with file inputs for a new A/B pair. The current
documents, edits and Undo history stay available through Continue comparison/editing.
A new comparison reads both replacement files before replacing the current work;
cancelling the replacement keeps the current documents intact.
For Word conversion, open a `.docx`, select PDF, choose **Preview PDF**, then
**Download PDF** in the preview. Legacy `.doc` files must first be saved as `.docx`
in Word or LibreOffice; changing the filename extension is not conversion.
Supported text headers/footers and page numbers are included in the PDF. Complex
page layouts remain restricted; PDF export does not silently discard those parts.

## Extension welcome and store kit

The 0.37.2 candidate opens a local welcome page on first installation. Updates
leave existing tabs alone. **Getting started** in the extension footer opens
the guide separately; **Try an example** leaves an existing saved comparison
available to resume. The editor and welcome page remain English.

The Chrome package includes 22 localized metadata catalogs. Full store
descriptions, five icon sizes, five actual screenshots, two promotional images
and Russian submission instructions are assembled with `npm run package:store`
after building and running `npm run store:assets`. The result is `artifacts/ctt-0.37.2-store-kit.zip`; unpack it
before uploading its inner Chrome ZIP. Firefox is supplied for temporary
testing; its metadata remains English. This preparation does not publish either
store listing or deploy the website.

To refresh synthetic screenshots, run `npx playwright install chromium` and
`npm run store:assets` after a build. The focused installed-extension check is
`REQUIRE_EXTENSION=1 npm run check:extension`; CI installs the browser and runs
this gate. Playwright is a development dependency, not shipped in the extension.

## Review amounts and percentages

In **Compare documents**, open **Amounts & percentages** below the review
controls. It lists changed currency amounts and percentages in text, Word and
supported PDF comparisons, links to their locations and lets you mark them
checked. Decisions are saved with the comparison and invalidated when the
relevant text changes. Spreadsheet comparisons use their own review controls.

## Fill printed PDF forms

In **Edit & export**, open a text-based PDF. Detected printed blanks are immediately highlighted: click and type, then move to the next field, **Print** or **Download PDF**. The app saves the active entry and fits its font size to the available width and line spacing. **Add text** places an entry anywhere; **Format** offers manual controls. Printing renders only final PDF pages, preserving the form artwork. Prepared PDFs keep a direct Save PDF to computer link in the editor, plus Download PDF in the print window, for browsers that decline automatic downloads. Added Cyrillic/Latin text remains searchable in downloads. Fields are saved with the local draft. After editing underlying source text, check existing field positions before exporting. Line detection is conservative; scans and interactive PDF widgets are not automatically filled. Short date blanks and underscore runs beside printed labels are supported.

## Source and release ownership

This standalone source tree contains the website, browser extensions and
[LibreOffice Writer](libreoffice/README.md) and
[Google Docs](google-docs/README-RU.md) prototypes. Application source is in
`src/`; release metadata is in `release.json`.

The Git history was extracted from the `ctt/` directory of
[donjonson-hash/kristina-revolutionary](https://github.com/donjonson-hash/kristina-revolutionary)
at commit `7ec380657bf61f9c153e6139722ae77df4095480` (CTT 0.35.0).
Extracted commits have new identifiers because their paths and trees changed.
The older `extension/` and `static/reconciliation/` implementations, Telegram
bot and Scout remain separate and are not included in this repository.

This import preserves the application assets from saved Site version 34,
source commit `60ad3bcea23c6539242a953f4591cd2fc5f4470e`. [`docs/history/import-0.33.6-provenance.json`](docs/history/import-0.33.6-provenance.json)
records every imported asset and the original published ZIP checksums.
It is a historical import record, not a claim about future deployments.
Importing code here does not change the deployed website.

`HISTORY.md` is the original development record. Its old workspace paths,
regeneration instructions and upstream references describe the earlier setup;
use the build commands below instead. Old localization/base-page generators
are deliberately not part of the release pipeline: they would overwrite the
current application with an earlier UI.

## Reproduce a release

Requires Node.js 24.15+ (24.x) or 26+, and Python 3.11 or newer, plus Git for revision metadata.

Run from the repository root:

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run check
```

Outputs:

- `dist/`: static website, including extension downloads.
- `dist/downloads/ctt-chrome-0.37.2.zip`: load the extracted directory in Chrome.
- `dist/downloads/ctt-firefox-0.37.2.zip`: temporary Firefox installation.
- `dist/release/provenance.json`: Git revision, working-tree status, asset hashes
  and ZIP hashes for that build.

`dist/`, `artifacts/`, installed dependencies and historical ZIPs are not committed. The
dedicated CTT GitHub Actions job builds and tests from a clean checkout and
uploads the generated website and extensions. Store publishing and website
deployment are separate actions; a successful CI run does not publish them.

## Development and audit scope

Edit `src/`, then rebuild before testing. Source is deliberately outside a
generated `dist/` directory so repository scanners can find it. Third-party
bundles and fonts are committed with their existing license/source notices;
do not replace them with Git LFS pointers. Large bundled assets still need a
separate dependency review even if a scanner skips them.

The lockfile includes the native canvas test dependency. PDF rendering tests
must not silently disappear because that dependency is missing. Tests use
synthetic fixtures and do not require private user documents or API keys.

The extraction preserves the application behavior of CTT 0.35.0. It does not certify
that every spreadsheet layout can be compared or every PDF can retain its
layout. In particular, merged/formula worksheets supported by the single-file
editor must not be described as supported by two-file comparison without a
separate verified change to that comparison path.

## License and security

The original CTT software is proprietary. [LICENSE](LICENSE) permits free personal
and internal business use, including processing client documents and installing
the supplied integrations. Redistribution, sale and modification of the original
code require permission except where the license or applicable law permits them.
Your documents and exported results are not subject to the software license.
Bundled third-party licenses remain with their assets.

The build renders `/terms/` and packages `terms.html` and `LICENSE.txt` for offline
use from the canonical root LICENSE. Writer and Google Docs packages also include
that exact LICENSE.txt. Update the root file when changing terms; do not maintain
separate copies. Release 0.35.3 introduces these terms; earlier releases are not
retroactively relicensed.
Security reporting: [SECURITY.md](SECURITY.md). Contribution and test workflow:
[CONTRIBUTING.md](CONTRIBUTING.md). Hosting requirements: [docs/HOSTING.md](docs/HOSTING.md).

`npm test` builds first and discovers every `tests/*.test.mjs` file. `npm run check`
also verifies release version consistency, first-party browser API restrictions
and pinned vendor/font checksums. These are regression guards, not a substitute
for a dependency or security review. Acorn is used by the browser API guard.

## Chrome store metadata

Chrome 0.37.2 includes localized names, summaries and toolbar titles for 19 additional
languages (21 regional variants), with English fallback. The editor UI remains
English; each translated summary states this explicitly. See
[the complete copy and publishing notes](docs/CWS-LOCALIZATIONS.md).
Canonical copy lives in `extension-package/store/localizations.json`; the build
validates it and generates `_locales` only in the Chrome ZIP. Ready-to-paste [full descriptions](extension-package/store/descriptions/README.md)
cover the same locales. Paste each text into its store dashboard locale; these
files are not bundled into the extension. Localized screenshots remain separate.
