import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {ROOT,RUNTIME,tenantPath,createTenant,writeJSON} from './infra.mjs';
import {assertHostStorage} from './host-policy.mjs';

function checkStorage(info){
  const marker=name=>{const p=path.join(RUNTIME,name);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):null;};
  assertHostStorage({platform:process.platform,info,windowsConfirmed:fs.existsSync(path.join(RUNTIME,'docker-storage-confirmed.json')),linuxConfirmation:marker('linux-storage-confirmed.json'),codespaceName:process.env.CODESPACES==='true'?process.env.CODESPACE_NAME:null,codespacesConfirmation:marker('codespaces-storage-confirmed.json')});
  if(process.env.CODESPACES==='true'){
    const disk=fs.statfsSync(info.DockerRootDir,{bigint:true});
    if(Number(disk.bavail*disk.bsize)/1024**3<3)throw Error('Codespace com menos de 3 GiB livres; operacao interrompida para preservar os dados.');
  }
}

function run(args,{capture=false,output,input}={}) {
  return new Promise((resolve,reject)=>{
    // Limit concurrent Engine calls in the small presentation host.
    const env=process.env.CODESPACES==='true'?{...process.env,COMPOSE_PARALLEL_LIMIT:process.env.COMPOSE_PARALLEL_LIMIT==='1'?'1':'2'}:process.env;
    const p=spawn('docker',args,{env,windowsHide:true,stdio:[input?'pipe':'ignore',capture||output?'pipe':'inherit','pipe']});
    let stdout='',stderr=''; if(capture) p.stdout.on('data',d=>stdout+=d);
    p.stderr.on('data',d=>{stderr+=d;if(!capture)process.stderr.write(d);});
    const streams=[];
    if(output) streams.push(pipeline(p.stdout,fs.createWriteStream(output)));
    if(input) streams.push(pipeline(fs.createReadStream(input),p.stdin));
    p.on('error',reject);p.on('close',async code=>{
      try{await Promise.all(streams);if(code!==0)throw Error(`docker ${args[0]} falhou (${code}): ${stderr.slice(-2000)}`);resolve(stdout.trim());}catch(e){reject(e);}
    });
  });
}
export async function main(args=process.argv.slice(2)) {
  const [action,id,...rest]=args;
  if(action==='create') {
    if(process.env.CODESPACES==='true')throw Error('Este Codespace suporta uma empresa de apresentacao. Novos clientes exigem outro ambiente dimensionado.');
    const domain=rest[0]||`${id}.localhost`,port=Number(rest[1]||8443);
    for(const d of fs.readdirSync(path.join(RUNTIME,'tenants'),{withFileTypes:true}).filter(d=>d.isDirectory())) {
      const p=path.join(RUNTIME,'tenants',d.name,'tenant.json');if(!fs.existsSync(p))continue;
      const t=JSON.parse(fs.readFileSync(p));
      if(Math.abs(t.port-port)<4)throw Error('Porta reservada por outro cliente. Use intervalo de pelo menos 4 portas.');
      if(t.domain===domain)throw Error('Dominio ja reservado por outro cliente.');
    }
    console.log(JSON.stringify(createTenant(id,domain,port),null,2));return;
  }
  if(action==='list') {
    const base=path.join(RUNTIME,'tenants');fs.mkdirSync(base,{recursive:true});
    console.log(JSON.stringify(fs.readdirSync(base).filter(n=>fs.existsSync(path.join(base,n,'tenant.json'))).map(n=>JSON.parse(fs.readFileSync(path.join(base,n,'tenant.json')))),null,2));return;
  }
  const dir=tenantPath(id);const t=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json')));
  const composePath=path.join(dir,'compose.json'),c=JSON.parse(fs.readFileSync(composePath));
  const dc=(...a)=>run(['compose','--project-directory',dir,'-f',composePath,...a]);
  if(action==='validate') { await dc('config','--quiet');console.log('Compose valido.');return; }
  if(action==='status') {await dc('ps','--all');return;}
  let lock;try{lock=fs.openSync(path.join(dir,'.operation.lock'),'wx');}catch{throw Error('Operacao em andamento. Se houve queda, confira processos antes de remover .operation.lock.');}
  try {
    if(action==='up'||action==='resume') {
      const info=JSON.parse(await run(['info','--format','{{json .}}'],{capture:true}));
      checkStorage(info);
      if(action==='up') {
        await dc('config','--quiet');
        if(process.env.CODESPACES==='true'){
          // Pull once per image, sequentially; avoid parallel extraction peaks.
          const refs=[...new Set(Object.values(c.services).filter(s=>!s.profiles?.length).map(s=>s.image))];
          const cost=ref=>ref.includes('postiz-app')?7:ref.includes('erpnext')?4.5:ref.includes('chatwoot')?2.8:ref.includes('nextcloud')?2.1:ref.includes('goauthentik')?2:ref.includes('n8n')?1.9:0.8;
          for(const ref of refs.sort((a,b)=>cost(b)-cost(a))){
            const installed=await run(['image','ls','--quiet',ref],{capture:true});
            if(installed)continue;
            const disk=fs.statfsSync(info.DockerRootDir,{bigint:true});
            if(Number(disk.bavail*disk.bsize)/1024**3<cost(ref)*1.5+3)throw Error('Espaco insuficiente para baixar a proxima imagem com margem. Nenhum volume foi removido.');
            await run(['pull',ref]);
          }
        }else await dc('pull');
        if(!fs.existsSync(path.join(dir,'images.lock.json'))) {
          const requested=JSON.parse(fs.readFileSync(path.join(dir,'images.requested.json')));
          for(const [name,ref] of Object.entries(requested)) {
            if(c.services[name].profiles?.length)continue;
            const inspect=JSON.parse(await run(['image','inspect',ref],{capture:true}))[0];
            if(!inspect.RepoDigests?.length)throw Error(`Imagem sem digest: ${ref}`);
            c.services[name].image=inspect.RepoDigests[0];
          }
          writeJSON(composePath,c);writeJSON(path.join(dir,'images.lock.json'),Object.fromEntries(Object.entries(c.services).map(([n,s])=>[n,s.image])));
        }
      }
      // Etapas reduzem picos de memoria durante migracoes.
      const databases=Object.keys(c.services).filter(n=>n.endsWith('-db'));
      await dc('up','-d','--wait','--wait-timeout','180',...databases);
      for(const init of ['chat-init','erp-init']) {await dc('up','-d',init);const code=await run(['compose','--project-directory',dir,'-f',composePath,'wait',init],{capture:true});console.log(`${init}: ${code||'concluido'}`);}
      await dc('up','-d','--wait','--wait-timeout','1200');
      if(c.services.mixpost&&!fs.existsSync(path.join(dir,'mixpost-admin.private.json'))){const {configureMixpostAdmin}=await import('./scripts/mixpost-admin.mjs');await configureMixpostAdmin(id);}
      console.log('Containers iniciados. Execute smoke para testar HTTP e bancos.');
    } else if(action==='suspend') {
      await dc('stop','--timeout','90');
    } else if(action==='backup') {
      await backup(t,c,dir,dc);
    } else if(action==='update') {
      const info=JSON.parse(await run(['info','--format','{{json .}}'],{capture:true}));
      checkStorage(info);
      if(process.env.CODESPACES==='true')throw Error('Atualizacao neste Codespace exige revisar espaco para backup e coexistencia das imagens antes de continuar.');
      const [service,image]=rest;
      const requestedPath=path.join(dir,'images.requested.json'),requested=JSON.parse(fs.readFileSync(requestedPath));
      if(!requested[service]||service.endsWith('-db')||service.includes('redis')||service==='wireguard')throw Error('Escolha um servico de aplicacao; bancos/VPN exigem migracao propria.');
      if(!/^[a-zA-Z0-9./_-]+:[a-zA-Z0-9._-]+$/.test(image??'')||image.endsWith(':latest'))throw Error('Informe imagem com versao explicita, sem latest.');
      const repository=ref=>ref.slice(0,ref.lastIndexOf(':'));
      if(repository(image)!==repository(requested[service]))throw Error('A atualizacao deve manter o repositorio da imagem.');
      const group=Object.keys(requested).filter(n=>requested[n]===requested[service]);
      await backup(t,c,dir,dc);fs.copyFileSync(composePath,path.join(dir,'compose.before-update.json'));
      await run(['pull',image]);
      const inspect=JSON.parse(await run(['image','inspect',image],{capture:true}))[0];
      if(!inspect.RepoDigests?.length)throw Error('Imagem sem digest.');
      for(const name of group){c.services[name].image=inspect.RepoDigests[0];requested[name]=image;}
      writeJSON(composePath,c);writeJSON(requestedPath,requested);writeJSON(path.join(dir,'images.lock.json'),Object.fromEntries(Object.entries(c.services).map(([n,s])=>[n,s.image])));
      await dc('up','-d','--wait','--wait-timeout','1200');await smoke(t,c,dir);
      console.log('Atualizacao coordenada concluida: '+group.join(', '));
    } else if(action==='restore-test') {
      await restoreTest(rest[0]);
    } else if(action==='smoke') {
      await smoke(t,c,dir);
    } else if(action==='chat-admin') {
      const mail=rest[0]; if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail??''))throw Error('Informe email valido.');
      // Senha gerada em arquivo privado; nao e registrada no console.
      const {secret}=await import('./infra.mjs'); const password='Aa1!'+secret().slice(0,48);
      const ruby="abort('Usuario existente') if User.exists?(email: ENV.fetch('ADMIN_EMAIL')); ActiveRecord::Base.transaction do; a=Account.find_by(name:ENV.fetch('ACCOUNT_NAME')) || Account.create!(name:ENV.fetch('ACCOUNT_NAME')); u=User.new(name:'Administrador',email:ENV.fetch('ADMIN_EMAIL'),password:ENV.fetch('ADMIN_PASSWORD'),password_confirmation:ENV.fetch('ADMIN_PASSWORD')); u.skip_confirmation!; u.save!; AccountUser.create!(account:a,user:u,role: :administrator); end";
      await dc('exec','-T','-e',`ADMIN_EMAIL=${mail}`,'-e',`ADMIN_PASSWORD=${password}`,'-e',`ACCOUNT_NAME=${id}`,'chat','bundle','exec','rails','runner',ruby);
      writeJSON(path.join(dir,'chat-admin.private.json'),{email:mail,password});console.log('Conta criada; credenciais no arquivo privado do cliente.');
    } else throw Error('Acoes: create, list, validate, up, status, suspend, resume, backup, smoke, chat-admin.');
  } finally {fs.closeSync(lock);fs.unlinkSync(path.join(dir,'.operation.lock'));}
}
async function backup(t,c,dir,dc) {
  const stamp=new Date().toISOString().replaceAll(':','-'),dest=path.join(RUNTIME,'backups',t.id,stamp);
  fs.mkdirSync(dest,{recursive:true});
  const ps=await run(['compose','--project-directory',dir,'-f',path.join(dir,'compose.json'),'ps','--format','json'],{capture:true});
  const rows=ps.trim().startsWith('[')?JSON.parse(ps):ps.split('\n').filter(Boolean).map(x=>JSON.parse(x));
  const running=rows.filter(x=>x.State==='running').map(x=>x.Service);
  const dbs=Object.entries(c.services).filter(([n,s])=>n.endsWith('-db')&&s.environment?.POSTGRES_DB);
  const maria=Object.entries(c.services).filter(([n,s])=>n.endsWith('-db')&&s.environment?.MARIADB_ROOT_PASSWORD);
  const keep=new Set([...dbs.map(([n])=>n),...maria.map(([n])=>n)]);
  if(!running.length)throw Error('Backup requer ambiente ativo. Inicie o cliente antes.');
  const writers=running.filter(n=>!keep.has(n));
  try {
    if(writers.length)await dc('stop','--timeout','90',...writers);
    for(const [name,s] of dbs) {
      await run(['compose','--project-directory',dir,'-f',path.join(dir,'compose.json'),'exec','-T',name,'sh','-ec','pg_dumpall -U "$POSTGRES_USER" --exclude-database=postgres --exclude-database=template1'],{output:path.join(dest,`${name}.sql`)});
    }
    for(const [name] of maria)await run(['compose','--project-directory',dir,'-f',path.join(dir,'compose.json'),'exec','-T',name,'sh','-ec','exec mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --all-databases --single-transaction --routines --events'],{output:path.join(dest,`${name}.sql`)});
    const dbVolumes=keep;
    const volumeNames=Object.keys(c.volumes).filter(v=>!dbVolumes.has(v));
    for(const v of volumeNames) {
      if(v==='wireguard-config') {try{await run(['volume','inspect',`${t.project}_${v}`],{capture:true});}catch{continue;}}
      await run(['run','--rm','--network','none','-v',`${t.project}_${v}:/source:ro`,'alpine:3.22','tar','-C','/source','-czf','-','.'],{output:path.join(dest,`${v}.tgz`)});
    }
    for(const f of ['compose.json','tenant.json','secrets.json','Caddyfile','images.lock.json','mixpost-start.sh','postiz-admin.private.json','mixpost-admin.private.json','integrations.private.json','integration-events.private.json','integration-sources.private.json','monitoring.private.json','n8n-cloudworld-workflow.json','portal-users.private.json','portal-oidc.private.json','resource-profile.json'])if(fs.existsSync(path.join(dir,f)))fs.copyFileSync(path.join(dir,f),path.join(dest,f));
    const {createHash}=await import('node:crypto');
    const hashes={};for(const f of fs.readdirSync(dest)) {const h=createHash('sha256');for await(const chunk of fs.createReadStream(path.join(dest,f)))h.update(chunk);hashes[f]=h.digest('hex');}
    writeJSON(path.join(dest,'manifest.json'),{client:t.id,createdAt:new Date().toISOString(),coldWriters:true,hashes});
    console.log(`Backup completo: ${dest}. Contem segredos; proteja e copie para armazenamento externo criptografado.`);
  } finally {if(writers.length)await dc('start',...writers);}
}
async function smoke(t,c,dir) {
  const report={at:new Date().toISOString(),client:t.id,checks:[]};
  const check=async(name,fn)=>{try{await fn();report.checks.push({name,ok:true});}catch(e){report.checks.push({name,ok:false,error:e.message});}};
  const dcArgs=['compose','--project-directory',dir,'-f',path.join(dir,'compose.json')];
  for(const [name,s] of Object.entries(c.services).filter(([n,s])=>n.endsWith('-db')&&s.environment?.POSTGRES_DB))await check(`${name}: SQL`,()=>run([...dcArgs,'exec','-T',name,'sh','-ec','psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "SELECT 1"']));
  for(const [name,s] of Object.entries(c.services).filter(([n,s])=>n.endsWith('-db')&&s.environment?.MARIADB_ROOT_PASSWORD))await check(`${name}: SQL`,()=>run([...dcArgs,'exec','-T',name,'sh','-ec','mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -e "SELECT 1"']));
  for(const [app,url] of Object.entries(t.apiUrls||t.urls))await check(`${app}: ${t.apiUrls?'gateway interno':'HTTPS'}`,async()=>{
    const target=app==='mixpost'?`${url}/mixpost/login`:app==='postiz'?`${url}/api/auth/can-register`:url;
    // curl preserva Host/SNI. -k somente para CA local gerada pelo Caddy.
    const endpoint=new URL(url);
    const args=['--silent','--show-error','--max-time','45','--output',process.platform==='win32'?'NUL':'/dev/null','--write-out','%{http_code}',...(t.local?['--insecure','--resolve',`${endpoint.hostname}:${endpoint.port||443}:127.0.0.1`]:[]),target];
    const code=await new Promise((resolve,reject)=>{const p=spawn(process.platform==='win32'?'curl.exe':'curl',args,{windowsHide:true});let out='';p.stdout.on('data',d=>out+=d);p.on('error',reject);p.on('exit',n=>n===0?resolve(Number(out)):reject(Error(`curl falhou: ${n}`)));});
    if(code<200||code>=400)throw Error(`HTTP ${code}`);
  });
  const ps=await run([...dcArgs,'ps','--all','--format','json'],{capture:true});
  const rows=ps.trim().startsWith('[')?JSON.parse(ps):ps.split('\n').filter(Boolean).map(x=>JSON.parse(x));
  for(const name of Object.keys(c.services).filter(n=>!c.services[n].profiles?.length))await check(`${name}: estado`,async()=>{const row=rows.find(r=>r.Service===name);const init=name.endsWith('-init')||name==='erp-config';if(!row|| (init?(row.State!=='exited'||row.ExitCode!==0):row.State!=='running') || row.Health==='unhealthy')throw Error(`Estado inesperado: ${row?.State}, exit=${row?.ExitCode}, health=${row?.Health}`);});
  writeJSON(path.join(dir,'smoke-report.json'),report);console.log(JSON.stringify(report,null,2));
  if(report.checks.some(c=>!c.ok))throw Error('Smoke test falhou; veja smoke-report.json.');
}
async function restoreTest(backupDir) {
  if(!backupDir)throw Error('Informe a pasta do backup depois do cliente.');
  const source=path.resolve(backupDir),base=path.resolve(RUNTIME,'backups')+path.sep;
  if(!source.startsWith(base))throw Error('O teste aceita somente backups dentro de runtime/backups.');
  const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json')));
  const {createHash}=await import('node:crypto');
  for(const [name,hash] of Object.entries(manifest.hashes)) {
    if(path.basename(name)!==name)throw Error('Nome invalido no manifesto.');
    const h=createHash('sha256');for await(const chunk of fs.createReadStream(path.join(source,name)))h.update(chunk);
    if(h.digest('hex')!==hash)throw Error(`Backup corrompido: ${name}`);
  }
  const original=JSON.parse(fs.readFileSync(path.join(source,'compose.json')));
  const project=`vw-restore-${Date.now()}`,work=path.join(RUNTIME,'restore-tests',project);
  const c={name:project,services:{},volumes:{}};
  for(const [name,s] of Object.entries(original.services).filter(([n,s])=>n.endsWith('-db')&&(s.environment?.POSTGRES_DB||s.environment?.MARIADB_ROOT_PASSWORD))) {
    const pg=!!s.environment.POSTGRES_DB;
    c.services[name]={image:s.image,environment:pg?{POSTGRES_USER:'restore_admin',POSTGRES_PASSWORD:'restore-temporary-private',POSTGRES_DB:'restore_maintenance'}:s.environment,volumes:[`${name}:${pg?'/var/lib/postgresql/data':'/var/lib/mysql'}`],healthcheck:pg?{test:['CMD-SHELL','pg_isready -U restore_admin -d restore_maintenance'],interval:'5s',retries:30}:s.healthcheck,networks:['default']};
    c.volumes[name]={};
  }
  fs.mkdirSync(work,{recursive:true});writeJSON(path.join(work,'compose.json'),c);
  const dargs=['compose','--project-directory',work,'-f',path.join(work,'compose.json')];
  try {
    await run([...dargs,'up','-d','--wait','--wait-timeout','180']);
    for(const [name,s] of Object.entries(c.services)) {
      const pg=!!s.environment.POSTGRES_DB;
      await run([...dargs,'exec','-T',name,...(pg?['psql','-U','restore_admin','-d','restore_maintenance','-v','ON_ERROR_STOP=1']:['sh','-ec','exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD"'])],{input:path.join(source,`${name}.sql`)});
      if(pg)await run([...dargs,'exec','-T',name,'psql','-U','restore_admin','-d',original.services[name].environment.POSTGRES_DB,'-v','ON_ERROR_STOP=1','-c','SELECT count(*) FROM pg_catalog.pg_tables']);
    }
    for(const f of fs.readdirSync(source).filter(f=>f.endsWith('.tgz'))) {
      const vol=`${project}_${f.slice(0,-4)}`;await run(['volume','create',vol]);
      try{await run(['run','--rm','--network','none','-i','-v',`${vol}:/restore`,'alpine:3.22','tar','-xzf','-','-C','/restore'],{input:path.join(source,f)});}finally{await run(['volume','rm',vol]);}
    }
    writeJSON(path.join(work,'result.json'),{ok:true,at:new Date().toISOString(),source,scope:'Integridade SHA256, importacao SQL e extracao de volumes. Validacao funcional das aplicacoes exige homologacao.'});
    console.log('Restauracao em volumes temporarios passou. Veja result.json em '+work);
  }finally{await run([...dargs,'down','--volumes']);}
}
fs.mkdirSync(path.join(RUNTIME,'tenants'),{recursive:true});
if(process.argv[1]&&path.resolve(process.argv[1])===path.join(ROOT,'manage.mjs'))main().catch(e=>{console.error(e.message);process.exitCode=1;});
