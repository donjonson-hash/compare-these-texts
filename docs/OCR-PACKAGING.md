# Local OCR asset packaging

The website and extension packages include Tesseract.js 7.0.0, Tesseract.js-core 7.0.0 and the English/Russian 1.0.0 best_int language packages. Root package-lock.json pins npm tarball integrity. Run `npm ci --ignore-scripts` followed by `npm run build`.

`scripts/build_ocr_assets.py` copies a closed file list into `dist/ocr-assets/`: the browser module, worker, three LSTM core variants (baseline, SIMD, relaxed SIMD), two language models, package metadata and license notices. The application uses OEM 1 and only the listed languages/layout modes. Assets are loaded lazily from this local directory. CDN defaults are overridden explicitly; worker blob URLs and language caching are disabled. No model or executable code is downloaded from third-party origins at runtime.

The generated `ocr-assets/provenance.json` records package versions and SHA-256 hashes for every copied file. Chrome and Firefox ZIPs preserve the entire directory and verify byte equality during `npm run check`. Edge derives from the Chrome package.

Tesseract.js and its core are Apache-2.0. The language npm metadata declares MIT but omits a license file; the reviewed upstream Apache-2.0 tessdata license is bundled from experiments/ocr/TESSDATA-LICENSE. Source details and package metadata are retained beside the assets.

## Content Security Policy

The main workspace needs `script-src 'self' 'wasm-unsafe-eval'`, `connect-src 'self'`, and `worker-src 'self'`. The WASM token permits WebAssembly compilation; it does not enable JavaScript eval. The connection directive permits only same-origin packaged model/core reads. No host permissions are requested. The other extension pages retain their existing more restrictive meta policies. Website Analytics is added only after extension packaging and is removed correctly when repackaging website output.

A browser test must verify OCR under the real installed extension CSP; static policy checks alone do not establish runtime compatibility. Firefox validation remains separate from Chromium validation.


## Reviewed recognition controls

The import dialog offers English, Russian and Russian + English, with a separate saved choice for each input. PDFs render at a target 300 dpi, bounded to 12 million pixels and 4000 pixels per axis. Selecting an area renders that PDF region directly at the bounded target resolution; image regions use the source pixels. Area results remain separate until explicitly inserted into the checked page text. Page text and area drafts survive page navigation.

Use the optional PDF OCR checkbox when a partial text layer omits a scanned body. The default native-text PDF path remains available. PNG/JPEG headers, dimensions and EXIF metadata are inspected before bitmap decoding, with 10 MiB / 12 million pixel limits. Checked text is validated before the review dialog closes, and an incompatible replacement preserves the existing comparison and Undo history.

A first-party module worker owns the nested Tesseract worker. Aborting initialization or recognition, a model error, or the 120-second operation timeout terminates both. `npm run check:ocr` runs the website/installed Chromium extension flow plus runtime cleanup and import-boundary regressions. Firefox runtime coverage remains separate.
