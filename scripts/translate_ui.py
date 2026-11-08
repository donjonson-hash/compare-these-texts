#!/usr/bin/env python3
"""Resumable build-time translation of project UI catalogs, never user documents."""
import argparse, concurrent.futures, datetime, hashlib, importlib.util, json, os, pathlib, re, subprocess, threading, time, urllib.parse
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('build_i18n',ROOT/'scripts/build_i18n.py'); builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
LOCK=threading.Lock(); PRINT_LOCK=threading.Lock(); CACHE_LOCK=threading.Lock()
REQUEST_CACHE={}; CATALOGS={}; FAILURES=[]; COUNTS={'requests':0,'messages':0,'failures':0}
BRANDS=['Compare Two Texts','Google Chrome','Chrome Web Store','Microsoft Word','Microsoft Edge','Google Docs','Google Sheets','Google Drive','Google Analytics','OpenAI','ChatGPT','Firefox','Safari','Chromium','LibreOffice','PowerPoint','OneDrive','Carlito','Calibri','Noto Sans','Google Workspace','Google','Microsoft','Chrome','Excel','macOS','Windows','MacBook','Android','iPhone','iPad','DOCX','XLSX','PDF','CSV','TXT','OCR','JSON','URL','HTML','UTF-8','A/B','JavaScript','Apps Script','Office.js','CTT']
BRAND_RE=re.compile('|'.join(re.escape(x) for x in sorted(BRANDS,key=len,reverse=True)))
TOKEN_RE=re.compile(r'ZXQ\s*(\d{4})\s*QXZ',re.I)


def say(*args):
    with PRINT_LOCK: print(*args,flush=True)

def atomic(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');temp.replace(path)

def protect(source,strict=False):
    values=[]
    def token(value):
        index=len(values); values.append(value);return f'ZXQ{index:04d}QXZ'
    text=re.sub(r'\{\w+\}|https?://[^\s<>]+|[\r\n\t]+',lambda m:token(m[0]),source)
    text=BRAND_RE.sub(lambda m:token(m[0]),text)
    if strict: text=re.sub(r'</?\d+>',lambda m:token(m[0]),text)
    leading=re.match(r'^\s*',source).group(); trailing=re.search(r'\s*$',source).group()
    def restore(translated):
        seen=[]
        def replace(m):
            index=int(m[1]);
            if index>=len(values): raise ValueError('unknown protected token')
            seen.append(index);return values[index]
        result=TOKEN_RE.sub(replace,translated)
        if sorted(seen)!=list(range(len(values))):raise ValueError('lost or repeated protected token')
        if re.search(r'ZXQ|QXZ',result,re.I):raise ValueError('damaged protected token')
        result=re.sub(r'<\s*(/?)\s*(\d+)\s*>',r'<\1\2>',result)
        result=leading+result.strip()+trailing
        builder.validate(source,result)
        return result
    return text,restore

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
            started=time.time()
            process=subprocess.run(['curl','--silent','--show-error','--location','--connect-timeout','20','--max-time','75','--write-out','\n%{http_code}',url],capture_output=True,text=True)
            with LOCK: COUNTS['requests']+=1
            body,_,status=process.stdout.rpartition('\n')
            if process.returncode==0 and status=='200':
                try:
                    data=json.loads(body);result=''.join(segment[0] or '' for segment in data[0] if segment)
                    future.set_result(result);return result
                except (ValueError,TypeError,IndexError): pass
            if status and status not in ['429','500','502','503','504','000']:
                raise RuntimeError(f'HTTP {status}: {body[:120]}')
            delay=min(60,3*2**attempt)+(time.time()-started)*0.1
            say('retry',language,'HTTP',status,'attempt',attempt+1,'delay',round(delay,1))
            time.sleep(delay)
        raise RuntimeError(f'Provider request failed for {language}: {process.stderr[:100]} HTTP {status}')
    except BaseException as error:
        future.set_exception(error)
        with CACHE_LOCK:REQUEST_CACHE.pop(key,None)
        raise

def translate_batch(items,language):
    protected=[protect(source) for _,source in items]
    query='\n'.join(f'[CTT{index:06d}] '+entry[0] for index,entry in enumerate(protected))
    result=request(query,language)
    markers=list(re.finditer(r'\[\s*CTT\s*(\d{6})\s*\]',result,re.I))
    recovered={}
    if len(markers)==len(items):
        for i,marker in enumerate(markers):
            index=int(marker[1])
            if index>=len(items) or index in recovered: continue
            raw=result[marker.end():markers[i+1].start() if i+1<len(markers) else len(result)].strip()
            try: recovered[index]=protected[index][1](raw)
            except ValueError: pass
    for index,(key,source) in enumerate(items):
        if index in recovered: continue
        # A malformed batch record is retried independently with stricter token protection.
        for strict in (True,False):
            text,restore=protect(source,strict)
            try:
                recovered[index]=restore(request(text,language));break
            except (ValueError,RuntimeError): pass
        if index not in recovered: raise ValueError(f'Failed validated translation {language}:{key}: {source[:100]!r}')
    return {key:recovered[index] for index,(key,_) in enumerate(items)}

def batches(items,max_chars=3400):
    group=[];size=0
    for item in items:
        length=len(protect(item[1])[0])+15
        if group and size+length>max_chars:yield group;group=[];size=0
        group.append(item);size+=length
    if group:yield group

def job(code,language,items,index,total):
    try:
        values=translate_batch(items,language)
        with LOCK:
            CATALOGS[code].update(values);atomic(ROOT/'i18n/catalogs'/f'{code}.json',CATALOGS[code]);COUNTS['messages']+=len(values)
        say(code,f'{index}/{total}',f'+{len(values)}',f'total={len(CATALOGS[code])}',f'requests={COUNTS["requests"]}')
    except Exception as error:
        with LOCK:FAILURES.append({'locale':code,'ids':[key for key,_ in items],'error':str(error)});COUNTS['failures']+=1
        say('FAILED',code,index,str(error))

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--allow-send-ui-text-to-google',action='store_true',help='Use only after the project owner explicitly authorizes sending UI text to Google');parser.add_argument('--locales',default='');parser.add_argument('--limit',type=int,default=0);parser.add_argument('--workers',type=int,default=6);parser.add_argument('--batch-chars',type=int,default=3400)
    args=parser.parse_args()
    if not args.allow_send_ui_text_to_google:
        parser.error('External translation is disabled. Explicit owner authorization is required before using --allow-send-ui-text-to-google.')
    sources=json.loads((ROOT/'i18n/source.json').read_text());locales=json.loads((ROOT/'i18n/locales.json').read_text())
    selected=set(args.locales.split(',')) if args.locales else None
    jobs=[]
    for locale in locales:
        code=locale['code']
        if code=='en' or (selected and code not in selected):continue
        path=ROOT/'i18n/catalogs'/f'{code}.json';existing=json.loads(path.read_text()) if path.exists() else {}
        valid={}
        for key,value in existing.items():
            if key in sources:
                try: builder.validate(sources[key],value);valid[key]=value
                except ValueError:pass
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
