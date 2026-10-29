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

The Chrome Web Store still showed 0.37.4 ("Compare & Edit BETA") on 30 October.
Check the listing name before any launch that sends traffic to the store.

## Links by placement

Website (campaign `launch_2026_11`):

| Placement | URL |
| --- | --- |
| GitHub About | https://comparetwotexts.pro/?utm_source=github&utm_medium=referral&utm_campaign=launch_2026_11&utm_content=about |
| AlternativeTo | https://comparetwotexts.pro/?utm_source=alternativeto&utm_medium=directory&utm_campaign=launch_2026_11 |
| SaaSHub | https://comparetwotexts.pro/?utm_source=saashub&utm_medium=directory&utm_campaign=launch_2026_11 |
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

The repository is public but has no description, website or topics. Changing
them publishes text, so it needs the owner's approval.

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
- Description: use the AlternativeTo short description.
- Categories: Diff Tools, Document Comparison, Chrome Extensions, Productivity
- Pricing: Free
- Alternatives to suggest: Diffchecker, Draftable

## 4. Show HN

Post on Tuesday–Thursday, 8–10 a.m. US Eastern. Submit the URL; post the text
below as the first comment immediately.

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

## Tracking

| Date | Placement | URL of the post or listing | Status | Link type | Notes |
| --- | --- | --- | --- | --- | --- |
| | GitHub About | | | | |
| | AlternativeTo | | | | |
| | SaaSHub | | | | |
| | Show HN | | | | |
| | Product Hunt | | | | |
| | Reddit r/SideProject | | | | |
| | Reddit r/chrome_extensions | | | | |

Review every two weeks: referring domains in Semrush and the Search Console
Links report, website sessions by `utm_source`, `chrome_store_click` events and
store installs by source.
