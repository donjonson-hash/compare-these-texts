#!/usr/bin/env python3
"""Reproduce all three embedded font modules without modifying shipped assets."""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
DEJAVU_SHA = "40049660c194f3b8a2541fc7369efebb10e9f94bdac836a2f38fafedd10fa73a"
NOTO_SHA = "de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551"


def checked_input(path, expected):
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f"Upstream checksum mismatch: {path.name}")
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dejavu-deb", required=True, type=Path)
    parser.add_argument("--noto-variable", required=True, type=Path)
    args = parser.parse_args()
    # Verify downloaded bytes before handing them to archive/font parsers.
    dejavu = checked_input(args.dejavu_deb, DEJAVU_SHA)
    noto = checked_input(args.noto_variable, NOTO_SHA)
    import fontTools
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    if fontTools.__version__ != "4.61.1":
        raise ValueError("This recipe requires fontTools==4.61.1")
    with tempfile.TemporaryDirectory(prefix="ctt-fonts-") as folder:
        temp = Path(folder)
        archive = temp / "dejavu.deb"
        archive.write_bytes(dejavu)
        subprocess.run(["dpkg-deb", "--extract", str(archive), str(temp / "unpacked")], check=True)
        fonts = temp / "unpacked/usr/share/fonts/truetype/dejavu"
        font = TTFont(io.BytesIO(noto), recalcTimestamp=False)
        font = instantiateVariableFont(font, {"wght": 400}, inplace=False)
        # Preserve the shipped head.modified value (OpenType seconds since 1904).
        # Original build time is metadata, not a glyph or layout modification.
        font["head"].modified = 3873751297
        output = io.BytesIO()
        font.save(output)
        built = {
            "src/pdf-font.mjs": (
                (fonts / "DejaVuSans.ttf").read_bytes(),
                "// Unmodified DejaVu Sans. License and provenance: PDF-LICENSES.txt / PDF-SOURCE.md\n", '"'),
            "src/word-font-bold.mjs": (
                (fonts / "DejaVuSans-Bold.ttf").read_bytes(),
                "// DejaVu Sans Bold, bundled under the font license in PDF-LICENSES.txt.\n", "'"),
            "src/sheet-emoji-font.mjs": (
                output.getvalue(),
                "// Noto Emoji, static weight 400, SIL OFL 1.1. See NOTO-EMOJI-LICENSE.txt.\n", "'"),
        }
        manifest = json.loads((ROOT / "vendor-assets.json").read_text())["assets"]
        for name, (raw, comment, quote) in built.items():
            expected = manifest[name]
            if hashlib.sha256(raw).hexdigest() != expected["decoded_font_sha256"]:
                raise ValueError(f"Rebuilt TTF mismatch: {name}")
            module = (comment + "export default " + quote + base64.b64encode(raw).decode("ascii") + quote + ";\n").encode("utf-8")
            if len(module) != expected["bytes"] or hashlib.sha256(module).hexdigest() != expected["sha256"]:
                raise ValueError(f"Rebuilt module checksum mismatch: {name}")
            if module != (ROOT / name).read_bytes():
                raise ValueError(f"Rebuilt module differs from repository: {name}")
            print(f"PASS: reproduced {name} byte for byte")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, ImportError, subprocess.CalledProcessError) as exc:
        raise SystemExit(f"Font reproduction failed: {exc}") from exc
