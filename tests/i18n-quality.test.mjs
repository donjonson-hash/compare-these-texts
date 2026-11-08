import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

test('translation audit distinguishes untranslated prose from brands and catches corrupted translation output',()=>{
  const checker=fileURLToPath(new URL('../scripts/check_i18n_quality.py',import.meta.url));
  const program=String.raw`
import importlib.util,json,pathlib,tempfile,sys
spec=importlib.util.spec_from_file_location('qa',sys.argv[1]);qa=importlib.util.module_from_spec(spec);spec.loader.exec_module(qa)
with tempfile.TemporaryDirectory(prefix='ctt-i18n-quality-') as temp:
 root=pathlib.Path(temp);(root/'catalogs').mkdir();(root/'overrides').mkdir()
 def write(path,value): (root/path).write_text(json.dumps(value,ensure_ascii=False))
 write('source.json',{'brand':'Google Docs PDF','code':'invalid_xml','prose':'Save all changes','placeholder':'{0} pages','marker':'Open the file','good':'Compare two versions','url':'Visit https://example.com','adjacent':'{0}: {1}row {2}{3}','domain':'Open example.com','decoder':'A → B','repeat':'Continue'})
 write('locales.json',[{'code':'en'},{'code':'ru'}])
 write('catalogs/ru.json',{'brand':'Google Docs PDF','code':'invalid_xml','prose':'Save all changes','placeholder':'{1} страниц','marker':'Открыть ZXQ0000QXZ','good':'Сравнить две версии','url':'Посетите https://evil.example.com','adjacent':'{0} : {1}row {2}{3}','domain':'Открыть changed.com','decoder':'A ⁇ B','repeat':'Далее '*10})
 report=qa.audit(root);ru=report['locales']['ru'];assert not report['release_structure_pass']
 assert ru['counts']['legitimate_literal_identity']==2,ru['counts']
 assert ru['counts']['unchanged_english_prose']==1,ru['counts']
 assert ru['counts']['adjacent_template_english_residue']==1,ru['counts']
 assert ru['counts']['domain_literal_changed']==1 and ru['counts']['decoder_artifact']==1 and ru['counts']['runaway_translation']==1
 assert ru['counts']['invalid_structure']==1 and ru['counts']['protected_token_residue']==1 and ru['counts']['url_literal_changed']==1
 write('overrides/ru.json',{'prose':'Сохранить все изменения','placeholder':'{0} страниц','marker':'Открыть файл','url':'Посетите https://example.com','adjacent':'{0}: {1}строка {2}{3}','domain':'Открыть example.com','decoder':'A → B','repeat':'Далее'})
 report=qa.audit(root);assert report['release_structure_pass'];assert report['totals']['suspect_english_messages']==0;assert report['totals']['token_residue']==0
 assert 'not native-language verification' in report['audit_kind']
 print('quality audit fixtures passed')
`;
  const result=spawnSync('python3',['-c',program,checker],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/quality audit fixtures passed/);
});
