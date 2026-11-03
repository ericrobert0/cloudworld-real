import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {ROOT,tenantPath} from '../infra.mjs';
import {IntegrationHub,atomicJSON} from '../integration.mjs';
import {containerCommand} from '../container-runtime.mjs';
import {contactRoutes,contactFlow} from '../contact-flow.mjs';
const id=process.argv[2]||'piloto',dir=tenantPath(id),tenant=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json')));
if(!tenant.local||process.argv.length>3)throw Error('Preparo restrito a uma empresa local');
const hub=new IntegrationHub(),before=hub.settings(id);contactRoutes(before.routes);
const lock=path.join(dir,'.operation.lock');let fd;
try{fd=fs.openSync(lock,'wx',0o600);}catch{throw Error('Empresa em manutencao; aguarde a operacao atual');}
fs.writeFileSync(fd,JSON.stringify({pid:process.pid,action:'prepare-contact-flow',at:new Date().toISOString()}));
const diagnostic=path.join(dir,'contact-flow-setup.private.log');
function run(command,args,env=process.env){return new Promise((resolve,reject)=>{
  const log=fs.openSync(diagnostic,'a',0o600),child=spawn(command,args,{env,cwd:ROOT,stdio:['ignore',log,log],windowsHide:true});let closed=false;
  const close=()=>{if(!closed){closed=true;fs.closeSync(log);}};
  const timer=setTimeout(()=>child.kill(),240000);
  child.on('error',()=>{clearTimeout(timer);close();reject(Error('Falha ao iniciar etapa; consulte o diagnostico privado'));});
  child.on('close',code=>{clearTimeout(timer);close();code===0?resolve():reject(Error('Etapa falhou; consulte contact-flow-setup.private.log da empresa'));});
});}
try{
  atomicJSON(path.join(dir,'contact-flow-before-'+Date.now()+'.private.json'),before);
  await run(process.execPath,[path.join(ROOT,'scripts/Bootstrap-LocalN8N.mjs'),id]);console.log('Conta n8n pronta');
  await run(process.execPath,[path.join(ROOT,'scripts/bootstrap-erp-integration.mjs'),id]);console.log('Cadastros genericos do ERP prontos');
  await run(process.execPath,[path.join(ROOT,'scripts/provision-integrations.mjs'),id,'--apps=chat,erp,n8n']);console.log('Conectores Chatwoot, ERP e n8n preparados');
  const connector=hub.settings(id).connectors.n8n;
  if(connector.webhookPath!==contactFlow.webhookPath||connector.requireAck!==true)throw Error('Conector n8n existente nao pertence ao fluxo gerenciado; revise antes de continuar');
  const planFile=path.join(dir,'n8n-cloudworld-workflow.json'),plan=JSON.parse(fs.readFileSync(planFile));
  if(plan.id!==contactFlow.workflowId)throw Error('Plano n8n inesperado');
  if(plan.restartRequired){
    const cli=containerCommand(['compose','--project-directory',dir,'-f',path.join(dir,'compose.json'),'restart','n8n']);await run(cli.command,cli.args,cli.env);
    let ready=false;
    for(let i=0;i<30;i++){try{if((await hub.invoke(id,'n8n','check')).ok){ready=true;break;}}catch{}await delay(1000);}
    if(!ready)throw Error('n8n nao ficou pronto apos ativar o workflow');
    atomicJSON(planFile,{...plan,restartRequired:false});
  }
  for(const app of ['chat','erp','n8n'])await hub.invoke(id,app,'check');
  const current=hub.settings(id);hub.configure(id,{routes:contactRoutes(current.routes),sources:{chatContacts:true}});
  atomicJSON(path.join(dir,'contact-flow-setup.json'),{at:new Date().toISOString(),tenant:id,workflowId:contactFlow.workflowId,state:'configured',scope:'Contatos para ERP e workflow de confirmacao; sem mensagens externas'});
}finally{fs.closeSync(fd);fs.unlinkSync(lock);}
await hub.pollSources([id]);
if(hub.publicSettings(id).sources.chatContacts.error)throw Error('Falha na primeira leitura de contatos; consulte o painel');
console.log('Fluxo de contatos preparado; execute scripts/Test-ContactFlow.mjs para validar com um contato identificado');
