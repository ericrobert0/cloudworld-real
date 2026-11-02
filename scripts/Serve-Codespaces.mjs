import {spawn} from 'node:child_process';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {ROOT} from '../infra.mjs';
import {codespacesIdentity} from '../codespaces.mjs';
const remote=codespacesIdentity();
const gateway=execFileSync('docker',['network','inspect','bridge','--format','{{(index .IPAM.Config 0).Gateway}}'],{encoding:'utf8',timeout:10000}).trim();
if(!net.isIPv4(gateway)||!(/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(gateway)))throw Error('Gateway privado Docker nao confirmado.');
const callback=http.createServer((req,res)=>{
  if(!/^\/api\/v1\/tenants\/[a-z][a-z0-9-]{1,30}\//.test(req.url)||!/^Bearer /.test(req.headers.authorization||'')){res.writeHead(403);res.end();return;}
  const upstream=http.request({hostname:'127.0.0.1',port:8099,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:8099'},timeout:10000},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
  upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
});
callback.listen(8099,gateway);
callback.on('error',()=>stop(1));
const serviceEnvironment={...process.env};
for(const name of ['GITHUB_TOKEN','GH_TOKEN','GH_ENTERPRISE_TOKEN'])delete serviceEnvironment[name];
const children=[['panel.mjs',{CW_PANEL_ORIGIN:remote.url(8099),CW_PANEL_PROXY_HOST:'localhost:8099'}],['portal.mjs',{CW_PORTAL_ORIGIN:remote.url(8100),CW_PORTAL_PROXY_HOST:'localhost:8100'}]].map(([file,env])=>spawn(process.execPath,[path.join(ROOT,file)],{cwd:ROOT,env:{...serviceEnvironment,...env},stdio:'inherit'}));
let closing=false;
function stop(code=0){if(closing)return;closing=true;callback.close();for(const child of children)child.kill();process.exitCode=code;}
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>stop());
for(const child of children){child.on('error',()=>stop(1));child.on('exit',code=>{if(!closing)stop(code||1);});}
