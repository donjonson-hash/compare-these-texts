# OCR evaluation pilot — Compare Two Texts

PDF follow-up: [behavior, validation and portable package](PDF-PILOT-2026-11-04.md).

An isolated experiment, not a released extension feature. Nothing in `src/`, the
extension manifests, release version, or production build is changed. The normal
PDF text-layer importer remains strict. The pilot accepts PNG/JPEG and PDF
(up to 20 MiB / 30 pages). PDF pages are rendered on demand to at most 4 million
pixels; encrypted PDFs and pages requiring unavailable external resources are
rejected with a visible error.

## Browser pilot

Requirements: Node.js 24+, Python 3, Pillow 13.0.0, ReportLab 4.4.9
(fixture generation only), and DejaVu Sans/Mono fonts. Dependencies are pinned in the
nested package lock. Runtime scripts, WASM and language data are served locally;
there are no CDN requests or hosted OCR calls.

```bash
cd experiments/ocr
npm ci --ignore-scripts
python3 generate_fixtures.py
python3 prepare_assets.py
python3 generate_pdf_fixtures.py
python3 -m http.server 8787 --bind 127.0.0.1
```

Open http://127.0.0.1:8787/. Upload A and B, select each language, recognize,
check the output against the original image, edit if necessary, then confirm
both texts. Compare or download confirmed TXT. Editing or replacing a document
invalidates confirmation. Cancel stops the recognition task. Files are not
uploaded to the local HTTP server: it only serves static application assets.
The UI does not persist document text or send telemetry. Tesseract may cache
language assets in the browser. Use **Open full-size image** to inspect the
original at readable scale. The collapsed **Recognition options** control defaults
to single-block segmentation (PSM 6). Automatic page layout (PSM 3) is optional:
it improved English columns in this pilot but degraded invoices. Changing the
language or layout invalidates the reviewed transcription.

Use generated fixture PNGs for a first test. The comparison display is a simple
line-position diagnostic, not the production diff engine; insertion shifts are
not evidence of OCR quality. Plain text is rendered as text, never as HTML.

## PDF review workflow

Use the Page selector to inspect every page. Existing text layers are extracted
without OCR and still require review against the rendered original. On scanned
pages, select the recognition language and press Recognize. If a text layer is
incomplete or wrong, Recognize replaces it after successful OCR; it is never
silently combined with the old text.

Edits and confirmation are kept per page while navigating. Editing a page or
changing its recognition settings invalidates that page's approval. Complete
document TXT export and comparison require every page to be confirmed. A blank
page needs the explicit “no text to compare” checkbox and confirmation. This is
a user's decision, not an automatic claim that a scan is blank.

TXT export includes page markers for multi-page documents. The diagnostic diff
compares pages and lines by position and offers buttons to reopen differing pages.
It is not automatic page matching; inserted pages can shift subsequent results.
Text, images and approvals are in memory only and are lost on page refresh.

PDF page annotations are not rendered in this pilot. PDF.js extraction order is
retained; complex reading order, handwritten text, mixed scripts and unusual
fonts need manual review. Cancellation or replacement cannot approve stale output.
The existing modified PDF reader is copied into local vendor assets by
prepare_assets.py; no CDN or model API is used.

## Reproducible benchmark

```bash
# In experiments/ocr, after npm ci and fixture generation:
npx playwright install chromium
node benchmark-browser.mjs
python3 summarize.py results/tesseract-browser.json --output results/tesseract-summary.json
python3 -m unittest discover -s . -p 'test_*.py'
node --test test_pdf_input.mjs
node check-pdf-browser.mjs
```

The default report is `results/tesseract-browser.json`. Set `OCR_PSM=3` for a
separate automatic-layout run saved as `results/tesseract-auto-psm3.json`.
Set `OCR_UI_ONLY=1` for the interaction smoke test, saved as `results/ui-smoke.json`.
These modes do not overwrite the default benchmark report.

A preinstalled Chromium can be selected using `CHROMIUM_EXECUTABLE`.
The benchmark blocks requests outside its loopback origin and records blocked
attempts. Browser/runtime versions are captured in the raw result. Setup time is
separate from recognition time. Results on a cloud CPU do not establish latency
or memory use on a user's laptop. Sampled main-thread JS heap is **not** total
browser, WASM, worker memory, or peak RSS.

## Dataset and interpretation

`generate_fixtures.py` creates 24 synthetic 1200×1600 RGB PNG pages, matching
UTF-8 text references, and a manifest: six categories × English/Russian × A/B.
Categories: paragraphs, numeric invoice, two columns, table, small font, degraded.
Two degraded pairs have identical text but different image quality, so differing
OCR outputs expose false differences. Ten pairs contain known text changes.
The generator uses fixed seeds; image hashes are recorded during scoring.
Pillow/font versions may change raster output, so retain those hashes when
comparing runs. This small generated set is **not a real-world accuracy benchmark**.

Scoring reports character/word edit rates, exact page matches, numeric token
precision/recall, and pair-level false differences/missed changes. NFC and
whitespace normalization ignore line wrapping but retain case and punctuation.
Numeric scores preserve literal digit tokens and duplicates; they do not prove
correct association with labels or table cells. Pair scores only detect whether
any change exists, not whether all changes are correctly localized. Failed or
missing pages remain visible and are excluded from success-only error rates.

## Xiaomi candidate

Xiaomi-OCR-0 requires a separate compatible inference runtime. Its browser demo
is a frontend to local inference, not evidence of in-browser execution. The
experimental Ollama BF16 package is approximately 1.8 GB including the vision
projector. A successful import is not a quality or performance test. See the
probe report and dated result notes for what was actually run here.

Sources:
- https://github.com/xiaomi-research/Xiaomi-OCR-0
- https://github.com/xiaomi-research/Xiaomi-OCR-0/blob/main/OLLAMA.md
- https://github.com/naptha/tesseract.js

## Promotion gate

Before adding OCR to the released extension:

1. Benchmark both candidates on the same image bytes and manually verified
   real-world EN/RU scans, including blank pages and mixed PDFs.
2. Score exact changed numbers and edit locations, not only global OCR metrics.
3. Measure repeatability, cancellation, peak process memory and startup on
   ordinary supported Windows/macOS/Linux laptops.
4. Validate the prototype PDF limits and per-page routing with real-world files;
   preserve source page numbers and original images alongside confirmed OCR text.
5. Preserve the confirmed transcription for repeated comparisons and Undo/Redo;
   record engine/model version and options rather than rerunning OCR silently.
6. Verify Chrome/Firefox packaging with local WASM/workers/language data and an
   explicit CSP. This web pilot does not prove extension-store compatibility.

No production engine selection is justified until these gates are assessed.

## Xiaomi benchmark command

Start a compatible local model server using the pinned runtime/model instructions
in [xiaomi-probe.md](xiaomi-probe.md), then run its adapter command. Omit `--ids`
to process the full dataset. Score the resulting JSON with the same summarizer:

```bash
python3 summarize.py results/xiaomi-cpu.json --output results/xiaomi-summary.json
```

The adapter uses raw plain-text output. It does not silently remove Markdown,
change case, repair numbers, or normalize Cyrillic/Latin lookalikes to improve
scores. Both candidates are evaluated against the same exact source text.

### Table-format diagnostic

Raw CER/WER include output-format differences. Xiaomi may emit Markdown tables
even for the plain-text prompt. A **secondary** `table_format_diagnostic` removes
only simple validated Markdown table delimiters while preserving cell content,
order, case and numbers. It does not strip general punctuation/headings, repair
OCR or change the UI text. This diagnostic was added after observing table output
and is exploratory; it must not replace raw fidelity metrics.

The HTTP Xiaomi adapter records **caller-provided** model/projector digests; it
cannot inspect the remote process's loaded weights. The recorded experiment also
hashed the actual local model files and started its server with those exact paths.
See `evidence/environment-2026-11-04.json`. The browser pilot serves local assets;
network blocking is enforced by the benchmark runner, not a production CSP in
the standalone development page.

## Portable image/PDF pilot

After dependency installation and fixture generation, run:

```bash
python3 package_pilot.py --output /tmp/ctt-ocr-pilot.zip
```

The ZIP contains the browser UI, local OCR runtime and EN/RU language assets,
24 synthetic image pages, PDF test documents, license notices and checksums. It excludes Xiaomi
weights, the inference server, Playwright and browser binaries. Extract it and
follow `START-HERE.txt`; Python serves the files on loopback, with no npm install
required on the testing machine. This is a standalone document prototype, not a
Chrome/Firefox store package.
