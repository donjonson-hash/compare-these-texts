# Contributing

Discuss substantive changes in an issue first. Original source is currently
UNLICENSED; no contributor agreement or open-source grant is implied. Agree
on licensing with the owner before submitting original contributions.

Use Node.js 24.15+ (24.x) or 26+, Python 3.11+, and a Git checkout.

```sh
npm ci --ignore-scripts
npm test
npm run check
```

`npm test` builds the website and extension ZIPs first and discovers all root
`tests/*.test.mjs` tests. Run the affected integration checks as well:

```sh
node --test google-docs/tests/*.test.mjs
python3 google-docs/build.py
python3 libreoffice/build.py
```

Native Writer integration requires LibreOffice, its Python UNO bridge and Xvfb;
the Writer workflow installs these and runs `libreoffice/tests/smoke.py`.

Use synthetic fixtures. Add regression tests for changes to parsing, persistence,
document edits and export. Do not upload real users' documents. Preserve storage
keys and extension identifiers unless a separately reviewed migration exists.

Update release.json, package.json/lock, both source manifests and user-visible
download/version labels together. The archive integration tests read release.json.
Never rebuild a vendor asset without its source recipe and a review of the new
checksum. Keep generated dist/ and local dependencies out of Git.
