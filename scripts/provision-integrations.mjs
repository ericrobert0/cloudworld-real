// Local pilot provisioning. Captures credentials privately; never logs child output.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {IntegrationHub,atomicJSON} from '../integration.mjs';
import {ROOT,tenantPath,secret} from '../infra.mjs';
import {assertPresentationTenant} from '../codespaces.mjs';
import {containerCommand} from '../container-runtime.mjs';
import {contactFlow,contactWorkflow} from '../contact-flow.mjs';
const id=process.argv[2]||'piloto',dir=tenantPath(id),tenant=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json'))),hub=new IntegrationHub();
assertPresentationTenant(tenant);
const appOption=process.argv.slice(3).find(value=>value.startsWith('--apps=')),selected=appOption?appOption.slice(7).split(','):null;
if(selected&&(!selected.length||selected.some(app=>!['chat','erp','n8n','auth','cloud','postiz','waha'].includes(app))))throw Error('Lista de aplicacoes invalida');
if(process.argv.slice(3).some(value=>value!==appOption&&value!=='--repair-cloud-user'))throw Error('Opcao desconhecida');
const container=name=>tenant.project+'-'+name+'-1';
function run(args,input){return new Promise((resolve,reject)=>{
  const cli=containerCommand(args);const p=spawn(cli.command,cli.args,{env:cli.env,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>p.kill(),120000);
  p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',code=>{clearTimeout(timer);if(code!==0)reject(Object.assign(Error('Comando administrativo falhou (saida retida para nao expor credenciais)'),{privateOutput:out+'\n'+err}));else resolve(out);});p.stdin.end(input||'');
});}
const exec=(name,args,input)=>run(['exec','-i',container(name),...args],input);
const sql=(name,query)=>exec(name,['sh','-c','exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA'],query);
const marked=s=>{const line=s.split('\n').find(l=>l.startsWith('CWJSON:'));if(!line)throw Error('Resposta administrativa inesperada');return JSON.parse(line.slice(7));};
const checks=[];
async function stage(app,fn){if(selected&&!selected.includes(app))return;try{
  if(!hub.publicSettings(id).connectors[app].configured||(app==='cloud'&&process.argv.includes('--repair-cloud-user')))hub.configure(id,{connectors:{[app]:{enabled:true,...await fn()}}});
  let result;try{result=await hub.invoke(id,app,'check');}catch(e){
    if(app!=='erp'||e.message!=='erp: HTTP 401')throw e;
    await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[path.join(ROOT,'scripts/Check-ERPIntegration.mjs'),id,'--repair-stored-secret'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
      let diagnostic='';const timer=setTimeout(()=>child.kill(),35000);
      for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>diagnostic=(diagnostic+chunk).slice(-65536));
      child.on('error',error=>{clearTimeout(timer);reject(error);});
      child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Object.assign(Error('Credencial ERP precisa de revisao; nenhuma chave foi regenerada'),{privateOutput:diagnostic}));});
    });
    result=await hub.invoke(id,app,'check');
  }checks.push({app,ok:true,authentication:result.authentication});console.log(app+': conectado');
}catch(e){if(e.privateOutput)fs.writeFileSync(path.join(dir,'integration-'+app+'-diagnostic.private.txt'),e.privateOutput,{mode:0o600});checks.push({app,ok:false,error:e.status?e.message:e.message});console.log(app+': pendente (sem alterar demais conexoes)');}}
if(tenant.deferredServices?.waha)console.log('waha: adiado, sem numero conectado');
else await stage('waha',async()=>({token:JSON.parse(fs.readFileSync(path.join(dir,'secrets.json'))).waha}));
await stage('auth',async()=>{
  const code=`import json\nfrom authentik.core.models import User, Token, TokenIntents\nfrom authentik.rbac.models import Role\nu,created=User.objects.get_or_create(username='cloudworld-integration',defaults={'name':'CloudWorld Integration','type':'service_account','is_active':True})\nr,created=Role.objects.get_or_create(name='CloudWorld Integration Read Users')\nr.assign_perms('authentik_core.view_user')\nu.roles.add(r)\nt,created=Token.objects.get_or_create(identifier='cloudworld-integration',defaults={'user':u,'intent':TokenIntents.INTENT_API,'expiring':False,'description':'CloudWorld local API read-only users'})\nprint('CWJSON:'+json.dumps({'token':t.key}))\n`;
  return marked(await exec('auth',['ak','shell','-c',code]));
});
await stage('chat',async()=>{
  const ruby=`require 'json'; a=Account.first || Account.create!(name:'CloudWorld ${id}'); u=User.find_by(email:'cloudworld-integration@local.invalid'); unless u; u=User.new(name:'CloudWorld Integration',email:'cloudworld-integration@local.invalid',password:'Aa1!'+SecureRandom.hex(32)); u.skip_confirmation!; u.save!; end; AccountUser.find_or_create_by!(account:a,user:u){|au|au.role=:agent}; t=u.access_token || u.create_access_token!; puts 'CWJSON:'+{token:t.token,accountId:a.id.to_s}.to_json`;
  return marked(await exec('chat',['bundle','exec','rails','runner','-'],ruby));
});
await stage('erp',async()=>{
  const code=`import os\nos.chdir('/home/frappe/frappe-bench/sites')\nimport frappe,json\nfrappe.init(site='frontend')\nfrappe.connect()\nfrappe.set_user('Administrator')\nemail='cloudworld-integration@local.invalid'\nif not frappe.db.exists('User',email):\n u=frappe.get_doc({'doctype':'User','email':email,'first_name':'CloudWorld Integration','enabled':1,'send_welcome_email':0,'user_type':'System User','roles':[{'role':'Sales User'}]})\n u.insert(ignore_permissions=True)\nfrom frappe.core.doctype.user.user import generate_keys\nresult=generate_keys(email)\nfrappe.db.commit()\nprint('CWJSON:'+json.dumps({'apiKey':frappe.db.get_value('User',email,'api_key'),'apiSecret':result['api_secret']}))\nfrappe.destroy()\n`;
  return marked(await exec('erp-backend',['/home/frappe/frappe-bench/env/bin/python','-'],code));
});
await stage('cloud',async()=>{
  const password=hub.settings(id).connectors.cloud?.password||secret();const code=`$d=json_decode(stream_get_contents(STDIN),true);putenv('OC_PASS='.$d['password']);putenv('NC_PASS='.$d['password']);$argv=['occ','user:add','--password-from-env','--display-name=CloudWorld Integration','--no-interaction','cloudworld-integration'];$argc=count($argv);$_SERVER['argv']=$argv;$_SERVER['argc']=$argc;require '/var/www/html/occ';`;
  await run(['exec','-i','-u','www-data',container('cloud'),'php','-r',code],JSON.stringify({password}));return {username:'cloudworld-integration',password};
});
await stage('postiz',async()=>{
  const columns=(await sql('postiz-db',"SELECT column_name FROM information_schema.columns WHERE table_name='Organization';")).trim().split('\n');
  const column=columns.find(c=>/^apiKey$/i.test(c));if(!column)throw Error('Campo API nao encontrado');
  const token=(await sql('postiz-db',`SELECT "${column}" FROM "Organization" WHERE "${column}" IS NOT NULL LIMIT 1;`)).trim();if(!token)throw Error('Organizacao sem chave Public API');return {token};
});
// n8n workflow and credential are created only in this tenant's database.
await stage('n8n',async()=>{
  const planFile=path.join(dir,'n8n-contact-plan.private.json');
  let plan=fs.existsSync(planFile)?JSON.parse(fs.readFileSync(planFile)):null;
  if(!plan){
    const occupied=await sql('n8n-db',`SELECT id FROM workflow_entity WHERE id='${contactFlow.workflowId}';`);
    const occupiedCredential=await sql('n8n-db',`SELECT id FROM credentials_entity WHERE id='${contactFlow.credentialId}';`);
    if(occupied.trim()||occupiedCredential.trim())throw Error('Workflow ou credencial ja existe sem plano gerenciado; nenhuma sobrescrita executada');
    plan={...contactFlow,token:secret()};atomicJSON(planFile,plan);
  }
  const {token,credentialId,workflowId}=plan;
  const owner=(await sql('n8n-db','SELECT id FROM "user" WHERE email IS NOT NULL ORDER BY "createdAt" LIMIT 1;')).trim();if(!owner)throw Error('Cadastre o proprietario no n8n primeiro');
  const creds=[{id:credentialId,name:'CloudWorld contact receiver',type:'httpHeaderAuth',data:{name:'X-CloudWorld-Key',value:token}}];
  const workflow=contactWorkflow();
  const upload=async(file,data)=>exec('n8n',['node','-e',`const fs=require('fs');let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>fs.writeFileSync(${JSON.stringify(file)},s,{mode:384}));`],JSON.stringify(data));
  const cp='/tmp/cloudworld-credential.json',wp='/tmp/cloudworld-workflow.json';
  try{await upload(cp,creds);await upload(wp,[workflow]);await exec('n8n',['n8n','import:credentials','--input='+cp,'--userId='+owner]);await exec('n8n',['n8n','import:workflow','--input='+wp,'--userId='+owner]);await exec('n8n',['n8n','publish:workflow','--id='+workflowId]);}
  finally{await exec('n8n',['node','-e',`for(const f of ${JSON.stringify([cp,wp])})require('fs').rmSync(f,{force:true})`]).catch(()=>{});}
  atomicJSON(path.join(dir,'n8n-cloudworld-workflow.json'),{id:workflowId,credentialId,webhookPath:contactFlow.webhookPath,restartRequired:true});
  return {token,webhookPath:contactFlow.webhookPath,requireAck:true};
});
atomicJSON(path.join(dir,'integration-provision-report.json'),{at:new Date().toISOString(),checks,scope:'APIs locais; sem mensagens WhatsApp ou publicacoes externas'});
if(checks.some(c=>!c.ok))process.exitCode=1;
