import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {ROOT,RUNTIME,tenantPath,secret} from '../infra.mjs';
import {onboard} from '../service.mjs';
import {IntegrationHub,atomicJSON,requestApp} from '../integration.mjs';
import {PortalAccounts} from '../portal.mjs';
import {checkDatabasePair} from '../database-isolation.mjs';
const a='piloto',b='validacao-'+Date.now().toString(36),ad=tenantPath(a),bd=tenantPath(b),work=path.join(RUNTIME,'isolation-lab'),hub=new IntegrationHub(),checks=[],locks=[];
fs.mkdirSync(work,{recursive:true});
const report={at:new Date().toISOString(),pid:process.pid,phase:'starting',tenants:[a,b],checks,scope:'Dois ambientes completos; comparacoes simultaneas por familia de aplicacao para limitar memoria. Sem mensagens ou publicacoes externas.'};
const save=()=>atomicJSON(path.join(work,'result.json'),report);
const phase=s=>{report.phase=s;save();console.log(s);};
async function run(args,{input,allowFailure=false}={}){return new Promise((resolve,reject)=>{const p=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',code=>{if(code!==0&&!allowFailure){fs.appendFileSync(path.join(work,'diagnostic.private.log'),err+'\n'+out+'\n',{mode:0o600});reject(Error('Comando Docker falhou; consulte diagnostico privado'));}else resolve({code,out,err});});p.stdin.end(input||'');});}
const dc=(id,...args)=>run(['compose','--project-directory',tenantPath(id),'-f',path.join(tenantPath(id),'compose.json'),...args]);
const ps=async id=>{const {out}=await dc(id,'ps','--all','--format','json');return out.trim().startsWith('[')?JSON.parse(out):out.trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));};
const helper=(file,...args)=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,[path.join(ROOT,'scripts',file),...args],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);p.on('error',reject);p.on('close',code=>{fs.appendFileSync(path.join(work,'diagnostic.private.log'),out+'\n',{mode:0o600});code===0?resolve():reject(Error('Etapa '+file+' falhou; consulte diagnostico privado'));});});
async function check(name,fn){try{await fn();checks.push({name,ok:true});console.log(name+': OK');}catch(e){checks.push({name,ok:false,error:e.message});console.log(name+': FALHOU');}save();}
const load=id=>JSON.parse(fs.readFileSync(path.join(tenantPath(id),'compose.json')));
const dataService=(n,s)=>n.endsWith('-db')||n.includes('redis')||['erp-cache','erp-queue'].includes(n);
async function stopApps(id,keep=[]){const rows=await ps(id),c=load(id),names=rows.filter(r=>r.State==='running'&&!dataService(r.Service,c.services[r.Service])&&!['ingress',...keep].includes(r.Service)).map(r=>r.Service);if(names.length)await dc(id,'stop','--timeout','30',...names);}
async function ready(id,app){let last;for(let i=0;i<60;i++){try{return await hub.invoke(id,app,'check');}catch(e){last=e;await delay(2000);}}throw last;}
let original=[],created=false;
try{
  assert.ok(!fs.existsSync(bd),'Ambiente de validacao ja existe; nao sobrescrevo dados.');
  locks.push({file:path.join(ad,'.operation.lock'),fd:fs.openSync(path.join(ad,'.operation.lock'),'wx')});
  const ta=JSON.parse(fs.readFileSync(path.join(ad,'tenant.json')));assert.ok(ta.local);
  original=(await ps(a)).filter(r=>r.State==='running').map(r=>r.Service);
  report.originalServices=original;
  const tb=onboard(b);created=true;tb.purpose='isolation-validation';atomicJSON(path.join(bd,'tenant.json'),tb);
  locks.push({file:path.join(bd,'.operation.lock'),fd:fs.openSync(path.join(bd,'.operation.lock'),'wx')});
  const ca=load(a),cb=load(b);for(const [name,s] of Object.entries(cb.services))if(!s.profiles?.length){assert.ok(ca.services[name]?.image.includes('@sha256:'),'Imagem nao fixada: '+name);s.image=ca.services[name].image;}
  atomicJSON(path.join(bd,'compose.json'),cb);atomicJSON(path.join(bd,'images.lock.json'),Object.fromEntries(Object.entries(cb.services).map(([n,s])=>[n,s.image])));
  phase('Preparando segunda empresa com credenciais e volumes independentes');
  await stopApps(a,['auth','auth-worker']);
  const dbs=Object.keys(cb.services).filter(n=>n.endsWith('-db'));await dc(b,'up','-d','--wait','--wait-timeout','300',...dbs);
  for(const init of ['chat-init','erp-init']){await dc(b,'up','-d',init);await dc(b,'wait',init);}
  await dc(b,'up','-d','--wait','--wait-timeout','1200');
  await run(['cp',tb.project+'-ingress-1:/data/caddy/pki/authorities/local/root.crt',path.join(bd,'local-ca.crt')]);
  atomicJSON(path.join(bd,'postiz-admin.private.json'),{email:'admin@'+b+'.localhost',password:secret(),url:tb.urls.postiz});
  await helper('test-postiz.mjs',b,'--register');
  await helper('provision-integrations.mjs',b);await helper('bootstrap-erp-integration.mjs',b);
  await helper('Create-Pilot-Portal.mjs',b);await helper('configure-portal-sso.mjs',b);
  phase('Segunda empresa pronta; validando bancos e credenciais');
  for(const name of Object.keys(cb.services).filter(n=>n.endsWith('-db'))){
    await check(name+': senha de outra empresa recusada nos dois sentidos',()=>checkDatabasePair(a,b,name));
  }
  const groups={auth:['auth','auth-worker'],chat:['chat','chat-worker'],erp:['erp','erp-backend','erp-websocket','erp-worker','erp-scheduler'],cloud:['cloud','cloud-cron'],postiz:['temporal','temporal-init','postiz'],n8n:['n8n'],waha:['waha']};
  for(const [app,services] of Object.entries(groups)){
    phase('Comparando as duas empresas: '+app);await stopApps(a);await stopApps(b);
    for(const id of [a,b])await dc(id,'up','-d','--wait','--wait-timeout','600',...services);
    await check(app+': APIs proprias autenticam e credenciais cruzadas falham',async()=>{
      await ready(a,app);await ready(b,app);
      const ac=hub.settings(a).connectors[app],bc=hub.settings(b).connectors[app];assert.notEqual(ac.token||ac.apiSecret||ac.password,bc.token||bc.apiSecret||bc.password);
      for(const [from,to] of [[a,b],[b,a]]){
        const c=hub.settings(from).connectors[app],target=hub.settings(to).connectors[app],t=JSON.parse(fs.readFileSync(path.join(tenantPath(to),'tenant.json')));let url=new URL(t.urls[app]||'http://127.0.0.1:'+(t.port+2)),route,headers={},method='GET',body;
        if(app==='auth'){route='/api/v3/core/users/me/';headers.Authorization='Bearer '+c.token;}
        if(app==='chat'){route='/api/v1/accounts/'+target.accountId+'/contacts';headers.api_access_token=c.token;}
        if(app==='erp'){route='/api/method/frappe.auth.get_logged_user';headers.Authorization='token '+c.apiKey+':'+c.apiSecret;}
        if(app==='cloud'){route='/ocs/v2.php/cloud/user?format=json';headers.Authorization='Basic '+Buffer.from(c.username+':'+c.password).toString('base64');headers['OCS-APIRequest']='true';}
        if(app==='postiz'){route='/api/public/v1/integrations';headers.Authorization=c.token;}
        if(app==='waha'){route='/api/sessions';headers['X-Api-Key']=c.token;}
        if(app==='n8n'){route='/webhook/'+target.webhookPath;method='POST';body={type:'isolation.check',payload:{test:true}};headers={'X-CloudWorld-Key':c.token,'Content-Type':'application/json'};await hub.invoke(to,app,'events.send',body);}
        const r=await requestApp(new URL(route,url).href,{method,headers,body,timeout:45000});assert.ok([401,403].includes(r.status)||(app==='cloud'&&![100,200].includes(Number(r.data?.ocs?.meta?.statuscode))),'Credencial estrangeira nao recusada: '+app+' HTTP '+r.status);
      }
    });
    if(app==='auth')await check('SSO real: identidades separadas, codigo cruzado e replay recusados',()=>helper('test-sso-live.mjs',a,b));
    if(app==='cloud')await check('Arquivos de uma empresa nao existem na outra',async()=>{
      const suffix=Date.now(),folders={};for(const id of [a,b]){folders[id]='CW-Teste-'+id+'-'+suffix;await hub.invoke(id,'cloud','folders.create',{folder:folders[id]});}
      for(const [from,to] of [[a,b],[b,a]]){const c=hub.settings(to).connectors.cloud,t=JSON.parse(fs.readFileSync(path.join(tenantPath(to),'tenant.json')));const response=await requestApp(new URL('/remote.php/dav/files/'+encodeURIComponent(c.username)+'/'+folders[from],t.urls.cloud).href,{method:'PROPFIND',headers:{Authorization:'Basic '+Buffer.from(c.username+':'+c.password).toString('base64'),Depth:'0'},timeout:45000});assert.equal(response.status,404);}
    });
    if(app==='n8n')await check('Rede de uma empresa nao alcanca o banco privado da outra',async()=>{
      for(const [from,to] of [[a,b],[b,a]]){const inspect=JSON.parse((await run(['inspect','vw-'+to+'-n8n-db-1'])).out)[0],ip=Object.values(inspect.NetworkSettings.Networks)[0].IPAddress;
        const js=`const net=require('net');const s=net.connect({host:process.argv[1],port:5432});s.setTimeout(2500);s.on('connect',()=>{console.log('connected');s.destroy()});s.on('timeout',()=>{console.log('blocked');s.destroy()});s.on('error',()=>console.log('blocked'));`;
        const own=await run(['exec','vw-'+from+'-n8n-1','node','-e',js,'n8n-db']);assert.equal(own.out.trim(),'connected');const peer=await run(['exec','vw-'+from+'-n8n-1','node','-e',js,ip]);assert.equal(peer.out.trim(),'blocked');
      }
    });
  }
  await check('Portal isola senha e sessao de usuarios com mesmo nome',async()=>{
    const accounts=new PortalAccounts(),creds=id=>JSON.parse(fs.readFileSync(path.join(tenantPath(id),'portal-initial.private.json'))),aa=creds(a),bb=creds(b);assert.notEqual(aa.password,bb.password);
    await assert.rejects(()=>accounts.login(b,aa.username,aa.password),{status:401});const token=await accounts.login(a,aa.username,aa.password);assert.throws(()=>accounts.authenticate(b+'.'+token.split('.')[1]),{status:401});accounts.logout(token);
  });
}catch(e){report.failure=e.message;process.exitCode=1;}
finally{
  phase('Encerrando laboratorio e retomando piloto');
  if(created)await dc(b,'down','--timeout','30').catch(()=>{report.cleanupError='Nao foi possivel encerrar B';process.exitCode=1;});
  if(original.length)try{await dc(a,'up','-d','--wait','--wait-timeout','600',...original);report.originalResumed=true;}catch{report.originalResumed=false;process.exitCode=1;}
  for(const l of locks){fs.closeSync(l.fd);fs.unlinkSync(l.file);}
  if(created&&!report.cleanupError){const destination=path.join(work,'tenant-b-'+Date.now());assert.equal(path.dirname(path.resolve(bd)),path.resolve(RUNTIME,'tenants'));assert.equal(path.dirname(path.resolve(destination)),path.resolve(work));fs.renameSync(bd,destination);report.archived=destination;}
  report.phase='complete';report.ok=!report.failure&&!report.cleanupError&&report.originalResumed&&checks.every(c=>c.ok);report.finishedAt=new Date().toISOString();save();if(!report.ok)process.exitCode=1;console.log('Laboratorio concluido. Resultado: '+(report.ok?'aprovado':'revisar relatorio'));
}
