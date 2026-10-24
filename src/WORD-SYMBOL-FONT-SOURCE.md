# CTT List Symbols

`word-symbol-font.ttf` and the identical decoded font in `word-symbol-font.mjs`
contain only U+0020 SPACE and U+1F87A WIDE-HEADED RIGHTWARDS HEAVY BARB ARROW
(plus the required `.notdef` glyph). The latter is the Unicode encoding of
Wingdings byte 0xE8, documented as ID 1232 in
[Unicode WG2 N4363](https://www.unicode.org/wg2/docs/n4363.pdf).
The font is available offline in the website and both extension packages.

The source is Noto Sans Symbols 2 Regular, version 2.008, from the official
[google/fonts repository](https://github.com/google/fonts/tree/7b6724ac7ececc713e9ba93af309f7520c9a80a3/ofl/notosanssymbols2).
Pinned commit: `7b6724ac7ececc713e9ba93af309f7520c9a80a3` (2023-10-13).

- [Original TTF](https://raw.githubusercontent.com/google/fonts/7b6724ac7ececc713e9ba93af309f7520c9a80a3/ofl/notosanssymbols2/NotoSansSymbols2-Regular.ttf)
  SHA-256: `7d5fb73b7ca67a6798101741f5d280a3d016a56a197afcd4199dbb57b4b82a21`.
- [Original OFL license](https://raw.githubusercontent.com/google/fonts/7b6724ac7ececc713e9ba93af309f7520c9a80a3/ofl/notosanssymbols2/OFL.txt)
  SHA-256: `b118dd41337806a5d4797052c77caf3bd096aed783e5eb21b4d11154351e1ac0`.
- Copyright 2022 The Noto Project Authors (https://github.com/notofonts/symbols).
  The unmodified SIL Open Font License 1.1 is included as `NOTO-SYMBOLS-LICENSE.txt`.

The subset is renamed **CTT List Symbols**. Original outlines and advances are
preserved; unused glyphs, layout records and hinting are removed. Copyright and
license metadata are retained. The original font timestamp is preserved, so
rebuilding does not depend on the current clock.

## Reproduction

Download the two pinned upstream files above and install `fontTools==4.61.1`.
From the repository root, run:

```sh
python scripts/reproduce_word_symbol_font.py \
  --upstream-ttf /path/to/NotoSansSymbols2-Regular.ttf \
  --upstream-license /path/to/OFL.txt
python scripts/verify_vendor.py
```

The recipe verifies upstream hashes before parsing, checks exact character
coverage, rebuilds both assets, and compares them byte for byte with the shipped
files and `vendor-assets.json`. It performs no network access. Add `--write`
only when intentionally regenerating the three assets and their manifest entries.

The `.ttf` serves the browser's `CTT List Symbols` font face. The `.mjs` default
export is the same TTF encoded as base64 for deterministic PDF embedding.
Neither requires a third-party font service or a `data:` font URL.
