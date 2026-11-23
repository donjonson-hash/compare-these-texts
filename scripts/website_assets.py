"""Version the site's comparison UI and its spreadsheet/worker dependency chain."""
import hashlib
import json
import re

# Dependencies precede their importers. Include the single-workbook editor as
# it shares the same reader with the comparison worker and review UI.
RUNTIME = (
    "xlsx-vendor.mjs", "xlsx-source.mjs", "i18n.js", "engine.mjs", "sheet-document.mjs",
    "simple-sheet.mjs", "sheet-review.mjs", "worker.mjs", "single-editor.mjs",
    "app.js", "transport.js", "single-entry.js", "navigation.js", "site.css",
)
HOME_ENTRIES = {"app.js", "i18n.js", "transport.js", "single-entry.js", "navigation.js", "site.css"}
NAMES = "|".join(re.escape(name) for name in RUNTIME)
MODULE_URL = re.compile(rf"""(?P<quote>['"])(?P<relative>\./)?(?P<name>{NAMES})(?P=quote)""")
HTML_URL = re.compile(rf'(\b(?:src|href)=")((?:\.\./)*|/)(?P<name>{NAMES})(")')


def short_hash(data):
    return hashlib.sha256(data).hexdigest()[:16]


def runtime_assets(root):
    """Yield the immutable website filename and bytes for each canonical asset."""
    names = {}
    for name in RUNTIME:
        path = root / name
        code = path.read_text()
        if name == "i18n.js":
            # These large catalogs remain single files. Each URL varies with
            # its own bytes, so an unrelated translation keeps its cache hit.
            versions = {
                file.stem.removeprefix("i18n-"): short_hash(file.read_bytes())
                for file in sorted(root.glob("i18n-*.mjs"))
            }
            if not versions:
                raise ValueError("No translation catalogs were built")
            loader = '"i18n-"+code+".mjs"'
            if code.count(loader) != 1:
                raise ValueError("Expected one dynamic catalog URL in the minified i18n loader")
            code = code.replace(loader, '"i18n-"+code+".mjs?v="+' + json.dumps(versions, separators=(",", ":")) + '[code]')

        def rewrite(match):
            dependency = match["name"]
            if dependency not in names:
                raise ValueError(f"Missing or unordered dependency {dependency} in {name}")
            return match["quote"] + (match["relative"] or "") + names[dependency] + match["quote"]

        data = MODULE_URL.sub(rewrite, code).encode()
        filename = f"{path.stem}.{short_hash(data)}{path.suffix}"
        names[name] = filename
        yield name, filename, data


def fingerprint_website_assets(root):
    assets = {}
    for name, filename, data in runtime_assets(root):
        (root / filename).write_bytes(data)
        assets[name] = filename
    for page in root.rglob("*.html"):
        source = page.read_text()
        updated = HTML_URL.sub(lambda m: m[1] + m[2] + assets[m["name"]] + m[4], source)
        if source != updated:
            page.write_text(updated)
    return assets
