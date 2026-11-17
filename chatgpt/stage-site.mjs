// Copy only the ChatGPT adapter and the authoritative CTT diff module.
// Existing Site identity and runtime state are never copied or overwritten.
import {cp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const destination=process.argv[2];
if(!destination || !path.isAbsolute(destination))throw new Error('Usage: node chatgpt/stage-site.mjs /absolute/destination');
if(destination===path.dirname(here)||destination.startsWith(here+'/'))throw new Error('Destination must be outside the source repository.');
await mkdir(path.join(destination,'src'),{recursive:true});
await cp(here,path.join(destination,'chatgpt'),{recursive:true,filter:p=>!['node_modules','dist'].includes(path.basename(p))});
// Retain the complete relative-import closure of the adapter and its tests,
// including lazy PDF imports, without copying the production site's assets.
const repository=path.dirname(here),seen=new Set();
async function copyDependencies(file){
  if(seen.has(file))return;seen.add(file);
  if(!file.startsWith(repository+path.sep))throw new Error('Dependency leaves repository: '+file);
  const text=await readFile(file,'utf8');
  if(!file.startsWith(here+path.sep)){const target=path.join(destination,path.relative(repository,file));await mkdir(path.dirname(target),{recursive:true});await cp(file,target);}
  for(const match of text.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["'](\.[^"']+)["']/g)){
    if(match[1].includes('${'))continue;
    await copyDependencies(path.resolve(path.dirname(file),match[1]));
  }
}
for(const name of await readdir(here))if(/\.(mjs|js)$/.test(name))await copyDependencies(path.join(here,name));
for(const name of ['PDF-READER-LICENSE.txt','PDF-LICENSES.txt','XMLDOM-LICENSE.txt'])await cp(path.join(repository,'src',name),path.join(destination,'src',name));
await cp(path.join(here,'package-lock.json'),path.join(destination,'package-lock.json'));
await cp(path.join(here,'../LICENSE'),path.join(destination,'LICENSE'));
const pkg=JSON.parse(await readFile(path.join(here,'package.json'),'utf8'));
pkg.scripts={build:'node chatgpt/build.mjs',dev:'node chatgpt/dev.mjs',test:'node --test chatgpt/*.test.mjs'};
await writeFile(path.join(destination,'package.json'),JSON.stringify(pkg,null,2)+'\n');
await writeFile(path.join(destination,'.gitignore'),'node_modules/\ndist/\n.openai/preview/\n');
console.log('Prepared CTT pilot source at '+destination);
