"""Derive the Edge Add-ons package from the built Chrome ZIP.

Edge caps extension names at 45 characters and asks for a description and logo
for every language in a package, so this listing is English only. The extension
code, permissions and CSP stay byte-identical to the Chrome build.
"""
from pathlib import Path
import json,zipfile
root=Path(__file__).resolve().parents[1]
release=json.loads((root/'release.json').read_text())
source=root/'dist'/'downloads'/f"ctt-chrome-{release['version']}.zip"
archive=root/'artifacts'/f"ctt-edge-{release['version']}.zip"
if len(release['short_name'])>45:raise RuntimeError('Edge name exceeds 45 characters')
archive.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(source) as chrome,zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
 for item in chrome.infolist():
  if item.filename.startswith('_locales/'):continue
  content=chrome.read(item.filename)
  if item.filename=='manifest.json':
   manifest=json.loads(content)
   del manifest['default_locale']
   manifest.update(name=release['short_name'],description=release['description'])
   manifest['action']['default_title']='CTT — Compare & Edit'
   content=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
  z.writestr(item,content)
print(archive)
