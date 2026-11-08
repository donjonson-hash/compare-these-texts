import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

test('strict offline build rejects missing/invalid overrides and emits complete translated modules from external fixtures',()=>{
  const modulePath=fileURLToPath(new URL('../scripts/build_i18n.py',import.meta.url));
  const program=String.raw`
import importlib.util, json, pathlib, tempfile
spec=importlib.util.spec_from_file_location('builder',__import__('sys').argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory(prefix='ctt-i18n-test-') as directory:
 root=pathlib.Path(directory);m.I18N=root/'i18n';m.I18N.mkdir();(m.I18N/'catalogs').mkdir();(m.I18N/'overrides').mkdir()
 def write(relative,value): (m.I18N/relative).write_text(json.dumps(value,ensure_ascii=False))
 write('source.json',{'save':'Save','pages':'{0} pages','rich':'Read <0>help</0>.'})
 write('locales.json',[{'code':'en'},{'code':'ru'},{'code':'ja'}])
 write('catalogs/ru.json',{'save':'Сохранить','pages':'{0} страниц','rich':'Прочитать <0>справку</0>.'})
 write('catalogs/ja.json',{'save':'保存','pages':'{0} ページ'})
 try: m.build(root/'dist');raise AssertionError('missing foreign key was accepted')
 except ValueError as error: assert 'ja: 1 missing' in str(error)
 assert not (root/'dist').exists(), 'failed release must not write partial catalog modules'
 write('overrides/ja.json',{'rich':'<0>ヘルプ</0>を読む。'})
 write('overrides/ru.json',{'save':'Сохранить изменения'})
 assert m.build(root/'dist')==(3,3)
 ru=(root/'dist/i18n-ru.mjs').read_text();ja=(root/'dist/i18n-ja.mjs').read_text()
 assert 'Сохранить изменения' in ru and '保存' in ja and 'ヘルプ' in ja
 assert len(list((root/'dist').glob('i18n-*.mjs')))==3
 for invalid,expected in [({'pages':'Страниц {1}'},'placeholders'),({'rich':'Читать <1>справку</1>.'},'slots'),({'unknown':'Пример'},'unknown source IDs')]:
  write('overrides/ru.json',invalid)
  try: m.build(root/'invalid');raise AssertionError('invalid override accepted')
  except ValueError as error: assert expected in str(error),str(error)
 print('strict coverage, override precedence, placeholder/slot validation and atomic release validation passed')
`;
  const result=spawnSync('python3',['-c',program,modulePath],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/strict coverage/);
});
