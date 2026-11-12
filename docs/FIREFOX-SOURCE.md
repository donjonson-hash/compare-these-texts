# Rebuilding the Firefox submission

The AMO source archive contains the complete tracked project sources, the npm
lockfile, localization inputs, deterministic packaging scripts, vendored runtime
modules, fonts, licenses and their source/reproduction documentation. It does not
contain Git history, credentials, user documents, `node_modules`, `dist`, or test
output. This archive is for the **Source code** field in AMO, not installation.

## Reviewer build

Use Linux with Git, Python 3.11 or later, Node.js 24.15 or later in the 24.x line
(or Node.js 26+), and npm. The exact release environment is recorded in
`SOURCE-REVIEW.json`, including CPU architecture and Python/zlib versions.
Node and npm installation instructions: <https://nodejs.org/en/download>.
Git installation: <https://git-scm.com/downloads>.
Python installation: <https://www.python.org/downloads/>.

Unzip the source package into an empty directory and run:

```sh
sh REBUILD-FIREFOX.sh
```

This script checks the source hashes, creates a local Git repository solely for
the build's provenance step, installs locked build dependencies with
`npm ci --ignore-scripts`, runs `npm run build`, and compares every rebuilt Firefox
archive member with the submitted package. It also checks the complete ZIP hash.
The local review commit is not the original release commit. The original commit
is recorded in `SOURCE-REVIEW.json` and is not needed from a remote repository.

Output: `dist/downloads/ctt-firefox-<version>.zip`. Extension ZIP timestamps and
file order are fixed. A different Python/zlib compression implementation can
change the container hash without changing any member; the script reports this
distinction and always rejects a changed member or filename.

The build uses npm only to install its locked development tools. Runtime
libraries and fonts are included locally; the extension performs no dependency
downloads. The build creates both extension packages before the website-only
minification pass. The Firefox package deterministically divides the local
emoji data into modules below 2 MiB; see `scripts/firefox_package.py`.

## Runtime libraries and generated assets

`VENDOR.md` and `vendor-assets.json` inventory runtime libraries, exact hashes,
licenses and source recipes. `src/PDF-READER-SOURCE.md`,
`src/SHEETJS-SOURCE.md`, `src/PDF-SOURCE.md`, and `src/XMLDOM-SOURCE.md` explain
the JavaScript vendor builds and intentional patches. Font and emoji provenance
is in the adjacent `src/*SOURCE*` documents and `docs/FONT-REPRODUCTION.md`.
Do not regenerate these assets as part of the normal extension rebuild: the
release uses the supplied, checksum-verified vendor bytes. Their separate
recipes are provided for inspection and independent verification.

```sh
python3 scripts/verify_vendor.py
```

First-party application modules are readable source, not obfuscated. Generated
language catalogs come from `i18n/source.json`, `i18n/sources/`,
`i18n/catalogs/`, and `i18n/overrides/`. The source archive also includes the
Google Docs add-in source used for the bundled installation download.

## Functional review

No account or service credentials are required. Install the Firefox package,
open the toolbar action and select the bundled example. Compare the two versions,
apply a change from A to B, undo it, edit B, then download the edited document.
The package works offline. OCR-generated DOCX support covers empty service-note
templates, bounded embedded legacy pictures, and visible HYPERLINK field text.
Fields become styled plain text on DOCX export, with a notice. Framed pictures
retain their Word layout in DOCX; unsupported PDF positioning is explicitly
disabled. Arbitrary fields, real footnotes, and unsupported picture effects are
rejected rather than silently omitted.

## Maintainer packaging

Commit release changes, build from that clean commit, then run:

```sh
npm ci --ignore-scripts
npm run build
python3 scripts/package_firefox_source.py
```

The source packager refuses dirty or stale builds. Its output is
`artifacts/ctt-firefox-<version>-source.zip`.

Mozilla requirements checked for this workflow:
<https://extensionworkshop.com/documentation/publish/source-code-submission/>
and <https://extensionworkshop.com/documentation/publish/add-on-policies/>.
