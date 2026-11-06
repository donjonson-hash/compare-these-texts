"""Build the independent scanner extension from the reviewed local OCR modules."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import struct
import sys
import zipfile
import zlib

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "standalone-scanner"
OUT = APP / "dist"
sys.path.insert(0, str(ROOT / "scripts"))
from build_ocr_assets import build_ocr_assets

MODULES = """ocr-document.mjs ocr-review.mjs ocr-runtime.mjs ocr-image-input.mjs
ocr-enhance.mjs ocr-enhance-core.mjs ocr-enhance-worker.mjs ocr-worker.mjs
ocr-layout.mjs ocr-document-model.mjs ocr-corrections.mjs ocr-pdf-export.mjs
ocr-pdf-input.mjs pdf-reader.mjs pdf-reader-compat.mjs pdf-reader-vendor.mjs
pdf-vendor.mjs pdf-font.mjs session-store.mjs session-ui.mjs""".split()
SHELL = ["index.html", "scanner.css", "background.js", "scanner-app.mjs", "scanner-entry.mjs", "scanner-session.mjs"]
LICENSES = ["PDF-LICENSES.txt", "PDF-READER-LICENSE.txt", "PDF-READER-SOURCE.md", "PDF-SOURCE.md"]


def png_icon(size):
    # Original geometric document icon; no external font or image dependency.
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            a, b = x / size, y / size
            color = (23, 102, 94, 255)
            if .25 <= a <= .75 and .15 <= b <= .86:
                color = (255, 255, 255, 255)
            if .33 <= a <= .65 and any(v <= b <= v + .035 for v in [.33, .44, .64]):
                color = (137, 165, 159, 255)
            if .13 <= a <= .87 and .53 <= b <= .58:
                color = (101, 205, 191, 255)
            row.extend(color)
        rows.append(b"\0" + row)
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")


def build():
    if OUT.is_symlink():
        raise RuntimeError("Refusing to replace symlink output")
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    for name in SHELL:
        shutil.copyfile(APP / name, OUT / name)
    for name in MODULES + ["ocr-review.css", "ocr-document.css"]:
        text = (ROOT / "src" / name).read_text()
        if "vendor" not in name and name != "pdf-font.mjs":
            text = text.replace("./ocr-import.mjs", "./ocr-text.mjs")
            text = text.replace("Compare Two Texts", "Document Scanner")
            text = text.replace("ctt.ocr.preferences.", "document-scanner.ocr.preferences.")
            text = text.replace("no text to compare", "no document text")
        (OUT / name).write_text(text)
    # Retain only text validation/export; the comparison import adapter and all
    # Word/spreadsheet parsers are intentionally absent from this application.
    text_adapter = (ROOT / "src/ocr-import.mjs").read_text().split("export async function probeOcrPdf", 1)[0]
    (OUT / "ocr-text.mjs").write_text(text_adapter)
    shutil.copyfile(ROOT / "LICENSE", OUT / "LICENSE.txt")
    for name in LICENSES:
        shutil.copyfile(ROOT / "src" / name, OUT / name)
    (OUT / "NOTICE.txt").write_text("Document Scanner 0.1.0\n\nIndependent extension using the reviewed OCR components developed in Compare Two Texts.\nApplication terms: LICENSE.txt.\nPDF rendering: PDF-READER-LICENSE.txt and PDF-READER-SOURCE.md.\nPDF creation and bundled DejaVu font: PDF-LICENSES.txt and PDF-SOURCE.md.\nOCR runtime, engines and language data: ocr-assets/licenses/ and ocr-assets/provenance.json.\nNo document-comparison interface or Chrome Web Store identity is included.\n")
    assets = build_ocr_assets(OUT)
    (OUT / "icons").mkdir()
    for size in [16, 32, 48, 128]:
        (OUT / f"icons/{size}.png").write_bytes(png_icon(size))
    manifest = {
        "manifest_version": 3,
        "name": "Document Scanner — Local OCR & PDF",
        "short_name": "Document Scanner",
        "version": "0.1.0",
        "description": "Recognize English and Russian scans locally. Review and correct text, improve images, and export a searchable PDF.",
        "minimum_chrome_version": "120",
        "icons": {str(n): f"icons/{n}.png" for n in [16, 32, 48, 128]},
        "action": {"default_title": "Open Document Scanner", "default_icon": {str(n): f"icons/{n}.png" for n in [16, 32]}},
        "background": {"service_worker": "background.js"},
        "content_security_policy": {"extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'none'"},
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    for path in OUT.glob("*.mjs"):
        if "vendor" in path.name or path.name == "pdf-font.mjs":
            continue
        for name in re.findall(r"['\"]\./([^'\"]+\.(?:mjs|js))['\"]", path.read_text()):
            if not (OUT / name).is_file():
                raise RuntimeError(f"Missing local module {name} in {path.name}")
    provenance = {"product": "Document Scanner", "version": "0.1.0", "ocr_assets": assets,
                  "source_sha256": {name: hashlib.sha256((ROOT / "src" / name).read_bytes()).hexdigest() for name in MODULES},
                  "standalone_files_sha256": {name: hashlib.sha256((APP / name).read_bytes()).hexdigest() for name in SHELL}}
    (OUT / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    artifacts = APP / "artifacts"
    artifacts.mkdir(exist_ok=True)
    archive = artifacts / "document-scanner-0.1.0.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as package:
        for path in sorted(OUT.rglob("*")):
            if path.is_file():
                package.write(path, path.relative_to(OUT))
    print(json.dumps({"directory": str(OUT), "archive": str(archive), "bytes": archive.stat().st_size, "files": len(list(OUT.rglob('*')))}))


if __name__ == "__main__":
    build()
