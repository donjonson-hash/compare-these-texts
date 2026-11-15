import fs from 'node:fs';
import path from 'node:path';

const BANNED_PATTERNS = [
  { re: /Word[\s-]+DOCX/iu, reason: 'Дубль бренда и формата (Word DOCX) — триггер Yellow Argon' },
  { re: /Excel[\s-]+XLSX/iu, reason: 'Дубль бренда и формата (Excel XLSX) — триггер Yellow Argon' },
  { re: /CSV\s*\/\s*TSV/iu, reason: 'Склейка форматов через слэш (CSV/TSV) в сторе' },
  { re: /\b(TXT|DOCX|PDF|CSV|TSV|XLSX)\b[^\n.!?。]{0,55}\b(TXT|DOCX|PDF|CSV|TSV|XLSX)\b[^\n.!?。]{0,55}\b(TXT|DOCX|PDF|CSV|TSV|XLSX)\b[^\n.!?。]{0,55}\b(TXT|DOCX|PDF|CSV|TSV|XLSX)\b/iu, reason: 'Цепочка из 4+ аббревиатур форматов в одном предложении' }
];

let errors = 0;

function scanText(label, text) {
  for (const { re, reason } of BANNED_PATTERNS) {
    const match = text.match(re);
    if (match) {
      console.error(`[ASO FAIL] [${label}] ${reason}: "${match[0]}"`);
      errors++;
    }
  }
}

const locRaw = JSON.parse(fs.readFileSync('extension-package/store/localizations.json', 'utf8'));
for (const [locale, content] of Object.entries(locRaw.locales ?? locRaw)) {
  scanText(`localizations.json:${locale}`, JSON.stringify(content));
}

const descDir = 'extension-package/store/descriptions';
for (const file of fs.readdirSync(descDir).filter(f => f.endsWith('.txt')).sort()) {
  scanText(`descriptions/${file}`, fs.readFileSync(path.join(descDir, file), 'utf8'));
}

if (errors > 0) {
  console.error(`\nНайдено триггеров Yellow Argon: ${errors}`);
  process.exit(1);
}
console.log('ASO check passed: 0 триггеров Yellow Argon в localizations.json и всех descriptions/*.txt.');
