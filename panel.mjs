import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {ROOT,RUNTIME,secret,tenantPath} from './infra.mjs';
import {catalog,tenants as listTenants} from './service.mjs';
import {createControlAPI} from './api.mjs';
import {loadJobHistory,saveJobHistory} from './operations.mjs';
fs.mkdirSync(RUNTIME,{recursive:true});
const keyPath=path.join(RUNTIME,'panel-password.txt');
if(!fs.existsSync(keyPath))fs.writeFileSync(keyPath,secret());
const password=fs.readFileSync(keyPath,'utf8').trim();
const port=Number(process.env.VW_PANEL_PORT||8099),origin=`http://127.0.0.1:${port}`;
let busy=false;const jobs=loadJobHistory();let engine={at:null,containers:[],error:'Aguardando consulta Docker'};
function refreshEngine(){
  const p=spawn('docker',['ps','-a','--format','{{json .}}'],{windowsHide:true});let out='',err='';
  const timer=setTimeout(()=>p.kill(),4000);p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);
  p.on('error',e=>{clearTimeout(timer);engine={at:new Date().toISOString(),containers:[],error:e.message};});
  p.on('close',code=>{clearTimeout(timer);try{engine={at:new Date().toISOString(),containers:code===0?out.split('\n').filter(Boolean).map(s=>JSON.parse(s)).filter(c=>c.Names?.startsWith('vw-')):[],error:code===0?null:err.slice(-1000)||'Docker nao respondeu'};}catch(e){engine.error=e.message;}});
}
refreshEngine();setInterval(refreshEngine,15000).unref();
const control=createControlAPI({listTenants,engine:()=>engine,origin});
const page=fs.readFileSync(path.join(ROOT,'public','index.html'),'utf8').replace('/* PANEL_APP */',()=>fs.readFileSync(path.join(ROOT,'public','panel.js'),'utf8'));
const staticAssets={
  '/assets/bootstrap.min.css': ['vendor/bootstrap.min.css','text/css; charset=utf-8'],
  '/assets/panel.css': ['panel.css','text/css; charset=utf-8']
};
function authorized(req){const got=Buffer.from(req.headers.authorization||'');const expected=Buffer.from('Basic '+Buffer.from('admin:'+password).toString('base64'));return got.length===expected.length&&crypto.timingSafeEqual(got,expected);}
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
  // Validar Host tambem bloqueia DNS rebinding contra o painel local.
  const dockerCallback=req.headers.host===`host.docker.internal:${port}`&&/^\/api\/v1\/tenants\//.test(req.url)&&/^Bearer /.test(req.headers.authorization||'');
  if(req.headers.host!==`127.0.0.1:${port}`&&!dockerCallback){res.writeHead(403);res.end('Host invalido');return;}
  if(await control.handle(req,res,authorized(req)))return;
  if(!authorized(req)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="CloudWorld", charset="UTF-8"'});res.end('Autenticacao necessaria');return;}
  if(req.method==='GET'&&staticAssets[req.url]){const [file,type]=staticAssets[req.url];res.setHeader('Content-Type',type);res.end(fs.readFileSync(path.join(ROOT,'public',file)));return;}
  if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(page);return;}
  if(req.method==='GET'&&req.url==='/api/status'){
    const base=path.join(RUNTIME,'tenants');fs.mkdirSync(base,{recursive:true});
    const tenants=fs.readdirSync(base).filter(n=>fs.existsSync(path.join(base,n,'tenant.json'))).map(n=>({...JSON.parse(fs.readFileSync(path.join(base,n,'tenant.json'))),maintenance:fs.existsSync(path.join(tenantPath(n),'.operation.lock'))}));
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({tenants,jobs,busy,engine,catalog}));return;
  }
  if(req.method==='POST'&&req.url==='/api/action'){
    if(req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/json')){res.writeHead(403);res.end('Origin ou Content-Type invalido');return;}
    if(busy){res.writeHead(409);res.end('Aguarde a operação atual');return;}
    let body='';for await(const chunk of req){body+=chunk;if(body.length>4096){res.writeHead(413);res.end();return;}}
    try {
      const data=JSON.parse(body);const allowed=['onboard','create','validate','up','status','suspend','resume','backup','smoke','update'];
      if(!allowed.includes(data.action)||!/^[a-z][a-z0-9-]{1,30}$/.test(data.id))throw Error('Operacao invalida');
      const args=[path.join(ROOT,data.action==='onboard'?'service.mjs':'manage.mjs'),data.action,data.id];
      if(data.action==='onboard'){if(data.baseDomain&&!/^[a-z0-9.-]{1,150}$/.test(data.baseDomain))throw Error('Dominio base invalido');args.push(data.baseDomain||'');}
      if(data.action==='create'){if(data.domain&&!/^[a-z0-9.-]{1,180}$/.test(data.domain))throw Error('Dominio invalido');if(!Number.isInteger(data.port))throw Error('Porta invalida');args.push(data.domain||`${data.id}.localhost`,String(data.port));}
      if(data.action==='update'){if(!['auth','chat','n8n','postiz','cloud','erp'].includes(data.service)||!/^[a-zA-Z0-9./_-]+:[a-zA-Z0-9._-]+$/.test(data.image??''))throw Error('Imagem ou aplicacao invalida');args.push(data.service,data.image);}
      const job={time:new Date().toISOString(),action:data.action,id:data.id,state:'running',output:''};saveJobHistory([...jobs,job]);busy=true;jobs.push(job);if(jobs.length>30)jobs.shift();
      const p=spawn(process.execPath,args,{cwd:ROOT,windowsHide:true});
      const append=d=>{job.output=(job.output+d.toString()).slice(-18000);};p.stdout.on('data',append);p.stderr.on('data',append);
      const persist=()=>{try{saveJobHistory(jobs);}catch{append('\nNao foi possivel salvar o historico em disco.');}};
      p.on('error',e=>{job.state='error';append(e.message);busy=false;persist();});p.on('close',code=>{job.state=code===0?'ok':'error';busy=false;persist();});
      res.writeHead(202,{'Content-Type':'application/json'});res.end(JSON.stringify({queued:true}));
    }catch(e){res.writeHead(400);res.end(e.message);}return;
  }
  res.writeHead(404);res.end();
});
server.listen(port,'127.0.0.1',()=>console.log(`Painel: ${origin}\nUsuario: admin\nSenha: arquivo ${keyPath}`));
