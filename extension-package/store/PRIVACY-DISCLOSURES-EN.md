# Chrome Web Store privacy fields — Compare Two Texts 0.37.2

Prepared 24 October 2026 against the packaged extension's local processing and
storage behavior. These are submission answers, not evidence that the Chrome
Web Store form has already been completed or accepted.

## Single purpose description — ready to paste

Compare and edit user-selected text documents and spreadsheets locally, review differences between versions, and download or print the revised result.

## Remote code

No, I am not using remote code.

Explanation, if requested:

All executable code, document parsers, PDF libraries and fonts are packaged with the extension. Document comparison, editing and export do not call a remote server or AI provider. Optional website and GitHub support links are ordinary user-initiated navigation, not downloaded executable code.

## Permissions justification

The extension declares no required or optional API permissions, host permissions or content scripts. It opens its own local editor and first-install welcome page. Files are read only after a user selects them, and text is entered or pasted by the user. It does not read other tabs, browse the filesystem or monitor browsing activity. No extra permission needs to be added to fill in this form.

## User data handling — ready to paste into a relevant explanation field

The extension handles document names and contents that the user chooses to open, paste or edit, including text, tables and supported images. It uses this information locally to compare versions, apply edits, show previews and generate downloads. Documents may contain personal or other sensitive information chosen by the user; the extension does not independently request or extract account credentials, health profiles, browsing history or advertising identifiers.

Comparison and single-document drafts are saved separately in local browser storage. They can contain original files, edits, supported undo history and view settings. Saved work expires after seven days without opening or saving it and is removed when the app is next opened. The user can delete saved work in the app. Website and extension drafts are separate and do not sync. Downloaded files remain where the user saves them until the user deletes them.

Document data is not transmitted to the developer, a comparison server or an AI service. There is no analytics or diagnostic telemetry, no advertising use and no sale of document data. Opening the public website or GitHub support is optional. Information a user voluntarily submits to GitHub is handled there under GitHub's policy; public issue reports are visible to others.

## Data-usage checkboxes — publisher verification

Local-only processing still requires disclosure and a privacy policy. Do not
select a blanket “no user data is handled” statement just because the extension
does not upload files. Read the exact collection and category definitions shown
in the current dashboard and use the factual statement above.

- Document content supplied by the user is processed and may be saved locally.
  It can contain text, images and information the user chose to include.
- The extension does not capture websites, browser history, location, account
  authentication data or browsing activity from the browser.
- A user can place personal, financial or other sensitive text in a document.
  Do not describe that as data the developer receives or profiles automatically.
- Do not invent permission justifications or remote services to satisfy a form.
- If the form's available categories do not clearly fit generic local documents,
  use the explanation above and resolve the category interpretation before
  submission. No category-selection state is claimed in this bundle.

The limited-use certifications should match these actual practices:

- Document data is not sold or transferred to third parties.
- It is used only for the extension's stated document workflow.
- It is not used for lending decisions, advertising, profiling or model training.

These statements describe the extension. Chrome, the Chrome Web Store and
optional external websites have their own processing and privacy policies.

## Privacy policy URL

https://comparetwotexts.pro/privacy/

The same policy is included as `privacy.html` inside the extension. A readable
copy is provided as `PRIVACY-POLICY-EN.md` in this store kit.

## Sources checked on 24 October 2026

- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- https://developer.chrome.com/docs/webstore/program-policies/limited-use
