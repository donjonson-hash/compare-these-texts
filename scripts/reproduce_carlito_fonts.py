"""Verify byte-for-byte reproduction of unmodified bundled Carlito fonts."""
import argparse
import base64
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--font-dir', required=True, type=Path)
args = parser.parse_args()
manifest = json.loads((root / 'vendor-assets.json').read_text())['assets']
for style in ['Regular', 'Bold']:
    raw = (args.font_dir / f'Carlito-{style}.ttf').read_bytes()
    path = f'src/word-calibri-{style.lower()}-font.mjs'
    expected = manifest[path]
    if hashlib.sha256(raw).hexdigest() != expected['decoded_font_sha256']:
        raise SystemExit(f'Carlito input checksum mismatch: {style}')
    module = (f'// Unmodified Carlito {style} 1.103; SIL OFL 1.1. See CARLITO-LICENSE.txt / CARLITO-SOURCE.md.\nexport default "' + base64.b64encode(raw).decode() + '";\n').encode()
    if module != (root / path).read_bytes() or hashlib.sha256(module).hexdigest() != expected['sha256']:
        raise SystemExit(f'Carlito module mismatch: {style}')
    print(f'PASS: reproduced {path} byte for byte')
