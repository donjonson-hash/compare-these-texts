# Reproduce the shipped font bytes

The recipe below was verified on 2026-10-16 with Python 3.12 and fontTools
4.61.1. It reproduces all three committed font modules byte for byte. It does
not replace fonts, change glyphs or rewrite the checksum baseline.

## Verified inputs

| Input | Pinned source | SHA-256 |
| --- | --- | --- |
| DejaVu Sans / Sans Bold | Ubuntu `fonts-dejavu-core_2.37-8_all.deb` | `40049660c194f3b8a2541fc7369efebb10e9f94bdac836a2f38fafedd10fa73a` |
| Noto Emoji variable 3.002 | Google Fonts commit `b979dba422e445492b0eb9951ac52ee0b4d648c3`, `ofl/notoemoji/NotoEmoji[wght].ttf` | `de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551` |

The downloaded Ubuntu package reproduces the DejaVu bytes originally taken
from the build machine. This is a newly verified source, not a claim that the
historical build recorded that package. Likewise, fontTools 4.61.1 is a verified
reproduction tool version; the original tool version was not recorded.

Noto is instantiated at weight 400. Disable automatic timestamp recalculation
and set `head.modified` to the shipped value `3873751297` (OpenType seconds since
1904). Without this, saving the font introduces a changing timestamp. No glyph,
outline, naming or layout patch is applied.

The `CTT font reproduction` workflow repeats this check on changes to the
recipe, font assets or manifest, and can also be run manually. Its network
downloads are separate from the ordinary offline vendor verification gate.

## Run on Linux

Requirements: Python 3.12, venv/pip, curl, and `dpkg-deb`.
From the repository root, use a temporary directory outside the checkout:

```sh
font_work=$(mktemp -d)
python3 -m venv "$font_work/venv"
"$font_work/venv/bin/python" -m pip install 'fonttools==4.61.1'
curl --fail --location 'https://archive.ubuntu.com/ubuntu/pool/main/f/fonts-dejavu/fonts-dejavu-core_2.37-8_all.deb' -o "$font_work/dejavu.deb"
curl --fail --location 'https://raw.githubusercontent.com/google/fonts/b979dba422e445492b0eb9951ac52ee0b4d648c3/ofl/notoemoji/NotoEmoji%5Bwght%5D.ttf' -o "$font_work/noto.ttf"
"$font_work/venv/bin/python" scripts/reproduce_fonts.py --dejavu-deb "$font_work/dejavu.deb" --noto-variable "$font_work/noto.ttf"
python3 scripts/verify_vendor.py
```

The script checks upstream archive/font hashes before parsing, then checks
decoded TTF hashes, module hashes and exact equality with committed modules.
It exits nonzero for wrong inputs, a wrong fontTools version or any mismatch.
Downloads are explicit build-time operations; the script makes no network
requests and document processing remains offline. The downloaded package and
font are used only after matching the reviewed hashes. Retain the existing
DejaVu and SIL OFL license notices with the font assets.
