# Interface localization — 0.37.9 draft

Status: implementation is prepared; 34 of 52 locale catalogs are complete, including English. External translation is paused after Google HTTP 429. This is **not a complete 52-locale release**. Do not merge, deploy or upload the candidate until every catalog is complete and the full validation gates pass.

## Coverage and data boundaries

`locales.json` defines 52 Chrome-compatible locales, including English. Regional English variants fall back to English. Spanish, Portuguese and Chinese have regional variants. This is a locale count, not a claim of 52 distinct languages.

`src/i18n.js` loads packaged local modules and stores only the chosen locale in localStorage. Explicit bindings cover welcome, guides, workspace controls, messages and the separate Word/Google Docs panels. The engine never scans document content for translation. User text, filenames, sheet names, comparison direction and calculations remain unchanged. Switching languages does not reload the page.

Generated assistant answers keep the language used when they were created. Newly generated answers and reports use the current interface language. PDF report labels use English when the embedded font/shaping cannot render the selected language; the interface explains this before export. HTML and XLSX report labels support Unicode. The authoritative software license remains English.

## Source and catalog contract

- `sources/*.json`: explicit English UI strings contributed by feature owners.
- `source.json`: deterministic SHA-256-prefix IDs mapped to English strings.
- `catalogs/<locale>.json`: translated values keyed by those IDs.
- `overrides/<locale>.json`: priority corrections and validated recoveries, applied after the base catalog. Provenance differs: these include model-authored edits and machine-translated recovery records; their presence is not proof of human review.
- Numeric rich-text slots and named parameters must survive translation exactly.

Run `python3 scripts/build_i18n.py --collect` after changing English UI strings. Normal builds validate all 51 non-English catalogs before writing any localized modules. Missing keys, unknown keys, blank values, malformed slots and changed parameters stop the build. `--allow-incomplete` is for development only and is never used by the release build.

Catalog preparation combines Google machine translation, focused model-authored editorial corrections, and structurally validated recovery of translation batches. None of these records is certified by native speakers. Complete catalogs currently cover 34 locales including English; Marathi is partial and 17 further locale catalogs still need their remaining messages. Google returned HTTP 429 during preparation and again after a pause; external requests were stopped with completed work preserved. The target remains all 52 locales. This draft must not be published as a completed localization.

## External translation authorization

The owner explicitly authorized Google translation of UI labels, messages and help on 2026-11-08 after reviewing the external-transfer scope. The optional `scripts/translate_ui.py` utility sends only these project UI strings; it never reads or sends user documents. It runs during preparation, not inside the shipped application. Translation results and source hashes are recorded in `translation-metadata.json`. Output remains machine translation requiring editorial review; structural validation does not establish native-language quality.

## Verification before release

Run the complete normal build, tests and static checks with real translations, then Chromium and WebKit UI gates. Exercise English, Russian, a long-label language, CJK and RTL, including language switching during an unsaved edit and after restoring a draft. Verify extension offline operation and the compiled Google Docs package. Update the welcome/store screenshots and publish only after these checks pass.
