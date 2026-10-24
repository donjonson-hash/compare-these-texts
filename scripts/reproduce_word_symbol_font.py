#!/usr/bin/env python3
"""Reproduce the small offline DOCX symbol font from a checksum-pinned upstream TTF."""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM_SHA = "7d5fb73b7ca67a6798101741f5d280a3d016a56a197afcd4199dbb57b4b82a21"
LICENSE_SHA = "b118dd41337806a5d4797052c77caf3bd096aed783e5eb21b4d11154351e1ac0"
COMMENT = "// CTT List Symbols: subset of Noto Sans Symbols 2, SIL OFL 1.1. See WORD-SYMBOL-FONT-SOURCE.md / NOTO-SYMBOLS-LICENSE.txt.\n"


def build_font(source):
    data = source.read_bytes()
    if hashlib.sha256(data).hexdigest() != UPSTREAM_SHA:
        raise ValueError("Upstream font checksum mismatch")
    import fontTools
    from fontTools import subset
    from fontTools.ttLib import TTFont
    if fontTools.__version__ != "4.61.1":
        raise ValueError("This recipe requires fontTools==4.61.1")
    font = TTFont(io.BytesIO(data), recalcTimestamp=False)
    options = subset.Options()
    options.hinting = False
    options.recalc_timestamp = False
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]
    options.name_languages = [0x409]
    worker = subset.Subsetter(options=options)
    worker.populate(unicodes=[0x20, 0x1F87A])
    worker.subset(font)
    # A modified subset has its own family name; original copyright and OFL stay.
    names = {1: "CTT List Symbols", 2: "Regular",
             3: "CTT-List-Symbols-Regular-Noto-2.008-Subset-1",
             4: "CTT List Symbols Regular", 6: "CTTListSymbols-Regular",
             16: "CTT List Symbols", 17: "Regular"}
    for record in font["name"].names:
        if record.nameID in names:
            record.string = names[record.nameID].encode(record.getEncoding())
    if set(font.getBestCmap()) != {0x20, 0x1F87A}:
        raise ValueError("Unexpected subset character coverage")
    output = io.BytesIO()
    font.save(output)
    return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream-ttf", type=Path, required=True)
    parser.add_argument("--upstream-license", type=Path, required=True)
    parser.add_argument("--write", action="store_true", help="Regenerate font assets; default verifies without writing")
    args = parser.parse_args()
    license_data = args.upstream_license.read_bytes()
    if hashlib.sha256(license_data).hexdigest() != LICENSE_SHA:
        raise ValueError("Upstream license checksum mismatch")
    raw = build_font(args.upstream_ttf)
    module = (COMMENT + "export default '" + base64.b64encode(raw).decode("ascii") + "';\n").encode()
    built = {"src/word-symbol-font.ttf": raw, "src/word-symbol-font.mjs": module,
             "src/NOTO-SYMBOLS-LICENSE.txt": license_data}
    manifest = json.loads((ROOT / "vendor-assets.json").read_text())
    for name, data in built.items():
        metadata = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        if name.endswith(".mjs"):
            metadata["decoded_font_sha256"] = hashlib.sha256(raw).hexdigest()
        if args.write:
            (ROOT / name).write_bytes(data)
            manifest["assets"][name] = metadata
        elif metadata != manifest["assets"].get(name) or data != (ROOT / name).read_bytes():
            raise ValueError(f"Rebuilt asset mismatch: {name}")
        print(f"PASS: {'generated' if args.write else 'reproduced'} {name} ({len(data)} bytes)")
    if args.write:
        manifest["assets"] = dict(sorted(manifest["assets"].items()))
        (ROOT / "vendor-assets.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, ImportError) as exc:
        raise SystemExit(f"Symbol font reproduction failed: {exc}") from exc
