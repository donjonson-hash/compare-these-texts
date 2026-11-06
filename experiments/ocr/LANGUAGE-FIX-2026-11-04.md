# OCR language selection fix — 2026-11-04

New documents and pages previously reset to English even after an explicit Russian selection. The pilot now remembers the last explicit language and layout per panel for replacement documents and unopened PDF pages. Previously opened pages keep their settings. Preferences last only for the current browser session; reloading resets them.

The OCR language selector sits immediately above Recognize and uses English (eng) / Русский (rus). Browser interface translation does not choose the recognition model. Document text, filenames and comparison output opt out of browser translation.

## Verification

Real Chromium 153 checks passed on source and on the extracted v4 ZIP. On the same synthetic rus-paragraphs-a image, English produced 476 character edits / 559 reference characters (85.152% CER); Russian produced 5 / 559 (0.894% CER). This is one regression fixture, not a general accuracy claim. Remaining mistakes include USD → 050, О0 → ОО and I1 → 11. Manual review remains required.

The test also verifies language selection before upload, replacement, unopened-page inheritance, preservation of visited-page settings, invalidation of approval and exact reviewed TXT download. No external requests or page errors were observed under the test network guard. The existing PDF browser regression also passed.

Evidence: [Russian browser regression](evidence/russian-language-regression.json). CI runs check-russian-browser.mjs alongside the existing PDF browser checks.

## Portable pilot v4

- Filename: ctt-ocr-pdf-pilot-v4.zip
- Size: 25,519,841 bytes
- SHA-256: 334c8910a9f8d42f0eef781a950f9201fa2d4e9ff8506707f289f9857d7d66c9
- All 116 bundled file checksums verified after extraction.

Stop the old Python server, extract into a new folder, run the server from the new ctt-ocr-pilot directory, and hard-refresh the browser. Select Русский (rus) independently for A and B and recognize again; existing output is not automatically repaired.

This is an isolated evaluation pilot. Production site and extension packages are unchanged.
