"""Copy pinned local OCR runtime assets; never fetch during the build."""
from pathlib import Path
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
VERSIONS = {"tesseract.js": "7.0.0", "tesseract.js-core": "7.0.0", "@tesseract.js-data/eng": "1.0.0", "@tesseract.js-data/rus": "1.0.0"}


def build_ocr_assets(output):
    output = Path(output)
    destination = output / "ocr-assets"
    if destination.exists():
        shutil.rmtree(destination)
    hashes = {}
    def copy(package, source, target):
        path = ROOT / "node_modules" / package / source
        data = path.read_bytes()
        dest = destination / target
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        hashes[target] = hashlib.sha256(data).hexdigest()
    for package, version in VERSIONS.items():
        meta = ROOT / "node_modules" / package / "package.json"
        if not meta.is_file():
            raise RuntimeError("Missing OCR dependency. Run npm ci --ignore-scripts before building.")
        if json.loads(meta.read_text())["version"] != version:
            raise RuntimeError(f"Unexpected {package} version; restore the lockfile and run npm ci.")
        copy(package, "package.json", f"licenses/{package.replace('/', '-')}-package.json")
    copy("tesseract.js", "dist/tesseract.esm.min.js", "tesseract-vendor.mjs")
    copy("tesseract.js", "dist/worker.min.js", "worker.min.js")
    copy("tesseract.js", "LICENSE.md", "licenses/TESSERACT-LICENSE.md")
    copy("tesseract.js-core", "LICENSE", "licenses/TESSERACT-CORE-LICENSE.txt")
    # OEM=1 uses only the LSTM engine. Keep all three CPU capabilities local.
    for variant in ["lstm", "simd-lstm", "relaxedsimd-lstm"]:
        for extension in ["wasm.js", "wasm"]:
            name = f"tesseract-core-{variant}.{extension}"
            copy("tesseract.js-core", name, "core/" + name)
    for lang in ["eng", "rus"]:
        copy(f"@tesseract.js-data/{lang}", f"4.0.0_best_int/{lang}.traineddata.gz", f"lang/{lang}.traineddata.gz")
        copy(f"@tesseract.js-data/{lang}", "README.md", f"licenses/{lang}-README.md")
    # The model npm tarballs omit the upstream license; preserve the reviewed copy.
    license_source = ROOT / "experiments/ocr/TESSDATA-LICENSE"
    data = license_source.read_bytes()
    target = "licenses/TESSDATA-LICENSE.txt"
    (destination / target).write_bytes(data)
    hashes[target] = hashlib.sha256(data).hexdigest()
    (destination / "provenance.json").write_text(json.dumps({"packages": VERSIONS, "source": "npm packages pinned with integrity hashes in package-lock.json", "files_sha256": hashes}, indent=2) + "\n")
    return {"packages": VERSIONS, "files": len(hashes), "bytes": sum(p.stat().st_size for p in destination.rglob("*") if p.is_file())}


if __name__ == "__main__":
    print(json.dumps(build_ocr_assets(ROOT / "dist")))
