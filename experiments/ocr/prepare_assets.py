#!/usr/bin/env python3
"""Copy the repository's existing offline PDF reader into the isolated pilot."""
from pathlib import Path
import hashlib
import json
import shutil
ROOT = Path(__file__).resolve().parent
FILES = ('pdf-reader.mjs', 'pdf-reader-compat.mjs', 'pdf-reader-vendor.mjs',
         'PDF-READER-LICENSE.txt', 'PDF-READER-SOURCE.md')
def prepare():
    target = ROOT / 'vendor'
    target.mkdir(exist_ok=True)
    hashes = {}
    for name in FILES:
        source = ROOT.parents[1] / 'src' / name
        shutil.copyfile(source, target / name)
        hashes[name] = hashlib.sha256(source.read_bytes()).hexdigest()
    (target / 'SHA256SUMS.json').write_text(json.dumps(hashes, indent=2) + '\n')
    print('Prepared local PDF reader assets.')
if __name__ == '__main__':
    prepare()
