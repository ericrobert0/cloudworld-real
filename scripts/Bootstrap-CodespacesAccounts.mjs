import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ROOT,tenantPath,secret,writeJSON} from '../infra.mjs';
import {codespacesIdentity,assertPresentationTenant} from '../codespaces.mjs';
import {requestApp} from '../integration.mjs';
import {PortalAccounts} from '../portal.mjs';
import assert from 'node:assert/strict';
const remote=codespacesIdentity(),id=process.argv[2]||'apresentacao',dir=tenantPath(id),t=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json')));
assertPresentationTenant(t);
const email='admin@cloudworld.example';
const credentials=app=>{const file=path.join(dir,app+'-admin.private.json');if(fs.existsSync(file))return {file,value:JSON.parse(fs.readFileSync(file))};const value={email,password:'Aa1!'+secret().slice(0,40),provisioned:false};writeJSON(file,value);return {file,value};};
const post=(base,route,body)=>requestApp(new URL(route,base),{method:'POST',headers:{'Content-Type':'application/json'},body,timeout:30000});
const n=credentials('n8n');
const settings=await requestApp(t.apiUrls.n8n+'/rest/settings');
if(settings.status!==200)throw Error('n8n ainda nao esta pronto.');
if(settings.data?.data?.userManagement?.showSetupOnFirstLoad===true){
  const r=await post(t.apiUrls.n8n,'/rest/owner/setup',{email:n.value.email,password:n.value.password,firstName:'CloudWorld',lastName:'Admin'});
  if(r.status!==200)throw Error('Cadastro inicial n8n falhou; credencial preparada preservada para revisao.');
}
const nLogin=await post(t.apiUrls.n8n,'/rest/login',{emailOrLdapLoginId:n.value.email,password:n.value.password});
if(nLogin.status!==200)throw Error('Login n8n nao confirmado. Nao redefinir conta existente automaticamente.');
n.value.provisioned=true;writeJSON(n.file,n.value);console.log('n8n: conta confirmada, senha somente em arquivo privado.');
const p=credentials('postiz'),registration=await requestApp(t.apiUrls.postiz+'/api/auth/can-register');
if(registration.status!==200)throw Error('Postiz ainda nao esta pronto.');
if(registration.data.register===true){
  const r=await post(t.apiUrls.postiz,'/api/auth/register',{provider:'LOCAL',company:'CloudWorld',email:p.value.email,password:p.value.password});
  if(r.status!==200||r.data?.register!==true)throw Error('Cadastro inicial Postiz nao confirmado.');
}
const pLogin=await post(t.apiUrls.postiz,'/api/auth/login',{provider:'LOCAL',email:p.value.email,password:p.value.password});
if(pLogin.status!==200||pLogin.data?.login!==true)throw Error('Login Postiz nao confirmado. Nao alterar conta existente automaticamente.');
assert.ok((pLogin.headers['set-cookie']||[]).some(c=>c.includes('Domain='+new URL(t.urls.postiz).hostname)),'Cookie Postiz precisa ficar limitado ao hostname encaminhado.');
p.value.provisioned=true;writeJSON(p.file,p.value);console.log('Postiz: conta confirmada, novos cadastros permanecem desabilitados.');
if(!fs.existsSync(path.join(dir,'chat-admin.private.json')))execFileSync(process.execPath,[path.join(ROOT,'manage.mjs'),'chat-admin',id,email],{cwd:ROOT,stdio:'inherit',timeout:120000});
const portalFile=path.join(dir,'portal-initial.private.json');
if(!fs.existsSync(portalFile)){
  const accounts=new PortalAccounts();
  if(accounts.list(id).some(u=>u.username==='admin'))throw Error('Usuario do portal existe sem arquivo inicial. Nao redefinir automaticamente.');
  const u=await accounts.save(id,{username:'admin',name:'CloudWorld',apps:['chat','erp','cloud','postiz']});
  writeJSON(portalFile,{url:remote.url(8100),username:u.username,password:u.initialPassword});
}
console.log('Portal da empresa: conta preparada, credenciais em portal-initial.private.json.');
