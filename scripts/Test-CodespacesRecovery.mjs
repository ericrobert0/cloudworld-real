import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {ROOT,RUNTIME,tenantPath,writeJSON} from '../infra.mjs';
import {codespacesIdentity,assertPresentationTenant} from '../codespaces.mjs';
import {latestBackup} from '../operations.mjs';
import {loadBackupKey,verifyBackup,exportBackup,verifyExport,importBackup} from '../backup-store.mjs';
import {databaseDrillPlan} from '../recovery-drill.mjs';
import {assertHostStorage} from '../host-policy.mjs';
const remote=codespacesIdentity(),id='apresentacao',tenant=JSON.parse(fs.readFileSync(path.join(tenantPath(id),'tenant.json')));assertPresentationTenant(tenant);
const engine=JSON.parse(execFileSync('docker',['info','--format','{{json .}}'],{encoding:'utf8',timeout:10000}));
assertHostStorage({platform:process.platform,info:engine,codespaceName:remote.name,codespacesConfirmation:JSON.parse(fs.readFileSync(path.join(RUNTIME,'codespaces-storage-confirmed.json')))});
process.umask(0o077);
const project='vw-restore-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex'),work=path.join(RUNTIME,'restore-tests',project);
fs.mkdirSync(work,{recursive:true,mode:0o700});
const report={at:new Date().toISOString(),tenant:id,project,codespace:remote.name,ok:false,phase:'preparing',checks:[],scope:'Importacao da copia AES-GCM, sete bancos reais e volumes; credenciais e redes de duas copias temporarias. Nao certifica duas empresas completas nem interfaces das aplicacoes restauradas.'};
const save=()=>writeJSON(path.join(work,'result.json'),report);
let lock,composeFile,active=new Set(),cancelled=false;
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{cancelled=true;for(const child of active)child.kill('SIGTERM');});
async function run(args,{inputFile,input,cleanup=false,allowFailure=false,binary='docker'}={}){
  if(cancelled&&!cleanup)throw Error('Ensaio interrompido');
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{cwd:ROOT,env:{...process.env,COMPOSE_PARALLEL_LIMIT:'2'},timeout:binary===process.execPath?1800000:600000,stdio:[inputFile||input?'pipe':'ignore','pipe','pipe']});active.add(child);
    let out='',err='';child.stdout.on('data',b=>out=(out+b).slice(-2097152));child.stderr.on('data',b=>err=(err+b).slice(-8192));
    const copying=inputFile?pipeline(fs.createReadStream(inputFile),child.stdin):Promise.resolve();copying.catch(()=>{});
    if(input){child.stdin.on('error',()=>{});child.stdin.end(input);}
    child.on('error',e=>{active.delete(child);reject(e);});
    child.on('close',async code=>{
      active.delete(child);let error;try{await copying;}catch(e){error=e;}
      if(error&&!(code===0&&error.code==='EPIPE'&&args.includes('tar')))code=code||1;
      if(code!==0){fs.appendFileSync(path.join(work,'diagnostic.private.log'),err+'\n'+out+'\n',{mode:0o600});if(!allowFailure)return reject(Error('Etapa falhou; diagnostico privado preservado'));}
      resolve({code,out,err});
    });
  });
}
const dc=(...args)=>run(['compose','--project-directory',work,'-f',composeFile,...args]);
async function cleanupPair(){if(composeFile){await run(['compose','--project-directory',work,'-f',composeFile,'down','--volumes','--timeout','15'],{cleanup:true});composeFile=null;}}
async function check(name,fn){await fn();report.checks.push({name,ok:true});save();console.log(name+': OK');}
function space(min=3){for(const dir of [RUNTIME,engine.DockerRootDir]){const s=fs.statfsSync(dir,{bigint:true});if(Number(s.bavail*s.bsize)<min*1024**3)throw Error('Espaco insuficiente; nenhum volume original sera removido');}}
function sqlArgs(plan,side,sql){return ['compose','--project-directory',work,'-f',composeFile,'exec','-T',side,...(plan.pg?['psql','-U',side==='a'?'cw_restore_admin':plan.user,'-d',side==='a'?plan.database:plan.database,'-tA','-v','ON_ERROR_STOP=1','-c',sql]:['sh','-ec','exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -N -e "$1"','sh',sql])];}
async function authentication(plan,side,ip,password){
  const shell=plan.pg?'IFS= read -r PGPASSWORD; export PGPASSWORD; export PGCONNECT_TIMEOUT=3; exec psql -h "$1" -U "$2" -d "$3" -w -tAc "SELECT 1"':'IFS= read -r MYSQL_PWD; export MYSQL_PWD; exec mariadb --connect-timeout=3 -h "$1" -uroot -Nse "SELECT 1"';
  return run(['compose','--project-directory',work,'-f',composeFile,'exec','-T',side,'sh','-ec',shell,'sh',ip,plan.user,plan.database||''],{input:password+'\n',allowFailure:true});
}
let archiveVolume;
async function removeArchiveVolume(){
  if(!archiveVolume)return;
  const owned=await run(['volume','inspect',archiveVolume,'--format','{{index .Labels "cloudworld.drill"}}'],{cleanup:true});
  if(owned.out.trim()!==project)throw Error('Volume temporario sem identificacao; remocao bloqueada');
  await run(['volume','rm',archiveVolume],{cleanup:true});archiveVolume=null;
}
try{
  lock=fs.openSync(path.join(RUNTIME,'.codespaces-recovery.lock'),'wx',0o600);fs.writeSync(lock,String(process.pid));
  space(5);
  const available=Number(fs.readFileSync('/proc/meminfo','utf8').match(/MemAvailable:\s+(\d+)/)[1]);if(available<2*1024**2)throw Error('Ensaio requer pelo menos 2 GiB de RAM disponivel');
  if(process.argv.includes('--fresh-backup')){console.log('Criando backup consistente; aplicacoes serao pausadas e retomadas.');await run([path.join(ROOT,'manage.mjs'),'backup',id],{binary:process.execPath});}
  const source=latestBackup(id);assert.ok(source,'Backup completo ausente');report.source=source.dir;report.backupAt=source.manifest.createdAt;
  const manifest=await verifyBackup(source.dir);report.phase='encrypted-roundtrip';save();
  const keyFile=path.join(RUNTIME,'backup-key.private.txt');assert.ok(fs.existsSync(keyFile),'Chave de backup ausente; nao criar uma nova para uma copia existente');
  const key=loadBackupKey(keyFile),encrypted=path.join(RUNTIME,'encrypted-backups',id,project),restored=path.join(work,'input');
  await check('Backup SHA256 e exportacao AES-GCM',async()=>{await exportBackup(source.dir,encrypted,key);assert.equal((await verifyExport(encrypted,key)).ok,true);});
  await check('Copia criptografada importada e conferida',async()=>{await importBackup(encrypted,restored,key);assert.deepEqual((await verifyBackup(restored)).hashes,manifest.hashes);});
  const original=JSON.parse(fs.readFileSync(path.join(restored,'compose.json')));
  const databases=Object.entries(original.services).filter(([name,s])=>name.endsWith('-db')&&(s.environment?.POSTGRES_DB||s.environment?.MARIADB_ROOT_PASSWORD));assert.equal(databases.length,7);
  for(const [name,service] of databases){
    space();console.log('Restaurando e isolando '+name+'; no maximo dois bancos temporarios ativos.');report.phase=name;save();
    const plan=databaseDrillPlan(service,{project});composeFile=path.join(work,name+'.compose.private.json');writeJSON(composeFile,plan.compose);
    await dc('up','-d','--pull','never','--wait','--wait-timeout','240');
    await check(name+': SQL restaurado',async()=>{
      await run(['compose','--project-directory',work,'-f',composeFile,'exec','-T','a',...(plan.pg?['psql','-U','cw_restore_admin','-d','cw_restore_maintenance','-v','ON_ERROR_STOP=1']:['sh','-ec','exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD"'])],{inputFile:path.join(restored,name+'.sql')});
    });
    await check(name+': dados recuperados e ausentes na outra copia',async()=>{
      const q=plan.pg?"SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'":"SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('mysql','information_schema','performance_schema','sys')";
      const a=await run(sqlArgs(plan,'a',q)),b=await run(sqlArgs(plan,'b',q));assert.ok(Number(a.out.trim())>0);assert.equal(Number(b.out.trim()),0);
      const table={'auth-db':'authentik_core_user','chat-db':'users','cloud-db':'oc_users','n8n-db':'workflow_entity','postiz-db':'"User"'}[name];
      if(table){const rows=await run(sqlArgs(plan,'a','SELECT count(*) FROM '+table));assert.ok(Number(rows.out.trim())>0);}
    });
    const ips={};for(const side of ['a','b']){
      const container=(await dc('ps','-q',side)).out.trim();const inspection=JSON.parse((await run(['inspect',container])).out)[0];
      assert.equal(inspection.HostConfig.Privileged,false);assert.equal(Object.keys(inspection.HostConfig.PortBindings||{}).length,0);ips[side]=Object.values(inspection.NetworkSettings.Networks)[0].IPAddress;
    }
    const passwords={a:plan.pg?service.environment.POSTGRES_PASSWORD:service.environment.MARIADB_ROOT_PASSWORD,b:plan.password};
    await check(name+': senhas proprias funcionam e cruzadas falham',async()=>{
      for(const side of ['a','b']){const good=await authentication(plan,side,ips[side],passwords[side]);assert.equal(good.code,0);assert.equal(good.out.trim(),'1');const bad=await authentication(plan,side,ips[side],passwords[side==='a'?'b':'a']);assert.notEqual(bad.code,0);assert.match(bad.err,/password authentication failed|Access denied/i);}
    });
    await check(name+': redes internas bloqueiam acesso entre copias',async()=>{
      for(const side of ['a','b']){const other=side==='a'?'b':'a';const r=await authentication(plan,side,ips[other],passwords[other]);assert.notEqual(r.code,0);assert.match(r.err,/timeout|timed out|could not connect|No route|refused|Can't connect|unreachable/i);}
      for(const network of ['a','b'])assert.equal(JSON.parse((await run(['network','inspect',project+'_'+network])).out)[0].Internal,true);
    });
    await cleanupPair();
  }
  const helper=databases.find(([,s])=>s.environment.POSTGRES_DB)[1].image;
  for(const file of Object.keys(manifest.hashes).filter(n=>n.endsWith('.tgz'))){
    space();archiveVolume=project+'_archive_'+crypto.randomBytes(3).toString('hex');
    await run(['volume','create','--label','cloudworld.drill='+project,archiveVolume]);
    await check(file+': arquivos extraidos em volume exclusivo',async()=>{
      await run(['run','--rm','--pull','never','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','128m','--cpus','0.5','-i','--mount','type=volume,source='+archiveVolume+',target=/restore','--entrypoint','tar',helper,'-xzf','-','--no-same-owner','-C','/restore'],{inputFile:path.join(restored,file)});
    });await removeArchiveVolume();
  }
  report.ok=true;
}catch(e){report.failure=e.message;process.exitCode=1;console.log('Ensaio requer revisao: '+e.message);}
finally{
  try{await cleanupPair();await removeArchiveVolume();report.temporaryResourcesRemoved=true;}catch{report.temporaryResourcesRemoved=false;report.ok=false;process.exitCode=1;}
  if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(path.join(RUNTIME,'.codespaces-recovery.lock'));}
  report.phase='complete';report.finishedAt=new Date().toISOString();save();console.log('Recuperacao e isolamento de bancos: '+(report.ok?'APROVADOS':'REVISAR'));
}
