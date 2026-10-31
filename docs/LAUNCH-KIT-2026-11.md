# Launch and directory kit — November 2026

Copy for building referring domains and first users. Goal: 30+ referring
domains from real sites by the end of January 2027 (Semrush on 30 October:
2 weak referring domains for comparetwotexts.pro). The product metric remains
Chrome extension installs; links are the means.

Every claim below is checked against the current product (0.37.5) and the
privacy page. Do not add claims about OCR, whole-workbook comparison, formula
comparison, .doc import, pixel-level PDF comparison or "no tracking" on the
website: the website uses Google Analytics; the extensions do not.

## Rules for every placement

- Post from the maker's own account and say you built it.
- One link per placement, tagged with that placement's UTM labels (below).
  Values are lowercase slugs; see `docs/website-analytics.md`.
- Never ask for upvotes, buy reviews or links, or post the same text to many
  communities on the same day. Product Hunt, Hacker News and most subreddits
  penalise or ban this.
- Reply to every comment within the first few hours. Bug reports go to GitHub
  issues with fictional data, never confidential documents.
- Record each placement in the tracking table at the end.

## Sequencing

| When | Placement | Why then |
| --- | --- | --- |
| Now | GitHub repository About, AlternativeTo, SaaSHub | Links do not depend on the store listing |
| After CWS approves 0.37.5 | Show HN | Traffic lands on the store; the new name and screenshots must be live |
| One week after Show HN | Product Hunt | Use HN feedback to fix rough edges first |
| Spread over 2–3 weeks | Reddit (one subreddit at a time) | Avoids cross-posting flags |
| Ongoing, 10–20 per month | Resource-page outreach, Q&A answers | Slow but durable links |

On 30 October the Chrome Web Store listing showed 0.37.6 with the new name,
long description and a link to comparetwotexts.pro, so store-bound launches are
unblocked. Show HN is planned for Wednesday 4 November 2026.

## Links by placement

Website (campaign `launch_2026_11`):

| Placement | URL |
| --- | --- |
| GitHub About | https://comparetwotexts.pro/?utm_source=github&utm_medium=referral&utm_campaign=launch_2026_11&utm_content=about |
| AlternativeTo | https://comparetwotexts.pro/ (directory moderators reject tracking parameters in the official URL; the referrer domain attributes visits) |
| SaaSHub | https://comparetwotexts.pro/ (same reason) |
| Product Hunt | https://comparetwotexts.pro/?utm_source=producthunt&utm_medium=launch&utm_campaign=launch_2026_11 |
| Reddit r/SideProject | https://comparetwotexts.pro/?utm_source=reddit&utm_medium=social&utm_campaign=launch_2026_11&utm_content=sideproject |
| Show HN | https://comparetwotexts.pro/ (HN readers distrust tracking parameters; the referrer is attributed anyway) |

Chrome Web Store (store Analytics supports source, medium and campaign only):

| Placement | URL |
| --- | --- |
| Product Hunt | https://chromewebstore.google.com/detail/kclhfaiampafehfhhlejeeefhdhocfcg?utm_source=producthunt&utm_medium=launch&utm_campaign=launch_2026_11 |
| Reddit r/chrome_extensions | https://chromewebstore.google.com/detail/kclhfaiampafehfhhlejeeefhdhocfcg?utm_source=reddit&utm_medium=social&utm_campaign=launch_2026_11 |
| Directories (store field) | https://chromewebstore.google.com/detail/kclhfaiampafehfhhlejeeefhdhocfcg?utm_source=directory&utm_medium=directory&utm_campaign=launch_2026_11 |

## 1. GitHub repository

Applied on 2026-10-30 with the command below. Changing these fields publishes
text, so later edits need the owner's approval.

- Description: Compare two texts, Word, PDF and Excel/CSV files side by side in the browser. Edit the differences and export. Files are processed locally, never uploaded.
- Website: the GitHub About URL above.
- Topics: `diff`, `diff-checker`, `text-comparison`, `document-comparison`, `docx`, `pdf`, `xlsx`, `csv`, `chrome-extension`, `browser-extension`, `privacy`, `offline-first`

```sh
gh repo edit donjonson-hash/compare-these-texts \
  --description "Compare two texts, Word, PDF and Excel/CSV files side by side in the browser. Edit the differences and export. Files are processed locally, never uploaded." \
  --homepage "https://comparetwotexts.pro/?utm_source=github&utm_medium=referral&utm_campaign=launch_2026_11&utm_content=about" \
  --add-topic diff,diff-checker,text-comparison,document-comparison,docx,pdf,xlsx,csv,chrome-extension,browser-extension,privacy,offline-first
```

The license is proprietary (source available, not open source). Do not submit
to open-source directories or awesome lists that require an OSI license.

## 2. AlternativeTo

- Name: Compare Two Texts
- Short description: Compare two texts, Word documents, PDFs or Excel/CSV sheets side by side, edit the differences and download the result. Files are processed in your browser and never uploaded.
- Long description:

  Compare Two Texts shows the differences between two versions of a document side by side. Paste text or open DOCX, text-based PDF, TXT, XLSX, CSV or TSV files (up to 2 MB each), jump from one difference to the next and edit either version directly in the results. Download the edited Word document, convert it to PDF, or export a comparison report.

  Spreadsheets are matched by an identifier such as SKU or ID, so reordered rows still line up, and changed values and missing records are highlighted.

  Document processing happens locally in the browser. The free Chrome extension (also installable in Microsoft Edge) works offline, has no analytics and needs no account. Saved drafts are encrypted on the device and expire after seven days.

- Alternative to: Diffchecker, Draftable, WinMerge, Text Compare!
- Platforms: Online, Google Chrome, Microsoft Edge (not Firefox: only a temporary add-on exists)
- License: Free, Proprietary
- Tags: Diff, Compare documents, Compare text, PDF, Microsoft Word, Excel, CSV
- Features: Privacy focused, Works offline, No registration required, Ad-free, Side-by-side comparison
- Screenshots: `artifacts/store-screenshots-0.37.5/1-compare-documents-1280x800.png`, `2-compare-excel-csv-1280x800.png`, `3-edit-documents-1280x800.png`

## 3. SaaSHub

- Name: Compare Two Texts
- Tagline: Private diff checker for Word, PDF and Excel files
- Description: three paragraphs adapted from the AlternativeTo long description; added a Chrome Web Store line at the end.
- Name: SaaSHub imported "Compare Two Texts Edit Differences" from the page title. The name can only be changed through "suggest changes" under the URL field; a request for "Compare Two Texts" was sent on 2026-10-30.
- Open Source: No. Google Play field left empty (no Android app).
- Competitors: Diff Checker, Draftable Compare, Text compare!, DiffNow, WinMerge, Beyond Compare.
- Features: eight rows (files, side-by-side, edit in results, Excel & CSV by ID, export, local processing, offline extension, encrypted drafts). Platforms: Web, Chrome, Microsoft Edge.
- Q&A: five answers; "biggest customers" left blank until there are real customers who agree to be named.
- Skip the SaaSHub Experts "Top 5" nominations: no link value, and voting for products you have not used is not a genuine recommendation. Decline badges and paid featuring.
- Categories: Diff Tools, Document Comparison, Chrome Extensions, Productivity
- Pricing: Free
- Alternatives to suggest: Diffchecker, Draftable

## 4. Show HN

Post on Tuesday–Thursday, 8–10 a.m. US Eastern. Submit the URL; post the text
below as the first comment immediately.

### Run sheet for 4 November 2026 (8:00 ET = 16:00 Moscow)

Before the day:

- Use an existing Hacker News account, or create one now and take part in a few
  discussions first. Brand-new accounts draw suspicion and may be restricted.
- Walk the whole path once as a new user: site, Add to Chrome, install, Try an
  example, your own DOCX and PDF, download.
- Keep the first comment and the answers below open in a text file.

On the day:

1. Check that the site, the store listing and the guides open.
2. Submit at about 16:00 Moscow: https://news.ycombinator.com/submit with the
   title and URL below and an empty text field.
3. Post the first comment immediately.
4. Do not ask anyone to upvote or share the link for votes. Vote-ring detection
   can kill the post.
5. Stay for 3–4 hours. Reply to every comment briefly and factually; thank
   critics; never argue. Do not edit the title.
6. Log bugs as GitHub issues with fictional data. Fix only what blocks usage on
   the day; a site fix needs a clean build from main and a Sites deploy.
7. Watch GA4 Realtime and Chrome Web Store stats. Record the HN item URL, peak
   position and installs in the tracking table.

A post that gets no traction is normal. Do not delete and repost it; try a
different angle weeks later, or use Show HN's resubmission rules.

- Title (≤ 80): `Show HN: Compare Two Texts – diff Word, PDF and Excel files in the browser`
- URL: https://comparetwotexts.pro/

First comment:

> Hi HN, I built Compare Two Texts, a side-by-side diff for documents rather than code: two DOCX, text-based PDF, TXT, XLSX or CSV files, or pasted text.
>
> What it does: highlights changes, lets you jump between them and edit either version in place, then download the edited DOCX, convert it to PDF, or export a report. Spreadsheets are matched by an identifier (SKU, ID) instead of row position, so reordered rows still compare correctly.
>
> How: everything runs client-side. PDFs are read with PDF.js, spreadsheets with SheetJS CE, DOCX is parsed directly from the OOXML. Comparison runs in a Web Worker. The Chrome extension is the same engine packaged with `connect-src 'none'`, so it works offline and cannot send anything anywhere. Saved drafts are encrypted with AES-GCM using a non-extractable WebCrypto key and expire after 7 days.
>
> To be upfront: the website uses Google Analytics for visits and a few fixed events (comparison completed, download started, store click). No document text or file names are ever sent; the extension has no analytics at all. The source is on GitHub but the license is not open source.
>
> Limits: no OCR (scanned PDFs need a text layer), it compares text and table content rather than pixels, Excel compares one selected sheet per file and does not recalculate formulas, and files are capped at 2 MB.
>
> I would love feedback on documents where the comparison gets confused. Please use fictional data in reports.

Likely questions and honest answers:

- *Why not open source?* Source is visible for review; the license currently reserves rights. Say so plainly; do not argue.
- *How is this different from Diffchecker?* Local processing, editing in place, DOCX/PDF export and ID-based spreadsheet matching. Do not disparage competitors.
- *Why Google Analytics?* To see which pages lead to use and installs. It is configured without Google signals or ad personalisation and is absent from the extension.

## 5. Product Hunt

Launch at 12:01 a.m. Pacific, Tuesday–Thursday. Prepare the page as a draft a
week ahead. Do not ask anyone to upvote; ask people to try it and comment.

- Name (≤ 40): Compare Two Texts
- Tagline (≤ 60): `Diff Word, PDF & Excel files privately in your browser`
- Description (≤ 260): `Compare two texts, Word documents, PDFs or Excel/CSV sheets side by side. Jump between differences, edit either version and download DOCX, PDF or TXT. Files are processed in your browser and never uploaded; the Chrome extension works offline. Free.`
- Topics: Productivity, Chrome Extensions, Privacy, Writing Tools
- Links: Product Hunt website and store URLs above.
- Gallery (in this order): `artifacts/store-screenshots-0.37.5/1-compare-documents-1280x800.png`, `3-edit-documents-1280x800.png`, `2-compare-excel-csv-1280x800.png`, `4-export-pdf-1280x800.png`, `5-private-offline-1280x800.png`
- Thumbnail: 240×240 render of `src/favicon.svg` (the PNG icons are only 128×128). A local copy was generated at `artifacts/producthunt-thumbnail-240.png`, which is gitignored.

Maker comment:

> Hey Product Hunt! I made Compare Two Texts because comparing two versions of a contract or price list usually meant uploading confidential files to someone's server, or owning Word.
>
> It compares Word, PDF, Excel/CSV or plain text side by side, lets you fix differences right in the results, and exports the edited file. Spreadsheets are matched by SKU or ID, so shuffled rows don't break the comparison.
>
> Files never leave your browser. The Chrome extension works fully offline and has no analytics.
>
> It doesn't do OCR or pixel-perfect PDF comparison yet. Tell me which documents you compare most and what's missing. I'm here all day.

## 6. Reddit

Check each subreddit's self-promotion rules on the day you post. Use an account
with a history of genuine participation. One subreddit at a time, several days
apart.

### r/SideProject

- Title: `I built a diff checker for Word, PDF and Excel files that never uploads them`
- Body:

  > Comparing two versions of a contract or a supplier price list usually means uploading the files to a web service or opening Word's Compare. I wanted something that runs entirely in the browser.
  >
  > Compare Two Texts shows the two versions side by side, lets you edit the differences in place and download the result (DOCX, PDF or TXT). For Excel and CSV it matches rows by an ID column, so reordered rows still line up.
  >
  > Stack: plain JS, PDF.js, SheetJS, a Web Worker for the diff. The Chrome extension is the same code with network access disabled.
  >
  > Free, no account: {r/SideProject website URL}
  >
  > It's early. What would make you trust a tool like this with real documents?

### r/chrome_extensions

- Title: `Compare Two Texts: offline diff for Word, PDF and Excel files (free)`
- Body:

  > I made a free extension that compares two documents side by side: DOCX, text-based PDF, TXT, XLSX or CSV. You can edit differences directly and download the result.
  >
  > It works offline. The extension can't make network requests (CSP `connect-src 'none'`), has no analytics and needs no account.
  >
  > {r/chrome_extensions store URL}
  >
  > Feedback welcome, especially on PDFs that don't compare well.

### Do not post

r/privacy and similar subreddits usually ban self-promotion. r/excel and
r/legaladvice: only answer existing questions where the tool genuinely solves
the problem, with disclosure, never as a top-level post.

## 7. Resource-page outreach

University IT services, libraries, writing centres and legal clinics publish
"how to compare two documents" guides. Text-compare.com has 44 links from one
university domain. Send personal emails, 10–20 per month.

Search queries:

- `"compare two documents" site:.edu`
- `"compare word documents" (guide OR "how to") site:.edu`
- `inurl:libguides "compare" "documents"`
- `"document comparison" tools "track changes" -word.com`

Email template (personalise the first line every time):

> Subject: A free tool for your "{page title}" page
>
> Hi {name},
>
> I found your guide "{page title}" while looking for ways to compare document versions. {One specific sentence about their page.}
>
> I build Compare Two Texts, a free tool that compares two Word, PDF or Excel files side by side in the browser. Files are processed locally and never uploaded, which may matter for students and staff handling sensitive drafts: https://comparetwotexts.pro/compare-word-documents/
>
> If it fits your readers, it might be a useful addition next to {tool they already list}. Either way, thanks for the guide.
>
> {Your name}

Link to the most relevant guide, not the home page. Do not follow up more than once.

## 8. Q&A answers (Super User, Stack Exchange, Quora)

Answer only questions the tool actually solves, give the non-tool answer first,
and disclose affiliation (Stack Exchange requires it).

> In Word: Review → Compare → Compare documents, choose the original and revised file.
>
> Without Word, or if you prefer not to upload the files to a web service: Compare Two Texts (disclosure: I'm the developer) compares two .docx files side by side in the browser, without uploading them, and lets you download the edited version: https://comparetwotexts.pro/compare-word-documents/
>
> Limits: images are not compared and complex layouts may differ from Word.

## 9. Microsoft Edge Add-ons

Free to register and publish. Rules read on 31 October 2026 from Microsoft Learn;
Partner Center screens may differ. Certification can take up to seven business
days, and Edge reads name and short description from the manifest, so they cannot
be edited in Partner Center.

Package: run `npm run build && npm run package:edge`, then upload
`artifacts/ctt-edge-<version>.zip`. It is the Chrome build with one change of
metadata: English only and a 42-character name, because the 54-character store
name and 14 of 22 localized names exceed the 45-character limit MDN documents for
Edge. Tested in Chromium, not in Edge: load it in Edge once before publishing.

Registration: sign in at Partner Center with a Microsoft account (or GitHub),
choose an Individual account. Country/region and account type cannot be changed
later. Publisher display name, up to 50 characters: Compare Two Texts.

Availability: Public, all markets.

Properties:

- Category: Productivity
- Website: https://comparetwotexts.pro/
- Support contact detail: https://comparetwotexts.pro/support/
- Mature content: not selected

Privacy:

- Single Purpose Description: `Compare two versions of a text, Word, PDF, Excel or CSV file side by side, edit the differences and download the result, with all processing done locally in the browser.`
- Permission justification: none listed; the extension requests no permissions.
- Remote code: No, I am not using remote code.
- Data usage: select no data types. Read each certification before ticking it.
- Privacy Policy URL: https://comparetwotexts.pro/privacy/

Store listing (English):

- Description: paste `extension-package/store/descriptions/en.txt`.
- Extension logo: `src/icon-store-128.png` (the icon users see in the toolbar; 128×128 is the allowed minimum).
- Small promotional tile: `artifacts/store-screenshots-0.37.5/promo-440x280.png`
- Large promotional tile: `artifacts/store-screenshots-0.37.5/promo-1400x560.png`
- Screenshots: the five 1280×800 files in `artifacts/store-screenshots-0.37.5/`.
- Search terms (limit 7 terms, 21 words, 30 characters each): `diff checker`, `compare two texts`, `compare word documents`, `compare pdf files`, `compare excel files`, `text compare`, `document compare`

Notes for certification:

> No account, login or network access is needed. Click the extension icon in the toolbar; the workspace opens in a new tab. Select Try an example to load a built-in sample, or paste two texts and select Compare texts. Files are processed locally; the extension requests no permissions and its content security policy sets connect-src 'none'.

After approval, tell the maintainer: the website's Edge install note on
`/extension/` should then link the Edge listing instead of the Chrome Web Store.

## 10. Firefox AMO: blocked until the next release

The Firefox ZIP fails `web-ext lint` (31 October 2026, main bd84b17) with two
errors. Listed AMO publishing needs a code change and a new version, so it follows
Show HN. Until then Firefox stays a temporary add-on.

1. Name is 54 characters; the linter schema allows 45. Use `short_name` from
   `release.json` for the Firefox manifest.
2. `emoji-color-vendor.mjs` is 8.4 MB; AMO's limit is 4 MB per file. Split the
   generated emoji assets into chunks under 4 MB and load only the needed chunk
   from `src/pdf-color-emoji.mjs`, updating `vendor-assets.json` and its checks.

Listing copy (ready for when the blockers are fixed). AMO allows 250 characters in
the summary and Markdown in the description.

- Name: Compare Two Texts — Word, PDF & Excel Diff
- Summary: `Diff checker for Word, PDF, Excel, CSV and plain text. Compare two texts or documents side by side, edit the differences and download the result. Works offline. Files are never uploaded.`
- Support website: https://comparetwotexts.pro/support/
- Privacy policy: AMO requires one only if data is transmitted from the device. The extension transmits none, so leave the checkbox unticked.
- Compatibility: Firefox desktop only; Android is untested.

Description:

````markdown
Compare two versions of a document and see exactly what changed. **Compare Two Texts** is a diff checker for plain text, Word (DOCX), PDF and Excel/CSV files that runs entirely in Firefox. Your files are never uploaded to a server, and the extension works offline.

**WHO IT'S FOR**

- **Contracts and agreements:** compare two versions of a contract and review every changed clause, amount and percentage.
- **Price lists and supplier files:** compare two Excel or CSV files by SKU, product code or any ID and spot changed values and missing rows.
- **Reports, policies and drafts:** compare two Word documents or PDFs and check what an editor changed.
- **Writers and students:** compare two texts without pasting them into a website.

**HOW IT WORKS**

1. Click the toolbar icon to open the comparison workspace.
2. Paste two texts or choose two files, then compare them.
3. Review the highlighted differences side by side and move from change to change.
4. Edit the result right in the comparison and download or print it.

**FEATURES**

- **Text compare and document compare:** TXT, Word DOCX, text-based PDF, CSV/TSV and Excel XLSX.
- **Side-by-side view** with highlighted additions, deletions and changes.
- **Edit in place:** change text in the comparison workspace instead of switching back to Word.
- **Excel compare by ID:** pick a sheet, match rows by an identifier, choose the columns to check, edit cells and copy a missing row from A to B.
- **Amounts & percentages:** catch changed prices, totals and percentages in text, Word and PDF comparisons.
- **Edit & export for a single document:** fill printed blanks or add text on supported text-based PDFs.
- **Export Word DOCX to PDF** with a preview, including headers, footers and page numbers.
- **Built-in examples** so you can try the workflow before opening your own files.

**PRIVATE BY DESIGN**

- Documents are processed on your device. Nothing is uploaded for comparison or editing.
- The extension requests no browser permissions, collects no data and contains no analytics.
- No account is needed.
- Drafts are saved locally and encrypted with AES-GCM-256. The key stays in your browser profile: this is not a password-protected vault, and downloaded files are not encrypted.
- Drafts expire after seven days without use. Website and extension drafts are stored separately.

**GOOD TO KNOW**

- Requires Firefox 142 or later.
- Files up to 2 MiB each. The editor interface is in English.
- PDFs need a text layer: scanned images and OCR are not supported. Interactive PDF form fields and comments are not supported.
- Images and formatting are not compared. Complex PDF or Word layouts may export as text only, and Word layout may differ from Microsoft Word.
- DOCX footnotes, endnotes and comments are not imported; move them into the main text of a copy first.
- Spreadsheet comparison needs one header row, no merged cells and values instead of formulas.

Also available on the web at [comparetwotexts.pro](https://comparetwotexts.pro/).
````

Also prepare before submitting:

- Source package: vendor bundles are built with esbuild, so AMO requires source and
  build instructions with OS, tool versions, the lockfile and exact commands
  (`npm ci --ignore-scripts && npm run build`, Node ^24.15). The build is
  reproducible, which reviewers can verify.
- Reviewer notes: explain the 11 linter warnings: dynamic `import()` of local
  modules in `app.js` and one `eval` occurrence inside vendored `pdf-vendor.mjs`.
  Check that occurrence before writing the note.
- Decide on the Gecko ID. `kristina-reconciliation@donjonson-hash.github.io` is
  permanent once listed and carries an old internal name.
- License: proprietary, so choose All Rights Reserved or a custom license.

## 11. Demo video

`ctt-promo.mp4` (35 seconds, 1920×1080, local file) works as a short teaser. Before
reusing it, change the end card: "Upload. Compare. Edit. Download." contradicts
"files are never uploaded". Use "Open. Compare. Edit. Download." It shows neither
privacy nor Excel matching, which the video below adds.

YouTube version: about 80 seconds, on the search intent "how to compare two word
documents" (2400 / KD 35). Captions must carry the story without sound. Record at
1920×1080 in a clean browser profile, using only the built-in sample documents.

| Time | Screen | Caption | Voice-over (optional) |
| --- | --- | --- | --- |
| 0:00–0:06 | Two sample versions side by side, highlight on Warranty | Warranty: 24 months → 12 months. Would you have spotted it? | One line changed in this agreement. Would you have spotted it? |
| 0:06–0:14 | Home page, cursor on Upload file for A and B | Compare two Word documents. No Word needed. | Here's how to compare two Word documents in your browser, without Microsoft Word. |
| 0:14–0:22 | Help → Try document editing, comparison opens | Open both versions. Differences are highlighted. | Open both versions. Every difference is highlighted side by side. |
| 0:22–0:30 | Next difference, moving through the changes | Jump from change to change. | Jump straight from one change to the next. |
| 0:30–0:42 | Select the Warranty passage, Use A, Done | Fix it right in the results. | Fix a passage right there: type over it, or take the wording from the other version. |
| 0:42–0:50 | Download the Word file; PDF → Preview PDF | Download Word, or preview a PDF. | Then download the edited Word file, or preview and export a PDF. |
| 0:50–1:02 | Help → CSV / Excel example, changed cells and missing rows | Excel and CSV: rows matched by ID, even when reordered. | Spreadsheets work too. Rows are matched by ID, so reordered rows still line up. |
| 1:02–1:12 | Privacy page or Chrome extension in the toolbar | Your files never leave your browser. Works offline. | And your files never leave your browser. The extension works offline, with no account. |
| 1:12–1:20 | End card: logo, comparetwotexts.pro, Add to Chrome | Free. comparetwotexts.pro | Compare Two Texts. Free at comparetwotexts.pro. |

Do not show or say: OCR, whole-workbook comparison, formula comparison, pixel-level
PDF comparison, or real customer documents.

Recorded on 31 October 2026: `artifacts/ctt-demo-youtube-78s.webm` (gitignored; 78 seconds, 1920×1080, VP8, silent, captions burned in, built-in samples, site served locally).

YouTube copy:

- Title: `How to Compare Two Word Documents for Free (No Upload, No Word Needed)`
- Thumbnail text: `What changed?` over the two highlighted versions.
- Tags: compare two word documents, compare word documents, diff checker, compare pdf files, compare excel files, document comparison
- Chapters: `0:00 Spot the change`, `0:06 Compare two Word documents`, `0:30 Edit in the results`, `0:40 Download Word or PDF`, `0:49 Excel and CSV`, `1:00 Private and offline`
- Description:

  > Compare two Word documents side by side in your browser, without Microsoft Word and without uploading your files. Compare Two Texts highlights every difference and lets you fix it right in the results, then download the edited document.
  >
  > Try it free: https://comparetwotexts.pro/?utm_source=youtube&utm_medium=video&utm_campaign=launch_2026_10&utm_content=description
  > Chrome extension: https://chromewebstore.google.com/detail/kclhfaiampafehfhhlejeeefhdhocfcg?utm_source=youtube&utm_medium=video&utm_campaign=launch_2026_10
  >
  > It also compares PDFs with selectable text, Excel and CSV files by ID, and plain text. Files up to 2 MB. No OCR for scanned PDFs.

After publishing, embed nothing on the site yet: the site CSP blocks frames. Link the
video from the Word guide if it performs, and add the YouTube URL to the Edge listing.

## Tracking

| Date | Placement | URL of the post or listing | Status | Link type | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-10-30 | GitHub About | https://github.com/donjonson-hash/compare-these-texts | Live | Repository website field | Description, website and 12 topics set |
| 2026-10-30 | AlternativeTo | | Submitted, awaiting moderation | Directory listing | Name "Compare Two Texts"; alternatives Diffchecker, Draftable, WinMerge, Text Compare! |
| 2026-10-30 | SaaSHub | https://www.saashub.com/compare-two-texts-edit-differences | Live, verified | Directory listing, Visit website → https://comparetwotexts.pro/ | Name change to "Compare Two Texts" requested |
| | Microsoft Edge Add-ons | | | | |
| | Show HN | | | | |
| | Product Hunt | | | | |
| | Reddit r/SideProject | | | | |
| | Reddit r/chrome_extensions | | | | |

Review every two weeks: referring domains in Semrush and the Search Console
Links report, website sessions by `utm_source`, `chrome_store_click` events and
store installs by source.
