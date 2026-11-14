import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));
const {version} = JSON.parse(readFileSync(new URL('../release.json', import.meta.url), 'utf8'));
const googleZip = 'compare-these-texts-google-docs-0.2.0.zip';

test('Google Docs download is the deterministic localized prototype in the website and both browser packages', () => {
  const result = execFileSync('python3', ['-c', `
import io,json,pathlib,sys,zipfile,importlib.util
root=pathlib.Path(sys.argv[1]);version=sys.argv[2];name=sys.argv[3]
archive=(root/'dist/downloads'/name).read_bytes()
spec=importlib.util.spec_from_file_location('google_addin_build',root/'google-docs/build.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
expected=builder.rendered_files()
with zipfile.ZipFile(io.BytesIO(archive)) as z:
    assert set(z.namelist())==set(expected)
    for filename,source in expected.items():assert z.read(filename)==source,filename
    manifest=json.loads(z.read('appsscript.json'))
    assert set(manifest['oauthScopes'])=={'https://www.googleapis.com/auth/documents.currentonly','https://www.googleapis.com/auth/script.container.ui'}
for target in ['chrome','firefox']:
    with zipfile.ZipFile(root/'dist/downloads'/f'ctt-{target}-{version}.zip') as z:
        assert z.read('downloads/'+name)==archive
        assert not any(n.startswith('word-addin/') for n in z.namelist())
        for lang,source in [('en','README.md'),('ru','README-RU.md')]:
            filename=f'google-docs-setup-{lang}.md'
            assert z.read('downloads/'+filename)==(root/'google-docs'/source).read_bytes()
            assert (root/'dist/downloads'/filename).read_bytes()==(root/'google-docs'/source).read_bytes()
print('identical')
`, root, version, googleZip], {cwd:root, encoding:'utf8'});
  assert.equal(result.trim(), 'identical');
});

test('installed Office hub has local Google downloads and explicit separate-install and data handling', () => {
  const inspect = `
import json,sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    print(json.dumps({'names':z.namelist(),'hub':z.read('office-addins.html').decode(),'home':z.read('index.html').decode(),'help':z.read('support.html').decode(),'welcome':z.read('welcome.html').decode(),'privacy':z.read('privacy.html').decode()}))
`;
  for (const target of ['chrome', 'firefox']) {
    const bundle = JSON.parse(execFileSync('python3', ['-c', inspect, `dist/downloads/ctt-${target}-${version}.zip`], {cwd:root, encoding:'utf8', maxBuffer:8 << 20}));
    for (const name of ['home','help','welcome','privacy']) {
      const dom = new JSDOM(bundle[name]);
      try { assert.ok(dom.window.document.querySelector('a[href="office-addins.html"]'), `${target} ${name} reaches the hub`); }
      finally { dom.window.close(); }
    }
    const dom = new JSDOM(bundle.hub);
    try {
      const doc = dom.window.document;
      assert.ok(doc.querySelector(`a[href="downloads/${googleZip}"][download]`));
      assert.ok(doc.querySelector('a[href="https://comparetwotexts.pro/word-addin/"]'));
      assert.match(doc.body.textContent, /does not install either add-in/);
      assert.match(doc.body.textContent, /CacheService/);
      assert.match(doc.body.textContent, /plaintext/);
      assert.match(doc.body.textContent, /15 minutes/);
      for (const element of doc.querySelectorAll('[href],[src]')) {
        const ref = element.getAttribute('href') ?? element.getAttribute('src');
        if (/^https:/.test(ref)) {
          assert.ok(['https://comparetwotexts.pro/word-addin/', 'https://comparetwotexts.pro/pricing/'].includes(ref), ref);
          assert.equal(element.getAttribute('target'), '_blank');
          assert.ok(element.relList.contains('noopener'));
          continue;
        }
        if (ref.startsWith('#')) { assert.ok(doc.querySelector(ref)); continue; }
        assert.ok(!ref.startsWith('/'), ref);
        assert.ok(bundle.names.includes(ref), ref);
      }
    } finally { dom.window.close(); }
  }
});

test('website analytics and social transforms leave hosted Word surfaces byte-identical', () => {
  const result = execFileSync('python3', ['-c', `
import pathlib,sys,tempfile
sys.path.insert(0,str(pathlib.Path(sys.argv[1])/'scripts'))
from website_analytics import add_website_analytics,TAG
from website_meta import add_social_meta
with tempfile.TemporaryDirectory() as d:
    root=pathlib.Path(d);office=root/'word-addin';office.mkdir()
    original='<html><head><title>Word panel</title></head><body><h1>Edit selection</h1></body></html>'
    for n in ['index.html','taskpane.html']:(office/n).write_text(original)
    marketing='<html><head><title>Site</title><meta name="description" content="Site guide"><link rel="canonical" href="https://comparetwotexts.pro/"></head><body></body></html>'
    (root/'index.html').write_text(marketing)
    add_website_analytics(root);add_social_meta(root)
    for n in ['index.html','taskpane.html']:assert (office/n).read_text()==original
    assert TAG in (root/'index.html').read_text()
    assert 'property="og:url"' in (root/'index.html').read_text()
print('isolated')
`, root], {cwd:root, encoding:'utf8'});
  assert.equal(result.trim(), 'isolated');
});
