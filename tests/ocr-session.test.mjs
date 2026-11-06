import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSinglePayload} from '../src/single-session.mjs';
import {ocrSourceBytes, validateOcrSnapshot} from '../src/ocr-document-model.mjs';

const region = {id: 'line-1', text: 'Reference 123', x: .1, y: .2, width: .3, height: .04};
const page = () => ({text: 'Reference 123', confirmed: true, source: 'ocr', regions: [{...region}], language: 'eng', psm: '3', blank: false});
const source = (name, bytes) => ({name, data: Buffer.from(bytes).toString('base64')});
const payload = (name = 'scan.pdf', bytes = '%PDF original bytes') => ({version: 1, kind: 'single-editor', source: source(name, bytes), sheet: null, delimiter: ',', review: {version: 1, kind: 'ocr', pages: [page(), page()], currentPage: 1}});

test('OCR persistence round trip retains exact original, page position, text and coordinates', () => {
  const input = payload();
  const saved = validateSinglePayload(input);
  const restored = validateSinglePayload(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored, input);
  assert.deepEqual(ocrSourceBytes(restored.source), new Uint8Array(Buffer.from('%PDF original bytes')));
  input.review.pages[0].regions[0].text = 'Mutated outside the saved document';
  assert.equal(saved.review.pages[0].regions[0].text, 'Reference 123');
  assert.equal(restored.review.currentPage, 1);
});

test('OCR scan size allowance does not broaden regular editor limits', () => {
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 1, 65);
  const scan = payload('large.pdf', bytes);
  assert.doesNotThrow(() => validateSinglePayload(scan));
  assert.throws(() => validateSinglePayload({...scan, review: {version: 1}}), error => error.code === 'invalid');
  assert.throws(() => ocrSourceBytes(source('large.png', Buffer.alloc(10 * 1024 * 1024 + 1))), error => error.code === 'invalid');
  assert.throws(() => ocrSourceBytes(source('large.pdf', Buffer.alloc(20 * 1024 * 1024 + 1))), error => error.code === 'invalid');
});

test('OCR session rejects unapproved, malformed and out-of-page fragments', () => {
  const cases = [
    value => { value.review.pages[0].confirmed = false; },
    value => { value.review.pages[0].regions[0].text = 'Different mapped text'; },
    value => { value.review.pages[0].text = ''; },
    value => { value.review.pages[0].regions[0].x = Infinity; },
    value => { value.review.pages[0].regions[0].width = .95; },
    value => { value.review.pages[0].language = 'fra'; },
    value => { value.review.pages[0].psm = '99'; },
    value => { value.review.currentPage = 2; },
    value => { value.review.pages = Array.from({length: 31}, page); },
    value => { value.review.pages[0].regions = Array.from({length: 2001}, (_, i) => ({...region, id: String(i)})); },
    value => { value.source.data = 'not base64'; },
    value => { value.source.name = 'scan.txt'; },
    value => { value.source.name = 'scan.png'; },
    value => { value.sheet = 'unexpected'; },
  ];
  for (const mutate of cases) {
    const value = payload(); mutate(value);
    assert.throws(() => validateSinglePayload(value), error => error.code === 'invalid');
  }
  const unmapped = payload(); unmapped.review.pages[0].regions = []; unmapped.review.pages[0].text = 'Unmapped page text';
  assert.equal(validateSinglePayload(unmapped).review.pages[0].text, 'Unmapped page text');
  const blank = payload(); blank.review.pages[0] = {...page(), text: '', regions: [], blank: true};
  assert.equal(validateSinglePayload(blank).review.pages[0].blank, true);
});

test('OCR snapshots bound aggregate text and omit transient rendering objects', () => {
  const value = payload();
  value.review.pages[0].url = 'blob:old-tab'; value.review.pages[0].loaded = true;
  assert.equal('url' in validateOcrSnapshot(value.review).pages[0], false);
  assert.equal('loaded' in validateOcrSnapshot(value.review).pages[0], false);
  value.review.pages[0].text = 'a'.repeat(300_000); value.review.pages[1].text = 'b'.repeat(300_000);
  assert.throws(() => validateSinglePayload(value), error => error.code === 'invalid');
  const oversized = payload(); oversized.extra = 'x'.repeat(32 * 1024 * 1024);
  assert.throws(() => validateSinglePayload(oversized), error => error.code === 'invalid');
});
