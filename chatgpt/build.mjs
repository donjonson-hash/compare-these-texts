import {build} from 'esbuild';
import {readFile, mkdir, writeFile, copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Script} from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const ui = await build({entryPoints:[path.join(here,'ui.mjs')], bundle:true, write:false, format:'iife', target:'es2022', minify:true, legalComments:'inline'});
const template = await readFile(path.join(here,'ui.html'),'utf8');
const css = await readFile(path.join(here,'ui.css'),'utf8');
const html = template.replace('/* APP_STYLES */',()=>css).replace('/* APP_SCRIPT */',()=>ui.outputFiles[0].text.replaceAll('</script','<\\/script'));
// Parse the actual inline script after HTML embedding, catching replacement
// token expansion or escaping regressions before publishing a broken widget.
new Script(html.match(/<script>([\s\S]*)<\/script>/)[1],{filename:'ctt-widget.js'});
await mkdir(path.join(root,'dist/server'),{recursive:true});
await build({entryPoints:[path.join(here,'worker.mjs')],outfile:path.join(root,'dist/server/index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,
  plugins:[{name:'widget-html',setup(b){b.onResolve({filter:/^ctt:widget$/},()=>({path:'widget',namespace:'ctt'}));b.onLoad({filter:/.*/,namespace:'ctt'},()=>({contents:`export default ${JSON.stringify(html)}`,loader:'js'}));}}]});
try { await mkdir(path.join(root,'dist/.openai'),{recursive:true}); await copyFile(path.join(root,'.openai/hosting.json'),path.join(root,'dist/.openai/hosting.json')); } catch(error) { if(error.code!=='ENOENT')throw error; }
await writeFile(path.join(root,'dist/build-info.json'),JSON.stringify({name:'Compare Two Texts · ChatGPT pilot',version:'0.1.0',engine:'src/text-diff.mjs',scope:'Exact text and UTF-8 TXT/MD; no document layout'},null,2));
console.log('Built self-contained MCP widget and Worker.');
