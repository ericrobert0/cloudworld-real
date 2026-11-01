import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {ROOT,RUNTIME,tenantPath} from '../infra.mjs';
import {atomicJSON} from '../integration.mjs';
import {latestBackup} from '../operations.mjs';
import {verifyBackup} from '../backup-store.mjs';
import {recoveryPlan} from '../recovery.mjs';
import {postizOfflineStartup} from '../postiz.mjs';
const reuse=process.argv[2]==='--reuse'?path.resolve(process.argv[3]):null,base=path.resolve(RUNTIME,'functional-recovery');
if(reuse)assert.equal(path.dirname(reuse),base,'Copia fora da pasta de ensaios');
const previous=reuse?JSON.parse(fs.readFileSync(path.join(reuse,'result.json'))):null;
if(previous){assert.ok(previous.phase==='complete'&&previous.originalResumed&&previous.copyStopped);assert.equal(previous.project,path.basename(reuse));assert.match(previous.project,/^vw-recovery-\d+$/);assert.equal(previous.checks.filter(c=>c.ok&&c.name.endsWith(': SQL restaurado')).length,7);assert.ok(previous.checks.some(c=>c.ok&&c.name==='Workflow n8n recuperado'));fs.copyFileSync(path.join(reuse,'result.json'),path.join(reuse,'attempt-'+Date.now()+'.json'));}
const id='piloto',originalDir=tenantPath(id),runId=previous?.project||'vw-recovery-'+Date.now(),work=reuse||path.join(base,runId),cloneRuntime=path.join(work,'runtime'),dir=path.join(cloneRuntime,'tenants',id);
fs.mkdirSync(dir,{recursive:true});const report={at:new Date().toISOString(),pid:process.pid,tenant:id,phase:'preparing',project:runId,checks:previous?previous.checks.filter(c=>c.ok&&(c.name.endsWith(': SQL restaurado')||c.name==='Workflow n8n recuperado')):[],reusedImport:!!previous,previousFinishedAt:previous?.finishedAt,scope:'Copia restaurada com bancos, volumes e redes proprios. APIs e dados locais; sem mensagens ou publicacoes externas.'};
const save=()=>atomicJSON(path.join(work,'result.json'),report),phase=s=>{report.phase=s;(report.timeline??=[]).push({at:new Date().toISOString(),phase:s});save();console.log(s);};
async function run(args,{inputFile,input,allowFailure=false}={}){return new Promise((resolve,reject)=>{const p=spawn('docker',args,{windowsHide:true,timeout:inputFile?.endsWith('.sql')?1800000:1200000,stdio:[inputFile||input?'pipe':'ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);const copying=inputFile?pipeline(fs.createReadStream(inputFile),p.stdin):Promise.resolve();copying.catch(()=>{});if(input)p.stdin.end(input);p.on('error',reject);p.on('close',async code=>{let streamError;try{await copying;}catch(e){streamError=e;}if(code!==0||streamError){fs.appendFileSync(path.join(work,'diagnostic.private.log'),JSON.stringify({command:args,input:inputFile?path.basename(inputFile):null,exitCode:code,streamError:streamError?.code})+'\n'+err+'\n'+out+'\n',{mode:0o600});}if(code!==0&&!allowFailure)return reject(Error('Comando Docker falhou; diagnostico privado preservado'));if(streamError&&!(code===0&&streamError.code==='EPIPE'&&args[0]==='run'&&args.includes('tar')))return reject(streamError);resolve({code,out});});});}
const dc=(...args)=>run(['compose','--project-directory',dir,'-f',path.join(dir,'compose.json'),...args]);
const originalDC=(...args)=>run(['compose','--project-directory',originalDir,'-f',path.join(originalDir,'compose.json'),...args]);
async function check(name,fn){await fn();report.checks.push({name,ok:true});save();console.log(name+': OK');}
let lock,original=[],created=false,paused=false;
try{
  const source=latestBackup(id);assert.ok(source);const manifest=await verifyBackup(source.dir);report.backupAt=manifest.createdAt;report.backup=source.dir;
  const t=JSON.parse(fs.readFileSync(path.join(source.dir,'tenant.json'))),originalCompose=JSON.parse(fs.readFileSync(path.join(source.dir,'compose.json'))),files=Object.keys(manifest.hashes),plan=recoveryPlan(originalCompose,t,{project:runId,files});
  if(previous){assert.equal(path.resolve(previous.backup),path.resolve(source.dir));plan.compose=JSON.parse(fs.readFileSync(path.join(dir,'compose.json')));plan.compose.services.postiz.command=postizOfflineStartup;atomicJSON(path.join(dir,'compose.json'),plan.compose);}else{for(const file of files.filter(n=>!n.endsWith('.sql')&&!n.endsWith('.tgz')))fs.copyFileSync(path.join(source.dir,file),path.join(dir,file));atomicJSON(path.join(dir,'tenant.json'),plan.tenant);atomicJSON(path.join(dir,'compose.json'),plan.compose);}
  assert.ok(files.includes('portal-oidc.private.json'),'Use backup atualizado com configuracao de login central');
  // Keep the original OIDC configuration as recovery evidence; local login is independently tested.
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'portal-oidc.private.json'))).requireSso,false,'Este ensaio requer fallback local habilitado no piloto');
  await dc('config','--quiet');
  lock=fs.openSync(path.join(originalDir,'.operation.lock'),'wx');
  const status=await originalDC('ps','--format','json'),rows=status.out.trim().startsWith('[')?JSON.parse(status.out):status.out.trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));original=rows.filter(s=>s.State==='running').map(s=>s.Service);assert.ok(original.length>=20);report.originalServices=original;save();
  phase('Pausando piloto para liberar memoria durante o ensaio');report.pauseStartedAt=new Date().toISOString();paused=true;await originalDC('stop','--timeout','30',...original);
  if(!previous){
  phase('Importando bancos e arquivos em volumes exclusivos');
  for(const name of Object.keys(plan.compose.volumes)){await run(['volume','create',runId+'_'+name]);created=true;const archive=name+'.tgz';if(files.includes(archive))await run(['run','--rm','--network','none','-i','-v',runId+'_'+name+':/restore','alpine:3.22','tar','-xzf','-','-C','/restore'],{inputFile:path.join(source.dir,archive)});}
  await dc('up','-d','--wait','--wait-timeout','300',...plan.dbs.map(d=>d.name));
  for(const d of plan.dbs){await run(['compose','--project-directory',dir,'-f',path.join(dir,'compose.json'),'exec','-T',d.name,...(d.type==='pg'?['psql','-U','cw_restore_admin','-d','cw_restore_maintenance','-v','ON_ERROR_STOP=1']:['sh','-ec','exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD"'])],{inputFile:path.join(source.dir,d.name+'.sql')});report.checks.push({name:d.name+': SQL restaurado',ok:true});save();}
  await check('Workflow n8n recuperado',async()=>{const d=plan.dbs.find(d=>d.name==='n8n-db'),r=await dc('exec','-T',d.name,'psql','-U','cw_restore_admin','-d',d.database,'-tAc','SELECT count(*) FROM workflow_entity');assert.ok(Number(r.out.trim())>0);});
  // Do not activate restored workflows, schedules or queued outbound workers in a drill.
  const n8n=plan.dbs.find(d=>d.name==='n8n-db');await dc('exec','-T','n8n-db','psql','-U','cw_restore_admin','-d',n8n.database,'-v','ON_ERROR_STOP=1','-c',`UPDATE workflow_entity SET active=false; DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workflow_entity' AND column_name='activeVersionId') THEN EXECUTE 'UPDATE workflow_entity SET "activeVersionId"=NULL'; END IF; END $$;`);
  }else{created=true;phase('Reutilizando importacao preservada; repetindo testes de aplicacoes');}
  phase('Abrindo aplicacoes recuperadas em redes sem internet');
  const services=['auth','chat','erp','cloud','postiz','n8n','waha','ingress'];await dc('up','-d','--wait','--wait-timeout','900',...(previous?['--force-recreate']:[]),...services);
  await run(['cp',runId+'-ingress-1:/data/caddy/pki/authorities/local/root.crt',path.join(dir,'local-ca.crt')]);
  await check('Redes da copia restaurada sao internas',async()=>{for(const name of Object.keys(plan.compose.networks)){const r=await run(['network','inspect',runId+'_'+name],{allowFailure:true});if(r.code===0)assert.equal(JSON.parse(r.out)[0].Internal,true);}});
  await check('Aplicacao restaurada nao alcanca internet ou API original',async()=>{
    const code="const net=require('net');const check=h=>new Promise(r=>{const s=net.connect({host:h,port:h==='1.1.1.1'?443:8099});s.setTimeout(2500);s.on('connect',()=>{s.destroy();r(false)});s.on('timeout',()=>{s.destroy();r(true)});s.on('error',()=>r(true));});Promise.all(['1.1.1.1','host.docker.internal'].map(check)).then(a=>process.exit(a.every(Boolean)?0:1))";
    await run(['exec',runId+'-n8n-1','node','-e',code]);
  });
  const helperCode=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[path.join(ROOT,'scripts/check-recovered-apps.mjs'),path.join(originalDir,'portal-initial.private.json')],{windowsHide:true,env:{...process.env,VW_RUNTIME_DIR:cloneRuntime},stdio:['ignore','pipe','pipe']});p.stdout.on('data',d=>process.stdout.write(d));p.stderr.on('data',d=>fs.appendFileSync(path.join(work,'diagnostic.private.log'),d,{mode:0o600}));p.on('error',reject);p.on('close',resolve);});
  const applicationReport=JSON.parse(fs.readFileSync(path.join(cloneRuntime,'functional-checks.json')));report.checks.push(...applicationReport.checks);assert.equal(helperCode,0,'Uma aplicacao recuperada precisa de revisao');
}catch(e){report.failure=e.message;process.exitCode=1;}
finally{
  phase('Encerrando copia e retomando ambiente original');
  if(created)try{await dc('down','--timeout','30');report.copyStopped=true;}catch{report.cleanupError='Copia nao encerrou completamente';process.exitCode=1;}
  if(paused)try{await originalDC('up','-d','--wait','--wait-timeout','900',...original);report.originalResumed=true;report.originalResumedAt=new Date().toISOString();report.localMaintenanceMs=Date.parse(report.originalResumedAt)-Date.parse(report.pauseStartedAt);}catch{report.originalResumed=false;process.exitCode=1;}
  if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(path.join(originalDir,'.operation.lock'));}
  report.ok=!report.failure&&!report.cleanupError&&report.originalResumed===true&&report.copyStopped===true&&report.checks.every(c=>c.ok);report.phase='complete';report.finishedAt=new Date().toISOString();report.volumesPreserved=true;save();console.log('Recuperacao funcional: '+(report.ok?'APROVADA':'REVISAR')+' — '+path.join(work,'result.json'));if(!report.ok)process.exitCode=1;
}
