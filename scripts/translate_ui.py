#!/usr/bin/env python3
"""Resumable build-time translation of project UI catalogs, never user documents."""
import argparse, concurrent.futures, datetime, hashlib, importlib.util, json, os, pathlib, re, subprocess, threading, time, urllib.parse, tempfile, email.utils
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('build_i18n',ROOT/'scripts/build_i18n.py'); builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
LOCK=threading.Lock(); PRINT_LOCK=threading.Lock(); CACHE_LOCK=threading.Lock(); DIAGNOSTIC_LOCK=threading.Lock(); COOLDOWN_LOCK=threading.Lock()
COOLDOWN_UNTIL=0.0; RATE_LIMIT_STREAK=0
DIAGNOSTICS=pathlib.Path(os.environ.get('CTT_TRANSLATION_DIAGNOSTICS') or (pathlib.Path(tempfile.gettempdir())/'ctt-translation-diagnostics.jsonl'))
REQUEST_CACHE={}; CATALOGS={}; FAILURES=[]; COUNTS={'requests':0,'messages':0,'failures':0}
BRANDS=['Compare Two Texts','Google Chrome','Chrome Web Store','Microsoft Word','Microsoft Edge','Google Docs','Google Sheets','Google Drive','Google Analytics','OpenAI','ChatGPT','Firefox','Safari','Chromium','LibreOffice','PowerPoint','OneDrive','Carlito','Calibri','Noto Sans','Google Workspace','Google','Microsoft','Chrome','Excel','macOS','Windows','MacBook','Android','iPhone','iPad','DOCX','XLSX','PDF','CSV','TXT','OCR','JSON','URL','HTML','UTF-8','A/B','JavaScript','Apps Script','Office.js','CTT']
BRAND_RE=re.compile('|'.join(re.escape(x) for x in sorted(BRANDS,key=len,reverse=True)))
TOKEN_RE=re.compile(r'ZXQ\s*(\d{4})\s*QXZ',re.I)
SIDE_LABEL_PATTERN=r'(?<=>)[AB](?=<)|\b[AB](?=\s*[:·])|\b[AB](?=\s*[-−→←↔]\s*[AB]\b)|(?<=[-−→←↔] )[AB]\b|^[AB]$'
ALTERNATE_TOKEN_RE=re.compile(r'__\s*CTT[_\s]*P\s*(\d{4})\s*__',re.I)


def say(*args):
    with PRINT_LOCK: print(*args,flush=True)

def atomic(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');temp.replace(path)

def diagnostic(language,stage,error,**details):
    entry={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'language':language,'stage':stage,'error':str(error),**details}
    with DIAGNOSTIC_LOCK:
        DIAGNOSTICS.parent.mkdir(parents=True,exist_ok=True)
        with DIAGNOSTICS.open('a',encoding='utf-8') as output:output.write(json.dumps(entry,ensure_ascii=False)+'\n')

def protect(source,strict=False,alternate=False):
    values=[]
    def token(match):
        index=len(values); values.append(match[0]);return f'__CTT_P{index:04d}__' if alternate else f'ZXQ{index:04d}QXZ'
    # One substitution pass prevents brand CTT from matching inside newly inserted
    # alternate tokens. Protected values are restored exactly, never translated.
    pattern=r'\{\w+\}|https?://[^\s<>]+|[\r\n\t]+|'+BRAND_RE.pattern+'|'+SIDE_LABEL_PATTERN
    if strict:pattern+=r'|</?\d+>'
    text=re.sub(pattern,token,source)
    token_pattern=ALTERNATE_TOKEN_RE if alternate else TOKEN_RE
    leading=re.match(r'^\s*',source).group(); trailing=re.search(r'\s*$',source).group()
    def restore(translated):
        seen=[]
        def replace(m):
            index=int(m[1]);
            if index>=len(values): raise ValueError('unknown protected token')
            seen.append(index);return values[index]
        result=token_pattern.sub(replace,translated)
        if sorted(seen)!=list(range(len(values))):raise ValueError('lost or repeated protected token')
        if re.search(r'ZXQ|QXZ|__CTT_P',result,re.I):raise ValueError('damaged protected token')
        result=re.sub(r'<\s*(/?)\s*(\d+)\s*>',r'<\1\2>',result)
        result=leading+result.strip()+trailing
        builder.validate(source,result)
        if result.count('\n') != source.count('\n'):raise ValueError('unexpected line break: possible cross-record translation leakage')
        return result
    return text,restore

def retry_after_seconds(headers,now=None):
    values=re.findall(r'^retry-after:\s*(.*?)\s*$',headers,re.I|re.M)
    if not values:return None
    value=values[-1].strip()
    if value.isdigit():return float(value)
    try:
        date=email.utils.parsedate_to_datetime(value)
        if date.tzinfo is None:date=date.replace(tzinfo=datetime.timezone.utc)
        current=datetime.datetime.now(datetime.timezone.utc) if now is None else now
        return max(0.0,(date-current).total_seconds())
    except (TypeError,ValueError,OverflowError):return None

def activate_cooldown(status,headers,attempt):
    global COOLDOWN_UNTIL,RATE_LIMIT_STREAK
    supplied=retry_after_seconds(headers)
    with COOLDOWN_LOCK:
        if status=='429':
            RATE_LIMIT_STREAK+=1
            delay=max(60.0*2**min(RATE_LIMIT_STREAK-1,4),supplied or 0.0)
        else:delay=max(3.0*2**attempt,supplied or 0.0)
        COOLDOWN_UNTIL=max(COOLDOWN_UNTIL,time.monotonic()+delay)
    return delay

def wait_for_cooldown():
    # All workers share the same provider cooldown. Short waits keep Ctrl+C
    # responsive; a Retry-After value is never shortened or bypassed.
    while True:
        with COOLDOWN_LOCK:remaining=COOLDOWN_UNTIL-time.monotonic()
        if remaining<=0:return
        time.sleep(min(10.0,remaining))

def request(text,language):
    key=(language,text)
    with CACHE_LOCK:
        future=REQUEST_CACHE.get(key)
        if future is None:future=concurrent.futures.Future();REQUEST_CACHE[key]=future;owner=True
        else:owner=False
    if not owner:return future.result()
    query=urllib.parse.urlencode({'client':'gtx','sl':'en','tl':language,'dt':'t','q':text})
    url='https://translate.googleapis.com/translate_a/single?'+query
    try:
        for attempt in range(5):
            wait_for_cooldown()
            with tempfile.TemporaryDirectory(prefix='ctt-translation-http-') as directory:
                header_path=pathlib.Path(directory)/'headers.txt'
                process=subprocess.run(['curl','--silent','--show-error','--location','--connect-timeout','20','--max-time','75','--dump-header',str(header_path),'--write-out','\n%{http_code}',url],capture_output=True,text=True)
                headers=header_path.read_text(errors='replace') if header_path.exists() else ''
            with LOCK: COUNTS['requests']+=1
            body,_,status=process.stdout.rpartition('\n')
            if process.returncode==0 and status=='200':
                try:
                    data=json.loads(body);result=''.join(segment[0] or '' for segment in data[0] if segment)
                    future.set_result(result);return result
                except (ValueError,TypeError,IndexError): pass
            if status and status not in ['429','500','502','503','504','000']:
                raise RuntimeError(f'HTTP {status}: {body[:120]}')
            delay=activate_cooldown(status,headers,attempt)
            say('shared provider cooldown',language,'HTTP',status,'attempt',attempt+1,'seconds',round(delay,1))
        raise RuntimeError(f'Provider request failed for {language}: {process.stderr[:100]} HTTP {status}')
    except BaseException as error:
        future.set_exception(error)
        with CACHE_LOCK:REQUEST_CACHE.pop(key,None)
        raise

def parse_batch_response(result,items):
    markers=list(re.finditer(r'\[\s*(?:[CСＣ][TТＴ][TТＴ]|सीटीटी)\s*(\d{6})\s*\]',result,re.I))
    if len(markers)!=len(items)*2:raise ValueError(f'Expected {len(items)*2} paired markers, received {len(markers)}')
    records={};offset=0
    for index in range(0,len(markers),2):
        start,end=markers[index:index+2];start_id=int(start[1]);end_id=int(end[1]);item_index=start_id//2
        if result[offset:start.start()].strip():raise ValueError('Translated text outside paired record markers')
        if start_id%2!=0 or end_id!=start_id+1:raise ValueError('Unbalanced paired record markers')
        if item_index<0 or item_index>=len(items) or item_index in records:raise ValueError('Unknown or duplicate paired record index')
        records[item_index]=result[start.end():end.start()].strip()
        offset=end.end()
    if result[offset:].strip():raise ValueError('Translated text after final paired record marker')
    return records

def translate_batch(items,language):
    protected=[protect(source) for _,source in items]
    # Standalone paired markers keep independent sentences out of neighbouring
    # records. Numeric-only IDs cannot translate BEGIN/END into natural language.
    # Any leaked prose outside these boundaries invalidates the batch.
    query='\n\n'.join(f'[CTT{index*2:06d}]\n'+entry[0]+f'\n[CTT{index*2+1:06d}]' for index,entry in enumerate(protected))
    result=request(query,language)
    recovered={}; failures=[]
    try:
        records=parse_batch_response(result,items)
    except ValueError as error:
        records={};diagnostic(language,'batch-markers',error,ids=[key for key,_ in items],response=result)
    for index,raw in records.items():
        try: recovered[index]=protected[index][1](raw)
        except ValueError as error:diagnostic(language,'batch-record',error,id=items[index][0],source=items[index][1],response=raw)
    for index,(key,source) in enumerate(items):
        if index in recovered: continue
        # Different token syntax makes a genuinely different retry query if the
        # provider corrupts a protected brand, placeholder or formatting slot.
        attempts=set(); last_error='no validated translation'
        for strict,alternate in ((True,False),(True,True),(False,True),(False,False)):
            text,restore=protect(source,strict,alternate)
            if text in attempts:continue
            attempts.add(text);raw=None
            try:
                raw=request(text,language);recovered[index]=restore(raw);break
            except (ValueError,RuntimeError) as error:
                last_error=str(error);diagnostic(language,'single-record',error,id=key,source=source,response=raw,strict=strict,alternate=alternate)
        if index not in recovered:failures.append({'id':key,'error':last_error})
    # Successful records survive a neighbouring failure and will not be sent
    # again on the next resumable run. Missing records are never English-filled.
    return {key:recovered[index] for index,(key,_) in enumerate(items) if index in recovered},failures

def batches(items,max_chars=3400):
    group=[];size=0
    for item in items:
        length=len(protect(item[1])[0])+28
        if group and size+length>max_chars:yield group;group=[];size=0
        group.append(item);size+=length
    if group:yield group

def job(code,language,items,index,total):
    try:
        values,failures=translate_batch(items,language)
        with LOCK:
            CATALOGS[code].update(values);atomic(ROOT/'i18n/catalogs'/f'{code}.json',CATALOGS[code]);COUNTS['messages']+=len(values)
            for failure in failures:FAILURES.append({'locale':code,'ids':[failure['id']],'error':failure['error']})
            COUNTS['failures']+=len(failures)
        say(code,f'{index}/{total}',f'+{len(values)}',f'total={len(CATALOGS[code])}',f'requests={COUNTS["requests"]}',f'failed={len(failures)}')
    except Exception as error:
        diagnostic(language,'batch-request',error,locale=code,ids=[key for key,_ in items])
        with LOCK:FAILURES.append({'locale':code,'ids':[key for key,_ in items],'error':str(error)});COUNTS['failures']+=len(items)
        say('FAILED',code,index,str(error))

def selected_locales(locales,selection):
    if not selection:return [locale for locale in locales if locale['code']!='en']
    by_code={locale['code']:locale for locale in locales}
    requested=list(dict.fromkeys(code.strip() for code in selection.split(',') if code.strip()))
    unknown=set(requested)-set(by_code)
    if unknown:raise ValueError('Unknown locale codes: '+', '.join(sorted(unknown)))
    return [by_code[code] for code in requested if code!='en']

def validated_existing(code,sources):
    path=ROOT/'i18n/catalogs'/f'{code}.json';existing=json.loads(path.read_text()) if path.exists() else {}
    override_path=ROOT/'i18n/overrides'/f'{code}.json'
    if override_path.exists():existing.update(json.loads(override_path.read_text()))
    valid={}
    for key,value in existing.items():
        if key in sources:
            try:builder.validate(sources[key],value);valid[key]=value
            except ValueError as error:diagnostic(code,'existing-record',error,id=key)
    return valid

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--allow-send-ui-text-to-google',action='store_true',help='Use only after the project owner explicitly authorizes sending UI text to Google');parser.add_argument('--locales',default='');parser.add_argument('--limit',type=int,default=0);parser.add_argument('--workers',type=int,default=2);parser.add_argument('--batch-chars',type=int,default=3400)
    args=parser.parse_args()
    if not args.allow_send_ui_text_to_google:
        parser.error('External translation is disabled. Explicit owner authorization is required before using --allow-send-ui-text-to-google.')
    sources=json.loads((ROOT/'i18n/source.json').read_text());locales=json.loads((ROOT/'i18n/locales.json').read_text())
    locales=selected_locales(locales,args.locales)
    jobs=[]
    for locale in locales:
        code=locale['code']
        valid=validated_existing(code,sources)
        CATALOGS[code]=valid
        missing=[item for item in sources.items() if item[0] not in valid]
        if args.limit:missing=missing[:args.limit]
        language={'es_419':'es','pt_PT':'pt-PT','pt_BR':'pt','fil':'tl','zh_CN':'zh-CN','zh_TW':'zh-TW'}.get(code,code)
        chunks=list(batches(missing,args.batch_chars))
        for index,items in enumerate(chunks,1):jobs.append((code,language,items,index,len(chunks)))
        say('scheduled',code,len(missing),'messages',len(chunks),'batches')
    metadata={'provider':'Google Translate public translate_a/single (client=gtx)','kind':'machine translation; human review required','requested_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_sha256':hashlib.sha256((ROOT/'i18n/source.json').read_bytes()).hexdigest(),'source_messages':len(sources),'regional_mapping':{'es_419':'es (provider base-language output; regional editorial review pending)','pt_PT':'pt-PT','pt_BR':'pt','fil':'tl','zh_CN':'zh-CN','zh_TW':'zh-TW'},'protected':'Public product names, URLs, placeholders, line breaks; strict structural validation; no user documents transmitted'}
    atomic(ROOT/'i18n/translation-metadata.json',metadata)
    say('starting',len(jobs),'batches','workers',args.workers)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures=[pool.submit(job,*parameters) for parameters in jobs]
        for future in concurrent.futures.as_completed(futures):future.result()
    metadata['completed_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();metadata['counters']=COUNTS;metadata['coverage']={code:len(values) for code,values in CATALOGS.items()};metadata['failures']=FAILURES
    atomic(ROOT/'i18n/translation-metadata.json',metadata)
    say('finished',json.dumps(COUNTS), 'failures',len(FAILURES))
    if FAILURES:raise SystemExit(1)
if __name__=='__main__':main()
