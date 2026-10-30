import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const dist = new URL('../dist/', import.meta.url);
const STORE = 'https://chromewebstore.google.com/detail/kclhfaiampafehfhhlejeeefhdhocfcg';
const GUIDES = ['/compare-word-documents/', '/compare-pdf-files/', '/compare-excel-files/', '/compare-csv-files/'];

function pages(dir = dist) {
  return readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    if (entry.isDirectory()) return entry.name === 'downloads' || entry.name === 'release' ? [] : pages(new URL(entry.name + '/', dir));
    return entry.name.endsWith('.html') ? [new URL(entry.name, dir)] : [];
  });
}
const load = url => new JSDOM(readFileSync(url, 'utf8')).window.document;
const meta = (doc, key) => doc.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.content;

test('every website page shares its own title, description and canonical URL', () => {
  const list = pages();
  assert.ok(list.length >= 9);
  for (const page of list) {
    const doc = load(page), canonical = doc.querySelector('link[rel=canonical]').href;
    assert.equal(meta(doc, 'og:url'), canonical, page.pathname);
    assert.equal(meta(doc, 'og:title'), doc.title, page.pathname);
    assert.equal(meta(doc, 'og:description'), meta(doc, 'description'), page.pathname);
    assert.equal(meta(doc, 'og:image'), 'https://comparetwotexts.pro/images/og-1200x630.png', page.pathname);
    assert.equal(meta(doc, 'twitter:card'), 'summary_large_image', page.pathname);
  }
  assert.ok(existsSync(new URL('images/og-1200x630.png', dist)));
});

test('home page links to every file comparison guide', () => {
  const doc = load(new URL('index.html', dist));
  const links = [...doc.querySelectorAll('a[href]')].map(a => a.getAttribute('href'));
  for (const guide of GUIDES) assert.ok(links.includes(guide), guide);
});

test('store links on the website name their placement for store analytics', () => {
  for (const [page, campaign] of [['index.html', 'home_header'], ['extension/index.html', 'extension_page'],
    ['compare-word-documents/index.html', 'guide_word'], ['compare-pdf-files/index.html', 'guide_pdf'],
    ['compare-excel-files/index.html', 'guide_excel'], ['compare-csv-files/index.html', 'guide_csv']]) {
    const links = [...load(new URL(page, dist)).querySelectorAll(`a[href^="${STORE}"]`)];
    assert.ok(links.length, page);
    for (const link of links) {
      const url = new URL(link.href);
      assert.equal(url.origin + url.pathname, STORE, page);
      assert.deepEqual(Object.fromEntries(url.searchParams), {utm_source: 'comparetwotexts', utm_medium: 'website', utm_campaign: campaign}, page);
    }
  }
});

test('home page store button is counted as a store click', t => {
  const dom = new JSDOM(readFileSync(new URL('index.html', dist), 'utf8'), {url: 'https://comparetwotexts.pro/', runScripts: 'outside-only'});
  t.after(() => dom.window.close());
  const {window} = dom, doc = window.document;
  window.eval([...doc.scripts].find(s => !s.src && s.textContent.includes('cttProductEvent')).textContent);
  const link = doc.querySelector(`a[href^="${STORE}"]`);
  window.addEventListener('click', e => e.preventDefault(), {once: true});
  link.dispatchEvent(new window.MouseEvent('click', {bubbles: true, cancelable: true}));
  const events = Array.from(window.dataLayer).filter(x => x[0] === 'event').map(x => x[1]);
  assert.deepEqual(events, ['chrome_store_click']);
});

test('website structured data describes canonical pages without unsupported app rich results', () => {
  for (const [path, url] of [['index.html', 'https://comparetwotexts.pro/'],
    ['extension/index.html', 'https://comparetwotexts.pro/extension/']]) {
    const doc = load(new URL(path, dist));
    const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
    assert.equal(scripts.length, 1, path);
    const data = JSON.parse(scripts[0].textContent);
    assert.equal(data['@context'], 'https://schema.org');
    const [site, page] = data['@graph'];
    assert.deepEqual(data['@graph'].map(node => node['@type']), ['WebSite', 'WebPage']);
    assert.equal(site.url, 'https://comparetwotexts.pro/');
    assert.equal(page.url, url);
    assert.equal(page.url, doc.querySelector('link[rel=canonical]').href);
    assert.equal(page.name, doc.title);
    assert.equal(page.isPartOf['@id'], site['@id']);
    assert.equal(page.isAccessibleForFree, true);
    // App rich results require genuine review/rating data. Do not invent it.
    for (const node of data['@graph']) {
      assert.equal('aggregateRating' in node, false);
      assert.equal('review' in node, false);
      assert.equal('offers' in node, false);
    }
  }
});

test('home page has its main heading before any other heading', () => {
  const doc = load(new URL('index.html', dist));
  assert.equal(doc.querySelector('h1,h2,h3').tagName, 'H1');
});

test('each guide targets its search phrase in title, main heading and inbound links', () => {
  // Phrases chosen from Semrush US data on 2026-10-30; see docs/SEO-PLAN-2026-10-29.md.
  const targets = {
    '/compare-word-documents/': 'compare two word documents',
    '/compare-pdf-files/': 'compare two pdf files',
    '/compare-excel-files/': 'compare two excel files',
    '/compare-csv-files/': 'compare two csv files',
  };
  const anchors = {};
  for (const page of pages()) {
    for (const a of load(page).querySelectorAll('a[href^="/compare-"]')) (anchors[a.getAttribute('href')] ??= []).push(a.textContent.toLowerCase());
  }
  for (const [route, phrase] of Object.entries(targets)) {
    const doc = load(new URL('.' + route + 'index.html', dist));
    assert.ok(doc.title.toLowerCase().includes(phrase), route + ' title');
    assert.ok(doc.querySelector('h1').textContent.toLowerCase().includes(phrase), route + ' h1');
    assert.ok(anchors[route].filter(text => text === phrase).length >= 3, route + ' anchors');
  }
});
