"""Package the site's English offline engine for Chrome and Firefox."""
from pathlib import Path
import json,zipfile,re
from store_metadata import message_files
from website_analytics import strip_website_analytics
from website_meta import WEBSITE_ONLY
from firefox_package import split_color_emoji
root=Path(__file__).resolve().parents[1];dist=root/'dist';sources=root/'extension-package'
release=json.loads((root/'release.json').read_text())
version=release['version']
website=release['homepage_url'].rstrip('/')+'/'
extension_url=website+'extension/'
localized_files=message_files()
guides=['compare-word-documents','compare-pdf-files','compare-excel-files','compare-csv-files']
office_downloads=['compare-these-texts-google-docs-0.1.0.zip','google-docs-setup-en.md','google-docs-setup-ru.md']

def offline_page(content):
 # Shared help and file guides must stay inside the installed package, including
 # links which the website writes as absolute canonical URLs.
 content=strip_website_analytics(content)
 routes={'/':'index.html','/style.css':'style.css','/site.css':'site.css',
         '/guides.css':'guides.css','/favicon.svg':'favicon.svg',
         '/privacy/':'privacy.html','/support/':'support.html','/terms/':'terms.html',
         '/LICENSE.txt':'LICENSE.txt','/extension/':'welcome.html',
         '/office-addins/':'office-addins.html','/office-addins.css':'office-addins.css'}
 routes.update({f'/{page}/':page+'.html' for page in guides})
 routes.update({f'/downloads/{name}':f'downloads/{name}' for name in office_downloads})
 for before,after in routes.items():
  content=content.replace('href="'+before+'"','href="'+after+'"')
  if before!='/':content=content.replace('href="'+website.rstrip('/')+before+'"','href="'+after+'"')
 content=content.replace('src="/favicon.svg"','src="favicon.svg"')
 content=content.replace('>Extension</a>','>Getting started</a>').replace('>Get the extension</a>','>Getting started</a>')
 content=re.sub(r'<a\b[^>]*href="https://chromewebstore\.google\.com/[^\"]*"[^>]*>.*?</a>','',content,flags=re.S)
 content=re.sub(r'<link\b[^>]*rel="canonical"[^>]*>','',content)
 return content

for target in ['chrome','firefox']:
 manifest=json.loads((sources/(target+'-manifest.json')).read_text())
 manifest.update({key:release[key] for key in ('name','version','description','homepage_url')})
 manifest['action']['default_title']='CTT — Compare & Edit'
 if target=='chrome':
  manifest.update(name='__MSG_extensionName__',description='__MSG_extensionDescription__',default_locale='en')
  manifest['action']['default_title']='__MSG_actionTitle__'
 else:
  # AMO limits the add-on name to 45 characters; retain Chrome's localized title.
  manifest['name']='Compare Two Texts — Diff Checker'
 # Preserve the Firefox ID and permission-free offline CSP.
 files={p.name:p.read_bytes() for p in dist.iterdir() if p.is_file() and p.name not in ('robots.txt','sitemap.xml','_headers')}
 if target=='firefox':split_color_emoji(files)
 for name in files:
  if name.endswith('.html'):files[name]=strip_website_analytics(files[name].decode()).encode()
 if target=='chrome':files.update(localized_files)
 # Remove the website-only home promotion; local guide entry points are added below.
 html=re.sub(re.escape(WEBSITE_ONLY[0])+'.*?'+re.escape(WEBSITE_ONLY[1]),'',files['index.html'].decode(),flags=re.S)
 html=html.replace('href="/"','href="index.html"').replace('href="/site.css"','href="site.css"').replace('href="/favicon.svg"','href="favicon.svg"').replace('src="/favicon.svg"','src="favicon.svg"')
 html=html.replace('href="/extension/"',f'href="{extension_url}"').replace('href="/privacy/"','href="privacy.html"').replace('href="/support/"','href="support.html"').replace('href="/terms/"','href="terms.html"')
 html=html.replace('>Extension</a>','>Website</a>').replace(f'href="{extension_url}">Website',f'href="{website}">Website')
 html=re.sub(r'<a href="(https://[^"]+)"',r'<a href="\1" target="_blank" rel="noopener noreferrer"',html)
 html=html.replace('</head>', '<script type="module" src="welcome-entry.mjs"></script></head>')
 html=html.replace('<a href="support.html">More help &amp; feedback</a>', '<p class="home-help-copy">Want to edit inside Word or Google Docs? <a href="office-addins.html" target="_blank" rel="noopener noreferrer">Set up the separate add-in prototypes</a>. Installation and data handling differ from this local workspace.</p><a href="support.html">More help &amp; feedback</a>')
 html=html.replace('<nav aria-label="Footer navigation">', '<nav aria-label="Footer navigation"><a id="getting-started" href="welcome.html" target="_blank" rel="noopener noreferrer">Getting started</a><a href="office-addins.html" target="_blank" rel="noopener noreferrer">Word &amp; Google Docs add-ins</a><a href="compare-word-documents.html" target="_blank" rel="noopener noreferrer">File comparison guide</a>')
 files['index.html']=html.encode();files['manifest.json']=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
 for page in ['privacy','support','terms','office-addins',*guides]:
  content=offline_page((dist/page/'index.html').read_text())
  if page=='support':content=content.replace('>Compare two Word documents</a>','>Word &amp; Google Docs guide</a>')
  files[page+'.html']=content.encode()
 # License notices are sibling files in the offline package.
 files['terms.html']=re.sub(rb'href="/([^/"<>]+\.txt)"',rb'href="\1"',files['terms.html'])
 for name in office_downloads:files['downloads/'+name]=(dist/'downloads'/name).read_bytes()
 for name in ['launcher.html','launcher.css','launcher.js','welcome.html','welcome.css','welcome-entry.mjs','background.js']:files[name]=(sources/name).read_bytes()
 archive=dist/'downloads'/f'ctt-{target}-{version}.zip'
 with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
  for name,content in sorted(files.items()):
   info=zipfile.ZipInfo(name,date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;z.writestr(info,content)
 print(archive)
