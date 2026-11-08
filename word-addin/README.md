# Compare Two Texts for Microsoft Word — pilot 0.1.0

Source: `src/word-addin/`. Hosted setup: https://comparetwotexts.pro/word-addin/ .

This is a separate Office task-pane add-in, not a Chrome content script or a published Microsoft Marketplace listing. Google Docs uses the existing, independent `google-docs/` Apps Script prototype. The Chrome extension provides setup links; it does not install either add-in automatically.

## Flow and limits

Select one continuous, uniformly formatted passage in one ordinary body paragraph → Load → edit → Preview → Apply. The WordApi 1.4 manifest requires `ReadWriteDocument`; it uses no other account permissions or authentication flow. The pilot reads only the selection and its paragraph into panel memory. Code does not send text to a server, AI provider or analytics system, and does not persist drafts. The hosted panel and Microsoft Office.js require internet. Word's own saving, sync and service policies still apply.

The selection is limited to 4,000 UTF-16 units, the paragraph to 12,000. The adapter retains a tracked Range and its parent paragraph range, then checks their text, OOXML structure, formatting and location again before Apply. The current Word selection must still match the original tracked range. A loaded snapshot expires in 15 minutes and is consumed on any Apply attempt, including uncertain failures. Only one `Range.insertText(replacement, 'Replace')` is written. The paragraph-end mark is excluded, so deleting the selection retains its paragraph. Word determines insertion formatting; unselected content is not replaced.

Tables, lists, links, fields, bookmarks, comments, content controls, embedded objects, mixed-format selections and Track Changes are rejected. Select an ordinary unannotated passage and do not use noncontiguous selection. All accepted OOXML is parsed using namespaces, including Flat OPC packages. Unknown paragraph structure fails closed.

Office.js cannot make the read/check/write sequence atomic with simultaneous user or collaborator edits. Avoid concurrent editing during the pilot. The add-in does not save the file itself or promise one combined Undo step. On an uncertain write failure, inspect the document before trying again. The UI retains the draft and confirms before discarding it.

## Installation and native test

Use the hosted setup page for Word on the web and Word on Mac sideload instructions. The XML manifest uses HTTPS source `https://comparetwotexts.pro/word-addin/taskpane.html`. Custom add-ins can be disabled by an organization's administrator.

Native Word activation and end-to-end editing have **not yet been verified** by the automated test suite. On a test copy, check:

1. Open the panel on your Word client; load `5` in `Delivery within 5 days.`.
2. Edit to `10`, preview and apply. Confirm surrounding text and formatting, then save/reopen.
3. Check Word Undo and Redo, deletion, Cyrillic and emoji.
4. Load a selection, change its original text or formatting, then Apply: it must refuse.
5. Load a passage, select identical wording elsewhere, then Apply: it must refuse.
6. Confirm tables, hyperlinks, fields and tracked-change mode are refused.
7. After an error, keep/copy the visible draft; reloading must ask before replacing it.

## Automated checks

`node --test tests/word-addin.test.mjs` uses a model of Office proxy objects and synthetic Flat OPC fixtures. It covers selection identity, stale text/format, changed container, expiry, Unicode, preview invalidation, uncertain writes, draft retention and literal rendering. These tests do not claim real Word compatibility.

`scripts/check_static.py` checks the packaged manifest contract, local references, isolated CSP and absence of analytics. Microsoft’s `office-addin-manifest@3.0.1 validate src/word-addin/manifest.xml` additionally calls their remote validation service. The first local attempt could not contact that service (proxy tunnel timeout); a successful remote validation is still required before broad distribution.

## Host isolation

Only the Word task pane loads the official Office.js CDN:
`https://officeapis.public.onecdn.static.microsoft/1/office.js`.

Do not include the task pane or Office.js in the offline browser extension. Keep analytics out of all `word-addin/` pages. The task pane must be allowed to render inside Microsoft Word's frame; main-site `frame-ancestors 'none'` and `X-Frame-Options: DENY` must not apply to this exact task-pane route. The comparison workspace retains its original restrictions.

## Official references checked for this implementation

- https://learn.microsoft.com/en-us/javascript/api/word?view=office-js
- https://learn.microsoft.com/en-us/javascript/api/word/word.range?view=office-js
- https://learn.microsoft.com/en-us/javascript/api/word/word.body?view=office-js
- https://learn.microsoft.com/en-us/javascript/api/word/word.document?view=office-js
- https://learn.microsoft.com/en-us/office/dev/add-ins/develop/xml-manifest-overview
- https://learn.microsoft.com/en-us/office/dev/add-ins/develop/referencing-the-javascript-api-for-office-library-from-its-cdn
- https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-office-add-ins-for-testing
- https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-an-office-add-in-on-mac
