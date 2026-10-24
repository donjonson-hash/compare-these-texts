# Offline Calibri-compatible Word PDF font

The unmodified Carlito Regular and Bold fonts, version 1.103, are bundled as
base64 modules. They are used only for DOCX text declaring Calibri or Carlito.
No font download or external service is used at runtime. Other font families
retain the existing fallback. Italic styling uses the existing synthetic skew.

Inputs are the Carlito-Regular.ttf and Carlito-Bold.ttf distributed with
LibreOffice 26.8 (share/fonts/truetype). Upstream project:
https://github.com/googlefonts/carlito. Exact decoded TTF hashes and module
hashes are pinned in vendor-assets.json. These are the 1.103 legacy font
files; current upstream releases may have different bytes.

License: SIL Open Font License 1.1; complete notice in CARLITO-LICENSE.txt.
The original fonts are unchanged; PDF embedding subsets per document.

To reproduce modules from the matching LibreOffice font files:

```sh
python3 scripts/reproduce_carlito_fonts.py --font-dir /path/to/share/fonts/truetype
```

The script validates input hashes before regenerating the exact module bytes
in memory and comparing them with the committed assets.
