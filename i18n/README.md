# Interface localization — 0.37.9 draft

Status: implementation and partial AI-reviewed translations are prepared. This is **not a complete 52-locale release**. Do not merge, deploy or upload the candidate until every catalog is complete and the full validation gates pass.

## Coverage and data boundaries

`locales.json` defines 52 Chrome-compatible locales, including English. Regional English variants fall back to English. Spanish, Portuguese and Chinese have regional variants. This is a locale count, not a claim of 52 distinct languages.

`src/i18n.js` loads packaged local modules and stores only the chosen locale in localStorage. Explicit bindings cover welcome, guides, workspace controls, messages and the separate Word/Google Docs panels. The engine never scans document content for translation. User text, filenames, sheet names, comparison direction and calculations remain unchanged. Switching languages does not reload the page.

Generated assistant answers keep the language used when they were created. Newly generated answers and reports use the current interface language. PDF report labels use English when the embedded font/shaping cannot render the selected language; the interface explains this before export. HTML and XLSX report labels support Unicode. The authoritative software license remains English.

## Source and catalog contract

- `sources/*.json`: explicit English UI strings contributed by feature owners.
- `source.json`: deterministic SHA-256-prefix IDs mapped to English strings.
- `catalogs/<locale>.json`: translated values keyed by those IDs.
- `overrides/<locale>.json`: reviewed corrections, applied after the base catalog.
- Numeric rich-text slots and named parameters must survive translation exactly.

Run `python3 scripts/build_i18n.py --collect` after changing English UI strings. Normal builds validate all 51 non-English catalogs before writing any localized modules. Missing keys, unknown keys, blank values, malformed slots and changed parameters stop the build. `--allow-incomplete` is for development only and is never used by the release build.

Existing translations are AI-authored and checked for key/placeholder integrity, not certified by native speakers. The initial subset covers Russian, Ukrainian, German and French, plus selected core strings in Arabic, Hebrew, Japanese, Korean and both Chinese locales; the rest of the interface still requires translation and review.

## External translation approval

On 2026-11-08 automatic approval review rejected sending the project's UI catalog to a public Google translation service without explicit user authorization. The batch operation was stopped before any successful catalog translation. No user documents are part of this proposed operation. The optional `scripts/translate_ui.py` utility is disabled unless its explicit external-transfer flag is supplied. Do not retry external translation until authorization is provided. The translation service would be used only during preparation; no network translator is added to the shipped application.

## Verification before release

Run the complete normal build, tests and static checks with real translations, then Chromium and WebKit UI gates. Exercise English, Russian, a long-label language, CJK and RTL, including language switching during an unsaved edit and after restoring a draft. Verify extension offline operation and the compiled Google Docs package. Update the welcome/store screenshots and publish only after these checks pass.
