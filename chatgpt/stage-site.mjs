// Copy only the ChatGPT adapter and the authoritative CTT diff module.
// Existing Site identity and runtime state are never copied or overwritten.
import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const destination=process.argv[2];
if(!destination || !path.isAbsolute(destination))throw new Error('Usage: node chatgpt/stage-site.mjs /absolute/destination');
if(destination===path.dirname(here)||destination.startsWith(here+'/'))throw new Error('Destination must be outside the source repository.');
await mkdir(path.join(destination,'src'),{recursive:true});
await cp(here,path.join(destination,'chatgpt'),{recursive:true,filter:p=>!['node_modules','dist'].includes(path.basename(p))});
await cp(path.join(here,'../src/text-diff.mjs'),path.join(destination,'src/text-diff.mjs'));
await cp(path.join(here,'../LICENSE'),path.join(destination,'LICENSE'));
const pkg=JSON.parse(await readFile(path.join(here,'package.json'),'utf8'));
pkg.scripts={build:'node chatgpt/build.mjs',dev:'node chatgpt/dev.mjs',test:'node --test chatgpt/*.test.mjs'};
await writeFile(path.join(destination,'package.json'),JSON.stringify(pkg,null,2)+'\n');
await writeFile(path.join(destination,'.gitignore'),'node_modules/\ndist/\n.openai/preview/\n');
console.log('Prepared CTT pilot source at '+destination);
