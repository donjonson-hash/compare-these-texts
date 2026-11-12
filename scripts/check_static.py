from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse,urljoin
import io,json,zipfile,subprocess,re,uuid,importlib.util
import xml.etree.ElementTree as ET
from store_metadata import LOCALES, message_files
from website_analytics import SCRIPT_HASH, TAG
from firefox_package import split_color_emoji, MODULE_LIMIT
root=Path(__file__).resolve().parents[1]/'dist'
release=json.loads((root.parent/'release.json').read_text())
localized_files=message_files()
offline_guides=('compare-word-documents','compare-pdf-files','compare-excel-files','compare-csv-files','office-addins')
google_archive='compare-these-texts-google-docs-0.2.0.zip'
google_spec=importlib.util.spec_from_file_location('google_addin_build',root.parent/'google-docs/build.py')
google_builder=importlib.util.module_from_spec(google_spec)
google_spec.loader.exec_module(google_builder)
google_files=google_builder.rendered_files()
office_downloads=(google_archive,'google-docs-setup-en.md','google-docs-setup-ru.md')
word_pages={'word-addin/index.html','word-addin/taskpane.html'}
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
subprocess.run(['python3',str(root.parent/'scripts/check_i18n_quality.py')],check=True)
subprocess.run(['python3',str(root.parent/'scripts/check_i18n_sides.py')],check=True)
class Parser(HTMLParser):
 def __init__(self): super().__init__(); self.refs=[]; self.ids=[]; self.csp=''; self.canonicals=[]; self.descriptions=[]; self.h1_count=0; self.scripts=[]; self.resources=[]; self.robots=[]; self.inline_scripts=0
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='h1':self.h1_count+=1
  if tag=='link' and a.get('rel')=='canonical':self.canonicals.append(a.get('href'))
  if tag=='meta' and a.get('name')=='description':self.descriptions.append(a.get('content'))
  if tag=='meta' and a.get('name')=='robots':self.robots.append(a.get('content',''))
  if tag=='script':
   if 'src' in a:self.scripts.append(a['src'])
   else:self.inline_scripts+=1
  if 'src' in a:self.resources.append(a['src'])
  if tag=='link' and a.get('rel') in ('stylesheet','icon','preload','modulepreload'):self.resources.append(a.get('href',''))
  assert not any(key.lower().startswith('on') for key in a), ('inline event handler',tag)
  if 'id' in a:self.ids.append(a['id'])
  if tag=='meta' and a.get('http-equiv')=='Content-Security-Policy':self.csp=a['content']
  for key in ('src','href'):
   if key in a:self.refs.append(a[key])
canonical_pages=set(); descriptions=set()
for p in root.rglob('*.html'):
 content=p.read_text();parser=Parser();parser.feed(content);assert len(parser.ids)==len(set(parser.ids)),p
 relative=p.relative_to(root).as_posix()
 route=relative.removesuffix('index.html')
 canonical='https://comparetwotexts.pro/'+route
 assert parser.h1_count==1,(p,'expected one main heading')
 assert len(parser.descriptions)==1 and parser.descriptions[0],(p,'missing description')
 assert parser.descriptions[0] not in descriptions,(p,'duplicate description')
 descriptions.add(parser.descriptions[0])
 if relative in word_pages:
  # Word embeds a dedicated task pane, not the marketing/analytics shell. Keep
  # this exception scoped to these two known pages, never the offline engine.
  assert any('noindex' in re.split(r'[\s,]+',value) for value in parser.robots),(p,'Word pilot must not be indexed')
  assert TAG not in content and SCRIPT_HASH not in parser.csp and 'google-analytics.com' not in content and 'googletagmanager.com' not in content,(p,'analytics in Word add-in')
  assert 'property="og:' not in content,(p,'social metadata in Word add-in')
  assert parser.inline_scripts==0,(p,'inline script in Word add-in')
  assert "base-uri 'none'" in parser.csp and "form-action 'none'" in parser.csp,(p,'Word CSP base/form restrictions')
  if relative=='word-addin/taskpane.html':
   assert not parser.canonicals,(p,'task pane is not an SEO page')
   assert len(parser.scripts)==3 and {urljoin(canonical,src) for src in parser.scripts}=={'https://officeapis.public.onecdn.static.microsoft/1/office.js','https://comparetwotexts.pro/word-addin/taskpane.mjs','https://comparetwotexts.pro/i18n.js'},(p,'unexpected Word scripts')
   directives={item.strip().split()[0]:item.strip().split()[1:] for item in parser.csp.split(';') if item.strip()}
   assert directives.get('default-src')==["'none'"],(p,'Word default CSP')
   assert set(directives.get('script-src',[]))=={"'self'",'https://officeapis.public.onecdn.static.microsoft'},(p,'Word script CSP')
   assert directives.get('style-src')==["'self'"],(p,'Word style CSP')
   assert directives.get('connect-src')==['https://officeapis.public.onecdn.static.microsoft'],(p,'Word connections limited to Office runtime')
   assert all(not urlparse(ref).scheme or ref=='https://officeapis.public.onecdn.static.microsoft/1/office.js' for ref in parser.resources),(p,'unexpected external Word resource')
  else:
   assert parser.canonicals==[canonical],(p,'Word setup canonical')
   assert len(parser.scripts)==1 and urljoin(canonical,parser.scripts[0])=='https://comparetwotexts.pro/i18n.js' and "connect-src 'none'" in parser.csp,(p,'Word setup is a static guide')
 else:
  assert not relative.startswith('word-addin/'),(p,'unknown Word page requires explicit validation')
  assert parser.canonicals==[canonical],(p,'canonical mismatch')
  canonical_pages.add(canonical)
  assert SCRIPT_HASH in parser.csp,p
  assert 'https://*.google-analytics.com' in parser.csp,p
  assert content.count(TAG)==1,(p,'one website Google tag')
  assert f'<meta property="og:url" content="{canonical}">' in content,(p,'social metadata')
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
for p in [*root.glob('*.js'), *root.glob('*.mjs'), *root.glob('word-addin/*.mjs')]:subprocess.run(['node','--check',str(p)],check=True)
assert 'new Worker(' in (root/'transport.js').read_text()
# The separately hosted Word pilot has its own Office permission contract. It
# must never be confused with the permission-free Chrome/Firefox manifests.
word_manifest=root/'word-addin/manifest.xml'
office=ET.parse(word_manifest).getroot()
office_ns={'o':'http://schemas.microsoft.com/office/appforoffice/1.1'}
assert office.tag=='{'+office_ns['o']+'}OfficeApp',(word_manifest,'Office manifest namespace')
assert office.get('{http://www.w3.org/2001/XMLSchema-instance}type')=='TaskPaneApp',(word_manifest,'Word task pane type')
uuid.UUID(office.findtext('o:Id',namespaces=office_ns))
assert re.fullmatch(r'\d+\.\d+\.\d+\.\d+',office.findtext('o:Version',namespaces=office_ns)),(word_manifest,'Office version')
assert [node.get('Name') for node in office.findall('o:Hosts/o:Host',office_ns)]==['Document'],(word_manifest,'Word host only')
requirements=office.findall('o:Requirements/o:Sets/o:Set',office_ns)
assert [(node.get('Name'),node.get('MinVersion')) for node in requirements]==[('WordApi','1.4')],(word_manifest,'Word API requirements')
assert office.findtext('o:Permissions',namespaces=office_ns)=='ReadWriteDocument',(word_manifest,'Word document permission')
assert office.find('o:DefaultSettings/o:SourceLocation',office_ns).get('DefaultValue')=='https://comparetwotexts.pro/word-addin/taskpane.html',(word_manifest,'Word task pane URL')
for node in office.iter():
 for value in [node.text or '',*node.attrib.values()]:
  if value.startswith(('http://','https://')):
   u=urlparse(value)
   assert u.scheme=='https' and u.netloc=='comparetwotexts.pro',(word_manifest,'unexpected manifest URL',value)
   target=root/u.path.lstrip('/')
   if target.is_dir():target=target/'index.html'
   assert target.is_file(),(word_manifest,'manifest URL has no deployed resource',value)
def check_google_archive(data,label):
 with zipfile.ZipFile(io.BytesIO(data)) as archive:
  sources=google_files
  assert set(archive.namelist())==set(sources) and len(archive.namelist())==len(sources),(label,'Google Docs archive closure')
  for name,source in sources.items():assert archive.read(name)==source,(label,name,'Google Docs source differs')
  manifest=json.loads(archive.read('appsscript.json'))
  assert manifest['runtimeVersion']=='V8' and not manifest.get('dependencies'),(label,'Google runtime/dependencies')
  assert set(manifest['oauthScopes'])=={'https://www.googleapis.com/auth/documents.currentonly','https://www.googleapis.com/auth/script.container.ui'},(label,'Google Docs scopes')
  script=archive.read('Code.gs').decode()
  assert '@OnlyCurrentDoc' in script and not re.search(r'\b(?:UrlFetchApp|eval)\s*[.(]',script),(label,'Google Docs external/script execution')
  sidebar=Parser();sidebar.feed(archive.read('Sidebar.html').decode())
  assert not sidebar.scripts and not sidebar.resources,(label,'Google sidebar external resources')
check_google_archive((root/'downloads'/google_archive).read_bytes(),google_archive)
for name,source in [('google-docs-setup-en.md','README.md'),('google-docs-setup-ru.md','README-RU.md')]:
 assert (root/'downloads'/name).read_bytes()==(root.parent/'google-docs'/source).read_bytes(),(name,'Google setup instructions differ')
for target in ('chrome','firefox'):
 assert (root/'downloads'/f"ctt-{target}-{release['version']}.zip").is_file(), f'Missing {target} release; run npm run build first'
for p in (root/'downloads').glob('*.zip'):
 if p.name==google_archive:continue
 assert re.fullmatch(r'ctt-(?:chrome|firefox|edge)-\d+\.\d+\.\d+\.zip',p.name),(p,'unknown downloadable archive requires validation')
 with zipfile.ZipFile(p) as z:
  assert len(z.namelist())==len(set(z.namelist())),(p,'duplicate archive member')
  for name in z.namelist():
   if name.endswith(('.html','.js','.mjs')):
    assert b'googletagmanager.com/gtag/js' not in z.read(name),(p,name,'analytics leaked into extension')
    for marker in (b'<!-- website-only -->',b'application/ld+json',b'property="og:',b'chromewebstore.google.com'):assert marker not in z.read(name),(p,name,'website-only content leaked into extension')
    if name.endswith('.html'):
     offline=Parser();offline.feed(z.read(name).decode())
     if offline.csp:assert "connect-src 'none'" in offline.csp,(p,name,'offline CSP')
  locale_modules={name for name in z.namelist() if re.fullmatch(r'i18n-[a-zA-Z_0-9]+\.mjs',name)}
  assert locale_modules=={f'i18n-{code}.mjs' for code in LOCALES},(p,'localized module set mismatch')
  manifest=json.loads(z.read('manifest.json'))
  is_chrome=p.name.startswith('ctt-chrome-')
  if is_chrome:
   assert {name for name in z.namelist() if name.startswith('_locales/')}==set(localized_files),(p,'Chrome metadata locale set mismatch')
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
   assert manifest['name']==(release['name'] if is_chrome else release['short_name'])
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
   expected.update(page+'.html' for page in offline_guides)
   expected.update('downloads/'+name for name in office_downloads)
   if is_chrome:expected.update(localized_files)
   else:
    expected.update(firefox_emoji)
    for name,data in firefox_emoji.items():
     assert z.read(name)==data and len(data)<MODULE_LIMIT,(p,name,'Firefox emoji payload')
   assert set(z.namelist())==expected,(p,'asset closure')
   for name in office_downloads:assert z.read('downloads/'+name)==(root/'downloads'/name).read_bytes(),(p,name,'Office download mismatch')
   check_google_archive(z.read('downloads/'+google_archive),str(p)+' nested Google Docs')
   assert not any(name.startswith('word-addin/') for name in z.namelist()),(p,'Word host code must remain outside the offline extension')
   for f in root.iterdir():
    if f.is_file() and f.name not in ('index.html','robots.txt','sitemap.xml','_headers'):
     expected_file=root.parent/'src'/f.name if f.name in minified_files else f
     expected_data=firefox_emoji[f.name] if not is_chrome and f.name in firefox_emoji else expected_file.read_bytes()
     assert z.read(f.name)==expected_data,(p,f.name)
   parser=Parser();parser.feed(z.read('index.html').decode())
   assert manifest['content_security_policy']['extension_pages']==parser.csp
   assert manifest['name']==(release['name'] if is_chrome else release['short_name'])
   assert 'id="getting-started"' in z.read('index.html').decode()
   assert manifest['background']==({'service_worker':'background.js'} if is_chrome else {'scripts':['background.js']})
   for name in ('welcome.html','welcome.css','background.js','welcome-entry.mjs'):
    assert z.read(name)==(root.parent/'extension-package'/name).read_bytes(),(p,name,'welcome payload mismatch')
   for name in ('privacy.html','support.html','terms.html',*(page+'.html' for page in offline_guides)):
    parser=Parser();parser.feed(z.read(name).decode())
    for ref in parser.refs:
     u=urlparse(ref)
     if not u.scheme and not u.netloc and u.path:assert u.path in z.namelist(),(p,name,ref)
   if 'firefox' in p.name:assert manifest['browser_specific_settings']['gecko']['id']=='kristina-reconciliation@donjonson-hash.github.io'
  assert not manifest.get('permissions') and not manifest.get('host_permissions')
assert (root/'_headers').read_bytes()==(root.parent/'src/_headers').read_bytes()
print('PASS: versions, source policy, vendor hashes, routes, CSP, Office manifest, Google Docs package, local asset closure, JS syntax, worker-only comparison, both extension downloads')
