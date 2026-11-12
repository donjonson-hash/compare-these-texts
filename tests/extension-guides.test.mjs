import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));
const {version} = JSON.parse(readFileSync(new URL('../release.json', import.meta.url), 'utf8'));
const guides = ['compare-word-documents.html', 'compare-pdf-files.html', 'compare-excel-files.html', 'compare-csv-files.html'];
const inspect = `
import json,sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    print(json.dumps({'names':z.namelist(),'pages':{n:z.read(n).decode() for n in z.namelist() if n.endswith('.html')}}))
`;

test('installed Word and Google Docs guidance is reachable and its related guides work offline', () => {
  for (const target of ['chrome', 'firefox']) {
    const archive = `dist/downloads/ctt-${target}-${version}.zip`;
    const {names, pages} = JSON.parse(execFileSync('python3', ['-c', inspect, archive], {cwd:root, encoding:'utf8', maxBuffer:8 << 20}));
    for (const entry of ['index.html', 'welcome.html', 'support.html']) {
      const dom = new JSDOM(pages[entry]);
      try { assert.ok(dom.window.document.querySelector('a[href="compare-word-documents.html"]'), `${target}: ${entry} reaches the local guide`); }
      finally { dom.window.close(); }
    }
    for (const filename of guides) {
      const dom = new JSDOM(pages[filename]);
      try {
        const doc = dom.window.document;
        assert.ok(pages[filename], `${target}: packaged ${filename}`);
        assert.equal(doc.querySelector('[href*="chromewebstore.google.com"]'), null, 'installed help does not ask to install again');
        for (const element of doc.querySelectorAll('[href], [src]')) {
          const ref = element.getAttribute('href') ?? element.getAttribute('src');
          assert.ok(!ref.startsWith('/'), `${filename}: no website-root reference ${ref}`);
          assert.ok(!/^(https?:)?\/\//.test(ref), `${filename}: help and assets stay offline: ${ref}`);
          if (ref.startsWith('#')) continue;
          const path = ref.split(/[?#]/)[0];
          assert.ok(names.includes(path), `${filename}: missing packaged target ${ref}`);
        }
        if (filename === guides[0]) {
          const headings = [...doc.querySelectorAll('h2')].map(node => node.textContent);
          for (const heading of ['Compare documents in Microsoft Word', 'Compare two Google Docs', 'Which method should you use?']) assert.ok(headings.includes(heading), heading);
          assert.match(doc.body.textContent, /download each one/);
        }
      } finally { dom.window.close(); }
    }
  }
});
