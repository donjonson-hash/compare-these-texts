from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse
import json,zipfile,subprocess,re
import xml.etree.ElementTree as ET
from store_metadata import message_files
from website_analytics import SCRIPT_HASH, TAG
from firefox_package import split_color_emoji, MODULE_LIMIT
root=Path(__file__).resolve().parents[1]/'dist'
release=json.loads((root.parent/'release.json').read_text())
localized_files=message_files()
firefox_emoji={'emoji-color-vendor.mjs':(root.parent/'src/emoji-color-vendor.mjs').read_bytes()}
split_color_emoji(firefox_emoji)
minified_files={entry['file'] for entry in json.loads((root/'release/provenance.json').read_text())['website_minification']['files']}
assert release['homepage_url']=='https://comparetwotexts.pro/'
assert release['privacy_url']==release['homepage_url']+'privacy/'
assert release['support_url']==release['homepage_url']+'support/'
for relative in ('package.json', 'extension-package/chrome-manifest.json', 'extension-package/firefox-manifest.json'):
 assert json.loads((root.parent/relative).read_text())['version']==release['version'], ('version mismatch',relative)
 if relative.endswith('-manifest.json'):assert json.loads((root.parent/relative).read_text())['homepage_url']==release['homepage_url'], ('homepage mismatch',relative)
lock=json.loads((root.parent/'package-lock.json').read_text())
assert lock['version']==lock['packages']['']['version']==release['version'], 'lockfile version mismatch'
assert lock['packages']['']['license']==json.loads((root.parent/'package.json').read_text())['license']=='SEE LICENSE IN LICENSE'
assert (root/'LICENSE.txt').read_bytes()==(root.parent/'LICENSE').read_bytes(), 'shipped license differs from canonical source'
assert '<!-- CTT-LICENSE -->' not in (root/'terms/index.html').read_text(), 'license was not rendered'
subprocess.run(['node',str(root.parent/'scripts/check_source_policy.mjs')],check=True)
subprocess.run(['python3',str(root.parent/'scripts/verify_vendor.py')],check=True)
class Parser(HTMLParser):
 def __init__(self): super().__init__(); self.refs=[]; self.ids=[]; self.csp=''; self.canonicals=[]; self.descriptions=[]; self.h1_count=0
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='h1':self.h1_count+=1
  if tag=='link' and a.get('rel')=='canonical':self.canonicals.append(a.get('href'))
  if tag=='meta' and a.get('name')=='description':self.descriptions.append(a.get('content'))
  if 'id' in a:self.ids.append(a['id'])
  if tag=='meta' and a.get('http-equiv')=='Content-Security-Policy':self.csp=a['content']
  for key in ('src','href'):
   if key in a:self.refs.append(a[key])
canonical_pages=set(); descriptions=set()
for p in root.rglob('*.html'):
 parser=Parser();parser.feed(p.read_text());assert len(parser.ids)==len(set(parser.ids)),p
 route=p.relative_to(root).as_posix().removesuffix('index.html')
 canonical='https://comparetwotexts.pro/'+route
 assert parser.canonicals==[canonical],(p,'canonical mismatch')
 assert parser.h1_count==1,(p,'expected one main heading')
 assert len(parser.descriptions)==1 and parser.descriptions[0],(p,'missing description')
 assert parser.descriptions[0] not in descriptions,(p,'duplicate description')
 descriptions.add(parser.descriptions[0]);canonical_pages.add(canonical)
 assert SCRIPT_HASH in parser.csp,p
 assert 'https://*.google-analytics.com' in parser.csp,p
 assert p.read_text().count(TAG)==1,(p,'one website Google tag')
 assert f'<meta property="og:url" content="{canonical}">' in p.read_text(),(p,'social metadata')
 for ref in parser.refs:
  u=urlparse(ref)
  if u.scheme or u.netloc or not u.path:continue
  f=root/u.path.lstrip('/') if u.path.startswith('/') else p.parent/u.path
  if f.is_dir():f=f/'index.html'
  assert f.exists(),(p,ref)
sitemap=ET.parse(root/'sitemap.xml')
sitemap_urls=[loc.text for loc in sitemap.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
assert len(sitemap_urls)==len(set(sitemap_urls)) and set(sitemap_urls)==canonical_pages,'sitemap must list every canonical page exactly once'
assert 'Sitemap: https://comparetwotexts.pro/sitemap.xml' in (root/'robots.txt').read_text()
for p in [*root.glob('*.js'), *root.glob('*.mjs')]:subprocess.run(['node','--check',str(p)],check=True)
assert 'new Worker(' in (root/'transport.js').read_text()
for target in ('chrome','firefox'):
 assert (root/'downloads'/f"ctt-{target}-{release['version']}.zip").is_file(), f'Missing {target} release; run npm run build first'
for p in (root/'downloads').glob('*.zip'):
 with zipfile.ZipFile(p) as z:
  for name in z.namelist():
   if name.endswith(('.html','.js','.mjs')):
    assert b'googletagmanager.com/gtag/js' not in z.read(name),(p,name,'analytics leaked into extension')
    for marker in (b'<!-- website-only -->',b'application/ld+json',b'property="og:',b'chromewebstore.google.com'):assert marker not in z.read(name),(p,name,'website-only content leaked into extension')
    if name.endswith('.html'):
     offline=Parser();offline.feed(z.read(name).decode())
     if offline.csp:assert "connect-src 'none'" in offline.csp,(p,name,'offline CSP')
  manifest=json.loads(z.read('manifest.json'))
  is_chrome=p.name.startswith('ctt-chrome-')
  if is_chrome:
   assert manifest['default_locale']=='en'
   for field,key in (('name','extensionName'),('description','extensionDescription')):
    assert manifest[field]=='__MSG_'+key+'__'
   assert manifest['action']['default_title']=='__MSG_actionTitle__'
   for name,data in localized_files.items():assert z.read(name)==data,(p,name,'localized text mismatch')
   messages=json.loads(z.read('_locales/en/messages.json'))
   # Validate the resolved English fallback against the existing package contract.
   manifest['name']=messages['extensionName']['message']
   manifest['description']=messages['extensionDescription']['message']
   manifest['action']['default_title']=messages['actionTitle']['message']
  else:
   assert 'default_locale' not in manifest
   assert not any(name.startswith('_locales/') for name in z.namelist())
  assert manifest['description']==release['description']
  assert manifest['homepage_url']==release['homepage_url']
  assert manifest['version']==re.search(r'-(\d+\.\d+\.\d+)\.zip$',p.name).group(1)
  if p.name.startswith('ctt-'):
   assert manifest['name']==(release['name'] if is_chrome else 'Compare Two Texts — Diff Checker')
   assert '<html lang="en">' in z.read('index.html').decode()
   assert manifest['action']['default_title']=='CTT — Compare & Edit'
   for name in ['index.html','launcher.html','welcome.html']:
    parser=Parser();parser.feed(z.read(name).decode())
    for ref in parser.refs:
     u=urlparse(ref)
     if u.scheme or u.netloc or not u.path:continue
     assert not u.path.startswith('/'),(p,ref)
     assert u.path in z.namelist(),(p,ref)
  if p.name in (f"ctt-chrome-{release['version']}.zip",f"ctt-firefox-{release['version']}.zip"):
   expected={f.name for f in root.iterdir() if f.is_file() and f.name not in ('robots.txt','sitemap.xml','_headers')} | {'manifest.json','launcher.html','launcher.css','launcher.js','privacy.html','support.html','terms.html','welcome.html','welcome.css','background.js','welcome-entry.mjs'}
   if is_chrome:expected.update(localized_files)
   else:
    expected.update(firefox_emoji)
    for name,data in firefox_emoji.items():
     assert z.read(name)==data and len(data)<MODULE_LIMIT,(p,name,'Firefox emoji payload')
   assert set(z.namelist())==expected,(p,'asset closure')
   for f in root.iterdir():
    if f.is_file() and f.name not in ('index.html','robots.txt','sitemap.xml','_headers'):
     expected_file=root.parent/'src'/f.name if f.name in minified_files else f
     expected_data=firefox_emoji[f.name] if not is_chrome and f.name in firefox_emoji else expected_file.read_bytes()
     assert z.read(f.name)==expected_data,(p,f.name)
   parser=Parser();parser.feed(z.read('index.html').decode())
   assert manifest['content_security_policy']['extension_pages']==parser.csp
   assert manifest['name']==(release['name'] if is_chrome else 'Compare Two Texts — Diff Checker')
   assert 'id="getting-started"' in z.read('index.html').decode()
   assert manifest['background']==({'service_worker':'background.js'} if is_chrome else {'scripts':['background.js']})
   for name in ('welcome.html','welcome.css','background.js','welcome-entry.mjs'):
    assert z.read(name)==(root.parent/'extension-package'/name).read_bytes(),(p,name,'welcome payload mismatch')
   for name in ('privacy.html','support.html','terms.html'):
    parser=Parser();parser.feed(z.read(name).decode())
    for ref in parser.refs:
     u=urlparse(ref)
     if not u.scheme and not u.netloc and u.path:assert u.path in z.namelist(),(p,name,ref)
   if 'firefox' in p.name:assert manifest['browser_specific_settings']['gecko']['id']=='kristina-reconciliation@donjonson-hash.github.io'
  assert not manifest.get('permissions') and not manifest.get('host_permissions')
assert (root/'_headers').read_bytes()==(root.parent/'src/_headers').read_bytes()
print('PASS: versions, source policy, vendor hashes, hosting config, routes, local assets, unique UI IDs, CSP, JS syntax, worker-only comparison, both extension downloads')
