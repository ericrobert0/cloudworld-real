import {spawn} from 'node:child_process';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {ROOT,RUNTIME} from '../infra.mjs';
import {codespacesIdentity} from '../codespaces.mjs';
import {PortalAccounts} from '../portal.mjs';
import {portalProjection,createIdentityBroker} from '../portal-isolation.mjs';
import {preparePortalIdentity,prepareSessionDirectory,publishProjection,portalCommand,portalGid} from './Prepare-PortalIdentity.mjs';
const remote=codespacesIdentity();
const isolatedRoot=preparePortalIdentity(),accounts=new PortalAccounts();
const refresh=()=>{
  const base=path.join(RUNTIME,'tenants');
  const ids=fs.readdirSync(base).filter(id=>fs.existsSync(path.join(base,id,'tenant.json')));
  for(const id of ids){
    try{prepareSessionDirectory(id,accounts);publishProjection(id,portalProjection(id,accounts));}
    catch(e){const f=path.join(isolatedRoot,'config',id+'.json');if(fs.existsSync(f))fs.unlinkSync(f);throw e;}
  }
  for(const file of fs.readdirSync(path.join(isolatedRoot,'config')))if(file.endsWith('.json')&&!ids.includes(file.slice(0,-5)))fs.unlinkSync(path.join(isolatedRoot,'config',file));
};
refresh();
const socket=path.join(isolatedRoot,'identity.sock');
if(fs.existsSync(socket))fs.unlinkSync(socket);
const identity=createIdentityBroker(accounts);
await new Promise((resolve,reject)=>{identity.once('error',reject);identity.listen(socket,resolve);});
execFileSync('sudo',['-n','chown',process.getuid()+':'+portalGid,socket],{timeout:10000});fs.chmodSync(socket,0o660);
const projector=setInterval(()=>{try{refresh();}catch{console.error('Projecao privada do portal indisponivel; acesso afetado sera bloqueado.');}},1000);
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
const children=[spawn(process.execPath,[path.join(ROOT,'panel.mjs')],{cwd:ROOT,env:{...serviceEnvironment,CW_PANEL_ORIGIN:remote.url(8099),CW_PANEL_PROXY_HOST:'localhost:8099'},stdio:'inherit'}),
  spawn('sudo',portalCommand(remote.url(8100),'localhost:8100'),{cwd:ROOT,env:{PATH:'/usr/bin:/bin'},stdio:'inherit'})];
let closing=false;
function stop(code=0){if(closing)return;closing=true;clearInterval(projector);identity.close();callback.close();for(const child of children)child.kill();process.exitCode=code;}
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>stop());
for(const child of children){child.on('error',()=>stop(1));child.on('exit',code=>{if(!closing)stop(code||1);});}
