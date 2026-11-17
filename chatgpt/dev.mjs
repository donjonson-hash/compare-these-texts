import http from 'node:http';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {default:worker}=await import(pathToFileURL(path.resolve('dist/server/index.js')));
const args=process.argv.slice(2);
const argument=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const port=Number(argument('--port',process.env.PORT||3000));
const host=argument('--host','0.0.0.0');
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid preview port');
http.createServer(async(req,res)=>{
  try {
    const request=new Request(new URL(req.url,'http://localhost:'+port),{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
    const response=await worker.fetch(request,{},{});
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Preview request failed');}
}).listen(port,host,()=>console.log('CTT preview ready on port '+port));
