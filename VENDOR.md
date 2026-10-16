# Vendored dependency and font verification

Runtime vendor modules and font bytes are committed to `src/` so document work
does not require dependency downloads. `vendor-assets.json` records their byte
lengths and SHA-256 hashes, plus the accompanying license files. Embedded fonts
also have a separate hash of the decoded TTF bytes; a JavaScript module hash is
not a font file hash.

Run the offline gate from any directory:

```sh
python3 scripts/verify_vendor.py
```

Verification fails on changed, missing or unlisted vendor modules, binary font
files, embedded font exports and license files. The manifest is a reviewed
baseline, not a signature or an upstream authenticity claim. After an intentional
update, review its upstream source, license and patches before updating hashes;
the build must never automatically regenerate the manifest.

| Shipped dependency or font | Source and rebuild details |
| --- | --- |
| PDF.js 6.3.289 | `src/PDF-READER-SOURCE.md`; restored builder verifies upstream files, the intermediate bundle, final patched bundle and license |
| SheetJS CE 0.20.3 | `src/SHEETJS-SOURCE.md`; one exact patch with upstream and shipped hashes |
| pdf-lib 1.17.1 / fontkit 1.1.1 | `src/PDF-SOURCE.md`; historical package versions, integrity strings, CSP patch and bundling command |
| xmldom 0.9.12 | `src/XMLDOM-SOURCE.md`; historical tarball and bundle hashes, bundling command |
| DejaVu Sans and Sans Bold | `src/PDF-SOURCE.md` and `src/PDF-LICENSES.txt`; embedded TTF hashes in the manifest |
| Noto Emoji, static weight 400 | `src/NOTO-EMOJI-SOURCE.txt` and `src/NOTO-EMOJI-LICENSE.txt`; variable-font source and derived TTF hashes |

The PDF.js and SheetJS builders were independently run on 2026-10-16 and
reproduced the committed runtime modules byte for byte. The other historical
build instructions have not been independently reproduced as part of this audit.
The Noto record does not pin a Google Fonts commit or the fontTools version, and
the DejaVu record does not pin an upstream archive. Their shipped bytes are checked,
but a fully reproducible source-to-font pipeline is not yet established. No missing
upstream release identifiers or tool versions have been inferred from checksums.
