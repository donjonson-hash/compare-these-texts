# Localization draft validation — 2026-11-08

This is implementation evidence, not approval of a translated release.

## Earlier 52-locale checkpoint

- Catalog coverage reached 52 of 52 locales with 2,133 messages per locale.
- Local test run with actual translated catalogs passed all 277 extension tests and all 17 Google Docs tests.
- A temporary installation in desktop Firefox passed offline comparison, Russian welcome, Arabic RTL and a switch to Japanese that kept the original text and highlighted differences.
- The language-quality gate remains open. Automated checks catch visible decoder placeholders, runaway repetition, damaged markup and altered literal addresses. Targeted editorial review found additional wording and meaning errors. Swahili needs substantial revision.
- The installed Chromium and macOS WebKit checks still need to run on the release candidate. The current local Chromium runner cannot create the required Unix socket.

## Initial draft checks

- Source policy: passed.
- Chrome store copy: 52 metadata entries and 52 complete descriptions; field-length and locale-set checks passed.
- Actual-source i18n engine/build, report and Word unit tests: 31 passed.
- Google Docs backend/sidebar tests: 17 passed.
- Isolated build/integration copy: 272 tests exercised; two initial failures were corrected (native language names in an English-only assertion and nondeterministic Google sidebar ordering). The affected 23-test suite then passed. Remaining 270 tests had passed on the first run.
- Isolated static package check passed: assets, scripts, CSP, fonts/licenses, Office manifest, deterministic Google archive and both browser ZIPs.

The isolated build used synthetic English identity catalogs plus the available reviewed overrides solely to exercise packaging and existing workflows. Those fixture catalogs and ZIPs are not release artifacts and are not included in this branch. The real release build intentionally remains blocked by incomplete translations.

Not yet performed: complete translated build, full translation/terminology review, Chromium/WebKit language layout checks, CWS upload or production deployment. Native Word/Google live document editing is outside these mocked integration checks and remains unverified.
