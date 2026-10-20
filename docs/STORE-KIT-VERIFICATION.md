# Store kit verification — 20 October 2026

Candidate: 0.35.4, extending the prepared localized-store PR #11. This does not
change the website source, merge the PR or publish a store listing.

## Completed locally

- Build and static package checks passed for Chrome and Firefox: versions,
  localized Chrome metadata, exact asset closure, local links, permissions,
  CSP, bundled vendor/font/license hashes and source policy.
- Of 148 tests, the first full run passed 146. Two archive tests exposed a test
  loader that treated the new module script as classic JavaScript. The loader
  now honors script type; both affected archive scenarios passed on rerun.
  The four new tests cover first install versus updates, one-time example
  launch, existing saved work and storage-read failure.
- The focused browser flow passed in Chromium 138.0.7204.0 as a local page:
  welcome links, edited B download, separate help tab, retained Undo and saved
  draft, guarded example launch and Continue restoring the downloaded document.
  No external HTTP requests or uncaught errors were observed.
- CI requires an actual installed Chrome extension (`REQUIRE_EXTENSION=1`),
  including observing the installation-created welcome tab. The local-page
  result does not substitute for that gate. Refer to PR checks for its result.
- All 22 prepared descriptions and the metadata catalog match the earlier
  0.35.4 descriptions archive byte for byte. Full translation review by native
  speakers has not been performed. Editor and welcome remain English.
- `npm audit --audit-level=high` returned zero vulnerabilities for the checked
  development dependency tree. Playwright is not shipped in the extension.

## Visual and delivery checks

Screenshots use only built-in synthetic documents and tables from the packaged
extension. The kit includes document, table and welcome views at 1280×800,
promotional images at 440×280 and 1400×560, and the existing brand icons at
16/32/48/64/128 px. The 128 px store icon has 96×96 artwork with transparent
padding. `package_store.py` validates PNG dimensions and the 800 KB budget,
archive integrity, required descriptions and metadata, then writes per-file
SHA-256 checksums. Store text includes local draft retention and actual PDF and
table limits, rather than copying the code-comparison product's scope.

Firefox package structure and install lifecycle are covered by automated
checks; a live Firefox installation has not been exercised in this preparation.
