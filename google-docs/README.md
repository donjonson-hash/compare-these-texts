# Compare Two Texts for Google Docs — prototype 0.1.0

Select a passage in Google Docs, edit it in a sidebar, preview removed and added text, and apply the change to the original document. No file download or upload to the Chrome extension is needed.

This is a document-bound Apps Script prototype, not a published Google Workspace Marketplace add-on or Chrome extension. It runs in Google's infrastructure and requires an internet connection. The code does not call an LLM, our website, or third-party servers. [Русская инструкция](README-RU.md).

## Install for a first test

This proprietary prototype is free for personal and internal work use. Installation by copying the unmodified files into Apps Script and making the necessary project settings is permitted. Distribution, sale, and code modifications require permission except as allowed by applicable law or third-party licenses. See the full [license](../LICENSE), included as `LICENSE.txt` in the ZIP archive.

1. Extract `compare-these-texts-google-docs-0.1.0.zip`.
2. Open an editable test copy of a native Google Doc in a desktop browser. Convert a DOCX copy to Google Docs format first if needed.
3. Choose **Extensions → Apps Script**. Replace the default `Code.gs` with the packaged file.
4. Choose **+ → HTML**, name the file **Sidebar**, and replace its contents with `Sidebar.html`.
5. In project settings, enable the option to show `appsscript.json` in the editor. Replace its contents with the packaged manifest.
6. Save the project and reload the document.
7. Select words within one ordinary body paragraph. Choose **Compare Two Texts → Edit selected text**. On first use, authorize access to the current document and its interface. Your organization's administrator may restrict Apps Script.
8. If the selection does not load automatically, select it again and click **Load selected text**.

No web-app deployment, API key, or OAuth client ID is needed for this test. The script is bound to the current document; its manifest requests only `documents.currentonly` and `script.container.ui` scopes.

## Use

- **Your edit**: change the selected text.
- **Preview changes**: review struck-through removals and underlined additions.
- **Apply to document**: apply the reviewed change. Editing the draft invalidates the preview; preview it again before applying.
- **Load selected text**: load another selection.
- **Close**: close the sidebar.

The document is unchanged until Apply. An empty replacement deletes the selection while retaining its paragraph. Google Docs handles saving; check its save indicator. Use Google Docs Undo or version history when needed. A single Undo step for the whole operation is not guaranteed.

## Data handling

The Apps Script backend reads the active tab's body text to compute a SHA-256 fingerprint, preventing an edit from being applied to the wrong paragraph after a document change. Text outside the selected paragraph is not retained in the cache or sent to the sidebar.

The user-scoped **Google Apps Script CacheService** temporarily stores the selected text (up to 4,000 UTF-16 units) and the full selected paragraph text (up to 12,000 UTF-16 units) in plaintext, along with paragraph formatting, document/tab IDs, selection position, the body fingerprint, and an expiry timestamp. The requested cache lifetime is 15 minutes; Google may evict the entry earlier. This is temporary server-side storage in Google's infrastructure, not browser-only local processing.

The sidebar receives the selected text and a token. Applying an edit sends the token and reviewed replacement back to Apps Script. The cache entry is consumed immediately before document writes to prevent replay; closing the sidebar does not delete it. Expired or evicted selections must be loaded again.

## Prototype limits

- One continuous selection in an ordinary body paragraph, up to 4,000 UTF-16 units. Most letters use one unit; many emoji use two. The original paragraph may contain up to 12,000 units and 500 formatting runs.
- Only the active document tab is supported, with at most 200,000 UTF-16 units and 1,000 top-level body elements.
- Tables, lists, headers/footers, footnotes, hyperlinks, inline objects, and inserted paragraph breaks are unsupported.
- The preview describes one contiguous replacement from the first to the last difference. Unchanged prefix and suffix keep their formatting. New text inherits the first replaced character's style, or an adjacent character's style for an insertion. A replacement crossing different styles is rejected: edit each styled passage separately.
- Changes to the original paragraph, its formatting, body text, or active tab invalidate the selection. Script locking does not prevent simultaneous manual edits by collaborators; avoid concurrent edits during testing.
- Comments, bookmarks, and suggestion mode are not exhaustively checked through DocumentApp. Test ordinary unannotated text in editing mode.
- If an error occurs after writing starts, some changes may already have been applied. The sidebar preserves the draft for copying and asks you to check the document before loading again.

Automated tests use API and DOM models. They cover selection binding, stale snapshots, formatting, Unicode, replay prevention, and the sidebar; they do not replace a manual test in real Google Docs. Installation and behavior in your Google account are not established by these tests.

## Build and test

From the repository root:

```sh
npm ci --ignore-scripts
node --test google-docs/tests/*.test.mjs
python3 google-docs/build.py
```

The ZIP is written to `google-docs/dist/`. CI publishes it as `compare-these-texts-google-docs-prototype`.

For a manual check, replace one word, check unchanged bold/italic formatting, try Unicode and deletion, and confirm Undo and saving. Load a selection and change the paragraph directly: applying the old draft should be rejected. A selection in a table should be rejected without changing the document.

## Google documentation

- https://developers.google.com/apps-script/guides/docs
- https://developers.google.com/apps-script/guides/dialogs
- https://developers.google.com/apps-script/reference/cache/cache
- https://developers.google.com/apps-script/reference/document/document
- https://developers.google.com/apps-script/reference/document/text
