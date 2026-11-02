// Baseline hardening and verification for the owned presentation tenant.
// Does not publish ports and does not claim a penetration test or zero risk.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {RUNTIME,tenantPath,writeJSON} from '../infra.mjs';
import {codespacesIdentity,assertPresentationTenant,codespacesGateway} from '../codespaces.mjs';
import {requestApp,IntegrationHub} from '../integration.mjs';
const remote=codespacesIdentity(),id=process.argv[2]||'apresentacao',dir=tenantPath(id),tenant=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json'))),checks=[];
assertPresentationTenant(tenant);
function docker(args,input){try{return execFileSync('docker',args,{input,encoding:'utf8',timeout:45000,maxBuffer:2*1024*1024,stdio:['pipe','pipe','pipe']});}catch{throw Error('Comando de verificacao falhou; saida privada omitida.');}}
const check=async(name,fn)=>{try{await fn();checks.push({name,ok:true});console.log(name+': OK');}catch(error){checks.push({name,ok:false,error:error.message});console.log(name+': FALHOU');}};
await check('Credenciais distintas e fortes nos arquivos gerados',async()=>{
  const values=Object.values(JSON.parse(fs.readFileSync(path.join(dir,'secrets.json'))));
  if(values.some(value=>typeof value!=='string'||value.length<32)||new Set(values).size!==values.length)throw Error('Credenciais precisam de revisao privada.');
});
await check('Containers sem privilegios do host e bancos sem portas publicadas',async()=>{
  const names=docker(['ps','-aq','--filter','label=com.docker.compose.project='+tenant.project]).trim().split(/\s+/).filter(Boolean);
  if(!names.length)throw Error('Containers nao encontrados.');
  const rows=JSON.parse(docker(['inspect',...names]));
  if(rows.some(row=>row.HostConfig.Privileged||row.HostConfig.NetworkMode==='host'||row.HostConfig.PidMode==='host'||row.Mounts.some(m=>m.Source==='/var/run/docker.sock')))throw Error('Isolamento requer revisao.');
  if(rows.filter(row=>row.Config.Labels['com.docker.compose.service'].endsWith('-db')).some(row=>Object.values(row.NetworkSettings.Ports||{}).some(ports=>ports?.length)))throw Error('Banco possui porta publicada.');
  const chat=rows.find(row=>row.Config.Labels['com.docker.compose.service']==='chat');
  if(!chat?.Config.Env.includes('ENABLE_ACCOUNT_SIGNUP=false'))throw Error('Cadastro do Chatwoot precisa ser bloqueado.');
});
await check('ERPNext com cadastro publico desativado',async()=>{
  const code="import os;os.chdir('/home/frappe/frappe-bench/sites');import frappe;frappe.init(site='frontend');frappe.connect();frappe.db.set_single_value('Website Settings','disable_signup',1);frappe.db.commit();frappe.clear_cache();assert int(frappe.db.get_single_value('Website Settings','disable_signup'))==1;frappe.destroy()";
  docker(['exec',tenant.project+'-erp-backend-1','/home/frappe/frappe-bench/env/bin/python','-c',code]);
});
await check('Nextcloud com protecao contra tentativas e sem aplicativo de cadastro aberto',async()=>{
  docker(['exec','-u','www-data',tenant.project+'-cloud-1','php','occ','config:system:set','auth.bruteforce.protection.enabled','--type=boolean','--value=true']);
  const apps=JSON.parse(docker(['exec','-u','www-data',tenant.project+'-cloud-1','php','occ','app:list','--output=json']));
  if(apps.enabled?.registration)throw Error('Aplicativo de cadastro aberto requer revisao.');
});
await check('Proxy com cabecalhos de seguranca e configuracao validada',async()=>{
  const file=path.join(dir,'Caddyfile'),previous=fs.readFileSync(file),backup=file+'.before-hardening';
  if(!fs.existsSync(backup))fs.writeFileSync(backup,previous,{mode:0o600,flag:'wx'});
  try{
    fs.writeFileSync(file,codespacesGateway(tenant.urls));
    docker(['exec',tenant.project+'-ingress-1','caddy','validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile']);
    docker(['exec',tenant.project+'-ingress-1','caddy','reload','--config','/etc/caddy/Caddyfile','--adapter','caddyfile']);
  }catch(error){fs.writeFileSync(file,previous);throw error;}
  for(const [app,url] of Object.entries(tenant.apiUrls)){
    const r=await requestApp(url+'/');
    if(r.headers['x-content-type-options']!=='nosniff'||!r.headers['x-frame-options']||!r.headers['strict-transport-security'])throw Error('Cabecalhos do proxy incompletos em '+app+'.');
  }
});
await check('Postiz sem novas inscricoes publicas',async()=>{
  const r=await requestApp(tenant.apiUrls.postiz+'/api/auth/can-register');
  if(r.status!==200||r.data?.register!==false)throw Error('Cadastro do Postiz precisa de revisao.');
});
const protectedRoutes={auth:'/api/v3/core/users/me/',chat:'/api/v1/accounts/1/contacts',erp:'/api/resource/Customer',cloud:'/remote.php/dav/files/admin/',postiz:'/api/public/v1/integrations'};
for(const [app,route] of Object.entries(protectedRoutes))await check(app+': dados recusados sem autenticacao',async()=>{
  const r=await requestApp(tenant.apiUrls[app]+route);
  if(![401,403].includes(r.status))throw Error('Protecao deve ser revisada; HTTP '+r.status);
});
await check('Portal recusa dados privados e arquivos de configuracao sem sessao',async()=>{
  for(const [route,status] of [['/api/me',401],['/runtime/panel-password.txt',404],['/api/status',404]]){
    const r=await requestApp('http://127.0.0.1:8100'+route,{headers:{Host:new URL(remote.url(8100)).host}});
    if(r.status!==status)throw Error('Portal exige revisao de isolamento.');
    if(!r.headers['strict-transport-security']||r.headers['x-frame-options']!=='DENY'||!r.headers['content-security-policy'])throw Error('Cabecalhos de protecao do portal incompletos.');
  }
});
const hub=new IntegrationHub();
for(const app of ['auth','chat','erp','cloud','postiz','n8n'])await check(app+': conector autenticado apos protecoes',async()=>{const r=await hub.invoke(id,app,'check');if(!r.ok||r.authentication!=='verified')throw Error('Conector requer nova validacao.');});
writeJSON(path.join(RUNTIME,'reports','security-before-publication.json'),{at:new Date().toISOString(),client:id,ok:checks.every(c=>c.ok),checks,portsPublishedByThisScript:false,scope:'Verificacao funcional de controles basicos; nao e pentest, auditoria completa ou garantia contra ataques. MFA, atualizacoes continuas e backup fora do host ainda precisam de operacao propria.'});
if(checks.some(c=>!c.ok))process.exitCode=1;
