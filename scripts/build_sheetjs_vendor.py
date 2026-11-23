#!/usr/bin/env python3
"""Reproduce the reviewed SheetJS 0.20.3 patches from a verified upstream file."""
import argparse
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM_SHA256 = "1a0fb062ee9781b13f6687371b202aaefc53b6ce55b530c027e01f9c087b77db"
BUNDLE_SHA256 = "af784b1cdf5b403ffaf5f7499537e2d069b9818e56f1a73b2abeab2d3521d8ed"
BEFORE = b'''if((cref=str_match_xml_ns(d, "v"))!= null && /*::cref != null && */cref[1] !== '') p.v=unescapexml(cref[1]);'''
AFTER = b'''if((cref=str_match_xml_ns(d, "v"))!= null && /*::cref != null && */cref[1] !== '') p.v=tag.t === 'str' ? cref[1] : unescapexml(cref[1]); // CTT: formula strings are decoded once in the str branch.'''

CACHE_BEFORE = b'if(tag.t == null && p.v === undefined) {'
CACHE_AFTER = b'// CTT: retain whether the file supplied a result before SheetJS fills a missing numeric cache with zero.\n\t\t\tif(opts.cttFormulaCache && (p.f != null || p.F != null)) {\n\t\t\t\tp.cttCached = p.v !== undefined || (tag.t === "str" && /<(?:\\w+:)?v\\b[^<>]*>/.test(d));\n\t\t\t\tif(!p.cttCached) tag.t = "z";\n\t\t\t}\n\t\t\tif(tag.t == null && p.v === undefined) {'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("upstream", type=Path, help="Downloaded upstream xlsx.mjs; see src/SHEETJS-SOURCE.md")
    parser.add_argument("--check", action="store_true", help="Compare with the committed asset without writing")
    args = parser.parse_args()
    source = args.upstream.read_bytes()
    if hashlib.sha256(source).hexdigest() != UPSTREAM_SHA256 or source.count(BEFORE) != 1 or source.count(CACHE_BEFORE) != 1:
        parser.exit(1, "Upstream SheetJS source checksum or patch match failed; no asset was written.\n")
    result = source.replace(BEFORE, AFTER).replace(CACHE_BEFORE, CACHE_AFTER)
    if hashlib.sha256(result).hexdigest() != BUNDLE_SHA256:
        parser.exit(1, "Final SheetJS checksum mismatch; no asset was written.\n")
    target = ROOT / "src/xlsx-vendor.mjs"
    if args.check:
        if target.read_bytes() != result:
            parser.exit(1, "Committed SheetJS bundle differs from the reproduced asset.\n")
    else:
        target.write_bytes(result)
    print(f"SheetJS 0.20.3: exact-byte rebuild {'verified' if args.check else 'written'} ({BUNDLE_SHA256})")


if __name__ == "__main__":
    main()
