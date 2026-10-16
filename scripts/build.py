"""Build the static website and both offline extensions from tracked CTT source."""
from pathlib import Path
import hashlib
import html
import json
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src"
OUTPUT = ROOT / "dist"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    # OUTPUT is a fixed, generated directory; never write into the source tree.
    if OUTPUT.is_symlink():
        raise RuntimeError("Refusing to replace a symlink at dist")
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree(SOURCE, OUTPUT)
    # One authoritative license supplies the website and every downloadable copy.
    license_text = (ROOT / "LICENSE").read_text()
    shutil.copyfile(ROOT / "LICENSE", OUTPUT / "LICENSE.txt")
    terms_page = OUTPUT / "terms/index.html"
    template = terms_page.read_text()
    marker = "<!-- CTT-LICENSE -->"
    if template.count(marker) != 1:
        raise RuntimeError("Terms page must contain one license insertion marker")
    paragraphs = []
    for block in license_text.strip().split("\n\n"):
        text = " ".join(block.splitlines())
        tag = "h2" if text.partition(". ")[0].isdigit() else "p"
        paragraphs.append(f"<{tag}>{html.escape(text)}</{tag}>")
    terms_page.write_text(template.replace(marker, "\n".join(paragraphs)))
    (OUTPUT / "downloads").mkdir()
    subprocess.run([sys.executable, str(ROOT / "scripts/package_extension.py")], check=True)
    release = json.loads((ROOT / "release.json").read_text())
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    dirty = bool(subprocess.check_output(["git", "status", "--porcelain", "--", "."], cwd=ROOT, text=True).strip())
    record = {
        "product": "Compare These Texts",
        "version": release["version"],
        "source_commit": revision,
        "source_dirty": dirty,
        "build_command": "npm ci --ignore-scripts && npm run build",
        "source_files_sha256": {str(p.relative_to(SOURCE)): sha256(p) for p in sorted(SOURCE.rglob("*")) if p.is_file()},
        "license_sha256": sha256(ROOT / "LICENSE"),
        "archives_sha256": {p.name: sha256(p) for p in sorted((OUTPUT / "downloads").glob("*.zip"))},
    }
    (OUTPUT / "release").mkdir()
    (OUTPUT / "release/provenance.json").write_text(json.dumps(record, indent=2) + "\n")
    print(f"Built CTT {release['version']}; source_commit={revision}; source_dirty={dirty}")


if __name__ == "__main__":
    build()
