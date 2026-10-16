#!/usr/bin/env python3
"""Verify committed vendor/font bytes against the reviewed offline manifest."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
FONT_EXPORT = re.compile(rb'''export default ['"]([A-Za-z0-9+/=]{1024,})['"]''')


def verify_assets(root=ROOT):
    root = Path(root)
    manifest = json.loads((root / "vendor-assets.json").read_text())
    if manifest.get("schema_version") != 1:
        raise ValueError("Unsupported vendor manifest schema")
    assets = manifest["assets"]
    # New vendored modules and font exports must not escape the checksum gate.
    discovered = {p.relative_to(root).as_posix() for p in (root / "src").rglob("*-vendor.mjs")}
    for p in (root / "src").rglob("*.mjs"):
        if "font" in p.name and FONT_EXPORT.search(p.read_bytes()):
            discovered.add(p.relative_to(root).as_posix())
    discovered.update(p.relative_to(root).as_posix() for p in (root / "src").rglob("*-LICENSE*.txt"))
    discovered.update(p.relative_to(root).as_posix() for p in (root / "src").rglob("*")
                      if p.is_file() and p.suffix.lower() in {".ttf", ".otf", ".woff", ".woff2"})
    if discovered != set(assets):
        raise ValueError(f"Vendor manifest coverage mismatch: unlisted={sorted(discovered - set(assets))}, missing={sorted(set(assets) - discovered)}")
    for name, expected in assets.items():
        data = (root / name).read_bytes()
        if len(data) != expected["bytes"] or hashlib.sha256(data).hexdigest() != expected["sha256"]:
            raise ValueError(f"Vendor checksum mismatch: {name}")
        if "decoded_font_sha256" in expected:
            match = FONT_EXPORT.search(data)
            if not match or hashlib.sha256(base64.b64decode(match[1], validate=True)).hexdigest() != expected["decoded_font_sha256"]:
                raise ValueError(f"Decoded font checksum mismatch: {name}")
    return len(assets)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help="Repository root (defaults to this script's repository)")
    args = parser.parse_args()
    try:
        count = verify_assets(args.root)
    except (ValueError, KeyError, OSError) as exc:
        parser.exit(1, f"Vendor verification failed: {exc}\n")
    print(f"Verified {count} vendor, font and license assets (SHA-256).")
