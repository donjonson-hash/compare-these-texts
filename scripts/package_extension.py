"""Package the site's English offline engine for Chrome and Firefox."""
from pathlib import Path
import json,zipfile,re
from store_metadata import message_files
from website_analytics import strip_website_analytics
root=Path(__file__).resolve().parents[1];dist=root/'dist';sources=root/'extension-package'
release=json.loads((root/'release.json').read_text())
version=release['version']
localized_files=message_files()
for target in ['chrome','firefox']:
 manifest=json.loads((sources/(target+'-manifest.json')).read_text())
 manifest.update({key:release[key] for key in ('name','version','description','homepage_url')})
 manifest['action']['default_title']='CTT — Compare & Edit'
 if target=='chrome':
  manifest.update(name='__MSG_extensionName__',description='__MSG_extensionDescription__',default_locale='en')
  manifest['action']['default_title']='__MSG_actionTitle__'
 # Preserve the Firefox ID and permission-free offline CSP.
 files={p.name:p.read_bytes() for p in dist.iterdir() if p.is_file() and p.name not in ('robots.txt','sitemap.xml','_headers')}
 for name in files:
  if name.endswith('.html'):files[name]=strip_website_analytics(files[name].decode()).encode()
 if target=='chrome':files.update(localized_files)
 html=files['index.html'].decode().replace('href="/"','href="index.html"').replace('href="/site.css"','href="site.css"').replace('href="/favicon.svg"','href="favicon.svg"').replace('src="/favicon.svg"','src="favicon.svg"')
 html=html.replace('href="/extension/"','href="https://comparethesetexts.com/extension/"').replace('href="/privacy/"','href="privacy.html"').replace('href="/support/"','href="support.html"').replace('href="/terms/"','href="terms.html"')
 html=html.replace('>Extension</a>','>Website</a>').replace('href="https://comparethesetexts.com/extension/">Website','href="https://comparethesetexts.com/">Website')
 html=re.sub(r'<a href="(https://[^"]+)"',r'<a href="\1" target="_blank" rel="noopener noreferrer"',html)
 html=html.replace('</head>', '<script type="module" src="welcome-entry.mjs"></script></head>')
 html=html.replace('<nav aria-label="Footer navigation">', '<nav aria-label="Footer navigation"><a id="getting-started" href="welcome.html" target="_blank" rel="noopener noreferrer">Getting started</a>')
 files['index.html']=html.encode();files['manifest.json']=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
 for page in ['privacy','support','terms']:
  content=strip_website_analytics((dist/page/'index.html').read_text())
  for before,after in {'/':'index.html','/style.css':'style.css','/site.css':'site.css','/favicon.svg':'favicon.svg','/privacy/':'privacy.html','/support/':'support.html','/terms/':'terms.html','/LICENSE.txt':'LICENSE.txt','/extension/':'https://comparethesetexts.com/extension/'}.items():
   content=content.replace('href="'+before+'"','href="'+after+'"')
  content=content.replace('src="/favicon.svg"','src="favicon.svg"')
  files[page+'.html']=content.encode()
 # License notices are sibling files in the offline package.
 files['terms.html']=re.sub(rb'href="/([^/"<>]+\.txt)"',rb'href="\1"',files['terms.html'])
 for name in ['launcher.html','launcher.css','launcher.js','welcome.html','welcome.css','welcome-entry.mjs','background.js']:files[name]=(sources/name).read_bytes()
 archive=dist/'downloads'/f'ctt-{target}-{version}.zip'
 with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
  for name,content in sorted(files.items()):
   info=zipfile.ZipInfo(name,date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;z.writestr(info,content)
 print(archive)
