# Chrome Web Store materials — Compare Two Texts 0.37.9 candidate

This directory contains submission copy, localized metadata and store assets.
It is not an installable extension. Preparing these files does not publish a
release or submit a listing for review.

## Candidate status and language scope

The candidate defines 51 interface locales and includes 51 prepared store
locale sets: English and 50 translations, including regional Spanish,
Portuguese and Chinese variants. Interface release readiness must be confirmed
by the strict build and final verification report. The normal build strictly requires complete interface catalogs and
valid placeholders; missing translations stop the build. Installed-package
and browser checks assess runtime behavior separately. This document does not
claim that CI or those checks have passed; consult the final verification report.

Translations include AI-authored listing copy and machine-translated interface
strings with selective AI review. This is not human native-speaker certification;
native speakers have not reviewed every locale. Coverage, placeholders
and character limits can be checked automatically; fluency and terminology
still need editorial review. The owner authorized external translation of
project UI labels, messages and help during preparation. That process does not
translate or upload user documents and is not a runtime service in the shipped
extension. Translation provenance is recorded with the interface catalogs.

## Canonical inputs

| Content | Input |
| --- | --- |
| Version and English name/short description | Repository `release.json` |
| All 51 names and short descriptions | `localizations.json` |
| All 51 full descriptions | `descriptions/<locale>.txt` |
| English dashboard reference | `LISTING-EN.md` |
| Release changes and limitations | `RELEASE-NOTES-EN.md` |
| Russian submission instructions | `SUBMISSION-RU.md`, `LOCALIZATION-RU.md` |
| Reviewer workflow | `REVIEWER-INSTRUCTIONS-EN.md` |
| Privacy explanation | `PRIVACY-DISCLOSURES-EN.md`, `PRIVACY-POLICY-EN.md` |
| Store images and provenance | `images/`, recaptured for the final ZIP |

## Package the verified candidate

Run the repository's normal build and required checks with complete interface
catalogs. Development modes allowing incomplete translations are not a release
path. Verify language switching, unsaved edits, draft restore, RTL, report
exports, macOS/WebKit behavior and offline operation in the installed package.

After creating the final Chrome/Firefox ZIPs, capture the store images and run
the installed-extension checks against the exact Chrome ZIP. The existing
`npm run package:store` command invokes `scripts/package_store.py`. It requires
matching extension versions, archive integrity, storage-test evidence, image
capture hashes and release provenance; it fails if that evidence belongs to a
different ZIP. Packaging does not itself certify native translation quality.

The resulting file is `artifacts/ctt-0.37.9-store-kit.zip`. It contains the inner
`ctt-chrome-0.37.9.zip`, a separate Firefox ZIP, 51 metadata JSON files and 51
full-description TXT files, reference copy, screenshots and checksums. Upload
**only the inner Chrome ZIP** to the existing Chrome Web Store item. Do not
upload the whole materials bundle or the Firefox ZIP as a Chrome extension.

Chrome `_locales` files supply extension metadata. Full store descriptions are
pasted separately in the dashboard; the description TXT files are not included
in the runtime ZIP. The welcome page and interface modules must be packaged in
the extension itself. Screenshots and video are not provided in 51 translated
versions by this change.

## Claims to retain

The main extension compares and edits documents locally and offline. PDFs need
a text layer; OCR remains removed. Existing limits on layouts, interactive PDF
forms, comments, DOCX notes, spreadsheet formulas and file size still apply.

Word and Google Docs integrations are separately installed pilots with their
own privacy terms. They are not installed automatically by Chrome, and this
release does not announce their publication in Microsoft Marketplace or Google
Workspace Marketplace. Do not extend the extension's offline-processing claim
to those integrations.

PDF report labels may use English when the bundled font or text shaping does
not support the selected language; the interface explains this before export.
The authoritative software license remains in English.
