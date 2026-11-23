# Offline SheetJS workbook reader and writer

`xlsx-vendor.mjs` is SheetJS Community Edition **0.20.3**, distributed under
Apache-2.0. The upstream header is retained; see `SHEETJS-LICENSE.txt`.

- Official distribution: <https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs>
- Official project: <https://sheetjs.com/>
- Upstream file SHA-256: `1a0fb062ee9781b13f6687371b202aaefc53b6ce55b530c027e01f9c087b77db`
- Shipped file SHA-256: `af7252a481b500eafd61da653362b96f6bb5c84441c1d651bdc40903d9f8bf96`

These are hashes of the ESM files, not a package tarball or npm integrity string.
The official 0.20.3 ESM file was downloaded and compared with the committed asset
on 2026-10-16. The entire difference is the one replacement below; no bundler is
involved.

## Local modification

In the worksheet XML parser, postpone decoding the cached value of a formula
string (`tag.t === 'str'`) until the existing string branch. This prevents a second
XML entity decoding pass from changing literal text such as `&amp;`.

```js
// Upstream:
if((cref=str_match_xml_ns(d, "v"))!= null && /*::cref != null && */cref[1] !== '') p.v=unescapexml(cref[1]);
// Shipped:
if((cref=str_match_xml_ns(d, "v"))!= null && /*::cref != null && */cref[1] !== '') p.v=tag.t === 'str' ? cref[1] : unescapexml(cref[1]); // CTT: formula strings are decoded once in the str branch.
```

## Reproduce and verify

From the repository root:

```sh
curl --fail --location https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs -o /tmp/ctt-sheetjs-0.20.3.mjs
python3 scripts/build_sheetjs_vendor.py /tmp/ctt-sheetjs-0.20.3.mjs --check
```

The script requires the upstream checksum, exactly one patch match, the final
checksum and byte equality with the committed asset. Omit `--check` to write the
verified result into `src/xlsx-vendor.mjs`. It does not download or execute source.
The application loads the committed ESM module locally, with no runtime download.
