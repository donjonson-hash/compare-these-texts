# Compare Two Texts 0.37.6 — submission notes

This package prepares the current extension for Chrome Web Store review. It is
not a claim that the listing is published or approved.

## Changes in 0.37.6

- Point the extension homepage, privacy/support metadata and generated website
  links directly to the canonical `https://comparetwotexts.pro/` domain.

- Ship the shared PDF import fix in a new Chrome/Firefox installation package.
  Text-based PDFs containing empty `about:blank` link placeholders now open in
  both Edit & export and comparison. Version 0.37.5 from the store predates it.
- Placeholders remain inert. Additional/chained actions, other `about:` URLs,
  interactive forms and comments remain unsupported.
- Unchanged PDF downloads preserve the original bytes and links. Edited rebuilt
  PDFs omit clickable annotations, as stated in the editor.
- Add an installed-extension regression covering a six-page PDF with three
  placeholders, page navigation, editing, download, Undo, comparison and rejection
  of chained actions without losing the open document.
- Saved draft encryption, permissions and offline operation remain unchanged.

## Retained from 0.37.5

- Renamed the English listing to **Compare Two Texts — Diff Checker for Word,
  PDF & Excel** and removed the BETA label. Editor features are unchanged.
- Updated the English short description and full description to lead with
  use cases (contracts, price lists, reports) and local, offline processing.
  Limitations are kept in full. The 21 translated listings are unchanged.

## Retained from 0.37.4

- Encrypt saved comparison and single-document drafts locally with AES-GCM-256.
  Document names, source files, edits, undo history and reports are encrypted.
- Keep a non-extractable key in the local browser profile. No account, password
  or external service is needed; ordinary document downloads are unchanged.
- Migrate valid older drafts on load without discarding their work. Failed
  encryption or storage operations do not fall back to plaintext saves.
- Preserve seven-day retention, deletion, restore and cross-tab ownership.

## Retained from 0.37.3

- Added a shared, font-independent CTT logo to the home, privacy, help, terms
  and extension pages, with fixed dimensions and padding inside its frame.
- Updated footer pages with current navigation, document export and local
  draft guidance. The supplied software license remains unchanged.

## Retained from 0.37.2

- Replaced the vague Tools & info entry with **All tools** and three labeled
  sections: **Review & edit**, **Files & settings** and **Reports**.
- Kept document comparison controls compact while making existing tools easier
  to locate. Document processing and export capabilities are unchanged.
- Corrected welcome and submission instructions to describe **Undo** accurately.
  There is no application-level Redo command in this release.

## Retained from the preceding audit

- Preserved PDF link annotations in Chrome 120–125 with a local URL.parse compatibility fallback.
- Updated welcome guidance for single-document editing and PDF preview.
- Added editor/PDF screenshots and bound image checksums to the exact installation ZIP.

## Included in the candidate

- A document-first Edit & export workspace with **Open new document** and
  **Document options**, plus preservation of the current document when a
  replacement cannot be opened.
- Word DOCX → PDF preview and download with supported header/footer textboxes,
  page numbers and plain horizontal rules. Calibri/Carlito text uses an offline
  compatible font; supported color emoji remain available.
- A local first-install welcome page, toolbar launcher and Getting started link.
- Current English listing copy, 22 localized metadata catalogs and 22 full
  descriptions. The editor and welcome page remain English.
- Store images, icons, privacy explanations and reviewer instructions.

## Scope

Conversion does not promise pixel-identical Word pagination or support for every
DOCX/PDF structure. Unsupported layouts produce an explanation. Legacy `.doc`
files must be saved as `.docx` first. No OCR or remote AI service is included.

See `VERIFICATION.md` and the packaged checksums for the final build's audit
results. This note lists features included in the candidate; it does not imply
that every feature was introduced by the 0.37.6 patch alone.
