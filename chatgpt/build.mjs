import {build} from 'esbuild';
import {readFile, mkdir, writeFile, copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const ui = await build({entryPoints:[path.join(here,'ui.mjs')], bundle:true, write:false, format:'esm', target:'es2022', minify:true, legalComments:'inline'});
const template = await readFile(path.join(here,'ui.html'),'utf8');
const css = (await Promise.all(['ui.css','document-ui.css','document-view.css'].map(name=>readFile(path.join(here,name),'utf8')))).join('\n');
const licenses = (await Promise.all(['LICENSE','src/PDF-READER-LICENSE.txt','src/PDF-LICENSES.txt','src/XMLDOM-LICENSE.txt'].map(name=>readFile(path.join(here,'..',name),'utf8')))).join('\n\n---\n\n');
const html = template.replace('/* APP_STYLES */',()=>css).replace('/* APP_SCRIPT */',()=>ui.outputFiles[0].text.replaceAll('</script','<\\/script'));
// Parse the actual inline script after HTML embedding, catching replacement
// token expansion or escaping regressions before publishing a broken widget.
const checked=spawnSync(process.execPath,['--check','--input-type=module'],{input:html.match(/<script type="module">([\s\S]*)<\/script>/)[1],encoding:'utf8'});
if(checked.status!==0)throw new Error('Embedded widget syntax check failed: '+checked.stderr);
await mkdir(path.join(root,'dist/server'),{recursive:true});
await build({entryPoints:[path.join(here,'worker.mjs')],outfile:path.join(root,'dist/server/index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,
  plugins:[{name:'widget-html',setup(b){b.onResolve({filter:/^ctt:(widget|licenses)$/},args=>({path:args.path,namespace:'ctt'}));b.onLoad({filter:/.*/,namespace:'ctt'},args=>({contents:`export default ${JSON.stringify(args.path==='ctt:widget'?html:licenses)}`,loader:'js'}));}}]});
try { await mkdir(path.join(root,'dist/.openai'),{recursive:true}); await copyFile(path.join(root,'.openai/hosting.json'),path.join(root,'dist/.openai/hosting.json')); } catch(error) { if(error.code!=='ENOENT')throw error; }
await writeFile(path.join(root,'dist/build-info.json'),JSON.stringify({name:'Compare Two Texts · ChatGPT pilot',version:'0.2.1',engine:'src/text-engine.mjs and src/text-diff.mjs',scope:'Attached DOCX/PDF/TXT review; exact text editing; no document editing'},null,2));
console.log('Built self-contained MCP widget and Worker.');
