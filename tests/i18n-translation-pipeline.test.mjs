import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

test('translation pipeline isolates paired records, preserves partial success and retries with different protected tokens',()=>{
  const pipeline=fileURLToPath(new URL('../scripts/translate_ui.py',import.meta.url));
  const program=String.raw`
import importlib.util,json,pathlib,tempfile,sys,datetime
spec=importlib.util.spec_from_file_location('pipeline',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
with tempfile.TemporaryDirectory(prefix='ctt-translation-pipeline-test-') as temp:
 p.DIAGNOSTICS=pathlib.Path(temp)/'diagnostics.jsonl'
 sample='\nCTT PDF {0} <0>help</0>.\n'
 for strict in [False,True]:
  for alternate in [False,True]:
   value,restore=p.protect(sample,strict,alternate);assert restore(value)==sample
 try:p.protect('Save changes')[1]('Changements\nenregistrés');raise AssertionError('extra newline accepted')
 except ValueError:pass
 items=[('a','Save'),('b','Broken {0}'),('c','Open')]
 raw='[CTT000000]\nEnregistrer\n[CTT000001]\n[CTT000002]\nBrisé\n[CTT000003]\n[CTT000004]\nOuvrir\n[CTT000005]'
 assert p.parse_batch_response(raw,items)[0]=='Enregistrer'
 assert p.parse_batch_response(raw.replace('[CTT000000]','[СТТ000000]'),items)[0]=='Enregistrer'
 assert p.parse_batch_response(raw.replace('[CTT000000]','[सीटीटी000000]'),items)[0]=='Enregistrer'
 for label in ['A','B','B - A','B − A','A → B','B · {0}','<0>A</0>Original text']:
  text,restore=p.protect(label);assert restore(text)==label;assert 'ZXQ' in text
 assert p.protect('A document')[0]=='A document'
 for invalid in ['prefix '+raw,raw+' suffix',raw.replace('[CTT000002]','words [CTT000002]'),raw.replace('[CTT000003]','[CTT000005]')]:
  try:p.parse_batch_response(invalid,items);raise AssertionError('cross-record corruption accepted')
  except ValueError:pass
 p.request=lambda text,language:raw if '[CTT000000]' in text else 'Brisé'
 values,failures=p.translate_batch(items,'fr');assert values=={'a':'Enregistrer','c':'Ouvrir'};assert [f['id'] for f in failures]==['b']
 calls=[]
 def alternate_request(text,language):
  calls.append(text)
  if '[CTT000000]' in text:return '[CTT000000]\nBrisé\n[CTT000001]'
  if '__CTT_P0000__' in text:return 'Ouvrir __CTT_P0000__'
  return 'Brisé'
 p.request=alternate_request
 values,failures=p.translate_batch([('a','Open {0}')],'fr');assert values=={'a':'Ouvrir {0}'} and not failures
 assert any('__CTT_P0000__' in call for call in calls)
 locales=[{'code':'en'},{'code':'ru'},{'code':'ja'},{'code':'de'}]
 assert [x['code'] for x in p.selected_locales(locales,'ja,ru,ja,de')]==['ja','ru','de']
 p.ROOT=pathlib.Path(temp);root=p.ROOT/'i18n';(root/'catalogs').mkdir(parents=True);(root/'overrides').mkdir()
 (root/'catalogs/ru.json').write_text(json.dumps({'a':'Старый перевод'}));(root/'overrides/ru.json').write_text(json.dumps({'a':'Проверенный перевод','b':'Открыть'}))
 assert p.validated_existing('ru',{'a':'Save','b':'Open'})=={'a':'Проверенный перевод','b':'Открыть'}
 assert p.retry_after_seconds('Retry-After: 120\r\n')==120
 now=datetime.datetime(2026,11,8,tzinfo=datetime.timezone.utc)
 assert p.retry_after_seconds('retry-after: Sun, 08 Nov 2026 00:02:00 GMT\n',now)==120
 assert p.retry_after_seconds('Retry-After: invalid') is None
 p.COOLDOWN_UNTIL=0;p.RATE_LIMIT_STREAK=0
 assert p.activate_cooldown('429','Retry-After: 1',0)>=60
 assert p.activate_cooldown('429','Retry-After: 1200',0)>=1200
 assert p.COOLDOWN_UNTIL-p.time.monotonic()>1199
 real_monotonic,real_sleep=p.time.monotonic,p.time.sleep;clock=[0];waits=[]
 p.time.monotonic=lambda:clock[0]
 def advance(delay): waits.append(delay);clock[0]+=delay
 p.time.sleep=advance;p.COOLDOWN_UNTIL=25
 try:p.wait_for_cooldown();assert waits==[10,10,5]
 finally:p.time.monotonic,p.time.sleep=real_monotonic,real_sleep
 print('paired sentinels, leakage detection, partial recovery, alternate tokens, order, override seed and shared Retry-After cooldown passed')
`;
  const result=spawnSync('python3',['-c',program,pipeline],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
});
