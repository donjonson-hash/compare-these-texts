# Compare Two Texts 0.37.9 — localization candidate

Prepared 8 November 2026. This is candidate documentation, not a statement of
publication, Chrome Web Store approval or completion of the final validation.
The candidate defines 51 language and regional variants, including English.
Their release readiness is established by the strict build and final checks. The normal build strictly requires complete catalogs and valid
placeholders. Browser and installed-package results belong in the final
verification report; this document does not assert that those checks passed.

- Prepare 51 sets of Chrome listing names, short descriptions and full
  descriptions. Preserve the English name and short description; retain and
  update existing translations and add 30 missing locales.
- Add a shared local interface-language layer for the welcome page, launcher,
  workspace, help and public guides, with language selection and right-to-left
  presentation where required. The separate Word and Google Docs panels use
  the same locale scope.
- Keep interface translation separate from user content. Document text,
  filenames, sheet names, comparison direction and calculations are not
  translated. Language selection must preserve unsaved edits and saved work.
- Prepare translated strings during development, including owner-authorized
  machine translation of project interface labels, messages and help. This is
  not a runtime translation service and does not send user documents for
  translation. Machine-translated interface strings receive selective AI
  review, not human native-speaker certification. AI-authored store copy and
  structural checks also do not replace native-language editorial review.
- Retain the Mac/WebKit fixes and changed-word highlighting introduced in
  0.37.8. Localization does not introduce a Safari extension package or claim
  certification for every Safari release.
- Keep the extension's document comparison and editing local and offline,
  without new document-upload requirements. OCR remains removed. PDF requires
  a text layer and retains its documented layout, form and comment limitations.
- Keep the Word task-pane and Google Docs Apps Script integrations as separately
  installed pilots with separate privacy terms. They are not automatically
  installed by Chrome or newly published to an Office marketplace.

Interface catalogs, placeholder checks, Chromium/WebKit behavior, offline
operation and report exports remain release gates. PDF report labels may use
English when the bundled font/shaping does not support the selected language;
the interface explains this before export. The authoritative software license
remains in English. Screenshots and video have not been translated into 51
versions by this change.

# Compare Two Texts 0.37.8 — Mac navigation and document-editor add-ins

- Restore precise changed-word highlighting for text and Word documents, including edits, Undo and restored work.
- Keep saved Edit & export controls inside their workspace. Delayed resume operations cannot reopen an old document over a new comparison; Home observers survive browser back/forward cache.
- Restore the macOS WebKit regression gate alongside the installed Chromium extension checks. This covers the browser engine, not certification of every Safari release or a Safari extension package.
- Add an Office add-ins entry from the welcome page and workspace help. Include the existing Google Docs Apps Script prototype and instructions for separate installation.
- Provide a new Microsoft Word task-pane pilot with explicit selection, edit, preview and apply. It requires separate installation in a compatible Word host; it is not installed automatically by Chrome and is not published in Microsoft Marketplace.
- Keep the Chrome extension permission-free and offline. Office integrations have separate data handling, described before installation. Integrated OCR remains removed.

# Version 0.37.7 — Getting started

- Redesigned the local welcome page around PDF comparison, private contract review and a three-step first workflow.
- Added a direct Edit & export entry for one document.
- Kept sample launch, pinning help, PDF limitations and encrypted draft details visible.
- Comparison and editing engines remain the 0.37.6 baseline; no OCR or new permissions.

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

## Included in the historical 0.37.6 candidate

- A document-first Edit & export workspace with **Open new document** and
  **Document options**, plus preservation of the current document when a
  replacement cannot be opened.
- Word DOCX → PDF preview and download with supported header/footer textboxes,
  page numbers and plain horizontal rules. Calibri/Carlito text uses an offline
  compatible font; supported color emoji remain available.
- A local first-install welcome page, toolbar launcher and Getting started link.
- At that release, English listing copy, 22 localized metadata catalogs and
  22 full descriptions were included. Current 0.37.9 locale counts are above.
- Store images, icons, privacy explanations and reviewer instructions.

## Scope

Conversion does not promise pixel-identical Word pagination or support for every
DOCX/PDF structure. Unsupported layouts produce an explanation. Legacy `.doc`
files must be saved as `.docx` first. No OCR or remote AI service is included.

See `VERIFICATION.md` and the packaged checksums for the final build's audit
results. This note lists features included in the candidate; it does not imply
that every feature was introduced by the 0.37.6 patch alone.
