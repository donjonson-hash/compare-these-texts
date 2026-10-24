# Offline color emoji for PDF

`emoji-color-vendor.mjs` is a generated, local-only collection of color glyphs.
No CDN, browser/system emoji font, canvas rasterizer, LLM, or uploaded document
is used to obtain these graphics at runtime. Only glyphs used in a document are
embedded into its PDF.

## Sources and licenses

- Font: Noto Color Emoji, version 2.051; tag `v2.051`.
- Upstream commit: `8998f5dd683424a73e2314a8c1f1e359c19e8742`.
- Original TTF: <https://raw.githubusercontent.com/googlefonts/noto-emoji/8998f5dd683424a73e2314a8c1f1e359c19e8742/fonts/NotoColorEmoji.ttf>.
- TTF SHA256: `72a635cb3d2f3524c51620cdde406b217204e8a6a06c6a096ff8ed4b5fd6e27b`.
- Font copyright: Copyright 2022 Google Inc.
- Font and derived bitmap glyphs: SIL Open Font License 1.1, included as
  `NOTO-COLOR-EMOJI-LICENSE.txt` (unmodified upstream `fonts/LICENSE`).
- License source: <https://raw.githubusercontent.com/googlefonts/noto-emoji/8998f5dd683424a73e2314a8c1f1e359c19e8742/fonts/LICENSE>.
- License SHA256: `6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2`.
- Unicode Emoji 17.0 sequences: <https://raw.githubusercontent.com/unicode-org/unicodetools/48afe632bf194a20bcd27c3488b49dc23274b684/unicodetools/data/emoji/17.0/emoji-test.txt>.
- Unicode data SHA256: `1d8a944f88d7952f7ef7c5167fef3c67995bcae24543949710231b03a201acda`.
- Unicode data license: Unicode License V3, included as
  `UNICODE-COLOR-EMOJI-LICENSE.txt` (unmodified upstream root `LICENSE`).
- Unicode license source: <https://raw.githubusercontent.com/unicode-org/unicodetools/48afe632bf194a20bcd27c3488b49dc23274b684/LICENSE>.
- Unicode license SHA256: `fe5c62b543e287981db198f2acfa0ca732d12591a1024536dc8fd85dacd77104`.

## Transformation

The build-only generator shapes the Unicode sequence with HarfBuzz and extracts
the corresponding CBDT bitmap from the pinned font with fontTools. It does not
assume that glyph IDs match the separate monochrome font used for searchable text.

The input contains one 109 ppem strike, with format-17 PNG glyphs and horizontal
metrics. Indexed-color PNGs are resized to a maximum of 72 pixels on each edge,
using nearest-neighbor resampling to retain their palette and transparency, then
saved with lossless PNG compression. Resizing reduces spatial resolution; this
is not a byte-identical copy of the upstream glyph. The original 136 by 128 glyph
box and baseline are retained as metric ratios, so image dimensions do not
change text advance or paragraph layout. This is a fixed Noto visual style, not
an exact reproduction of an arbitrary operating system's emoji artwork.

Fully-qualified sequences are preferred. Lookup keys omit U+FE0F, retain all
other code points, and are lowercase hexadecimal joined with hyphens. U+FE0E
is never stripped. The source's complete Unicode string is still preserved by
the PDF text layer; key canonicalization only chooses a graphic.

The generated module contains 3,953 lookup keys and 3,923 unique PNG/metric
records. All canonical Emoji 17.0 entries in the input shape to one available
color glyph. Runtime support is also bounded by the searchable monochrome font;
this collection alone does not expand that font's supported Unicode range.

`images` records contain `png` (base64), `left`, `bottom`, `width`, and `height`.
Metric values are relative to the color glyph's horizontal advance:

- `left = BearingX / Advance`
- `bottom = (BearingY - height) / Advance`
- `width = width / Advance`
- `height = height / Advance`

At runtime these values are scaled by the existing monochrome text advance.
Graphics stay upright, including in italic text. Duplicate graphics with the
same metrics are stored once.

## Reproduction

Verified environment: Python 3.12.14, fontTools 4.61.1, Pillow 12.3.0,
uharfbuzz 0.52.0, Pillow zlib 1.3 (the PNG encoder), Python zlib runtime
1.3.2. Different compression-library builds
can produce different PNG bytes; the shipped module hash is authoritative.

The generator verifies both source SHA256 values and the three Python package
versions before processing. Use downloaded copies of the exact files above:

```sh
python3 -m venv /tmp/ctt-color-emoji-venv
/tmp/ctt-color-emoji-venv/bin/pip install fonttools==4.61.1 Pillow==12.3.0 uharfbuzz==0.52.0
/tmp/ctt-color-emoji-venv/bin/python scripts/reproduce_color_emoji.py \
  --font /path/to/NotoColorEmoji.ttf \
  --emoji-test /path/to/emoji-test.txt \
  --size 72 \
  --output /tmp/emoji-color-vendor.mjs
cmp src/emoji-color-vendor.mjs /tmp/emoji-color-vendor.mjs
```

Generated module SHA256:
`cf798502050b5482624b97444c0c849bcb3d77d597d292766979da94bd9365bd`.
The module contains about 5.97 MB of PNG bytes before base64 encoding. Inputs and
build-only Python dependencies are not included in the website or extensions.
