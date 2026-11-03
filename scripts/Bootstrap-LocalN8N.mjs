import fs from 'node:fs';
import path from 'node:path';
import {tenantPath,secret,writeJSON} from '../infra.mjs';
import {requestApp} from '../integration.mjs';
const id=process.argv[2]||'piloto',dir=tenantPath(id),tenant=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json')));
if(!tenant.local||process.argv.length>3)throw Error('Bootstrap restrito a uma empresa local');
const base=tenant.urls.n8n,file=path.join(dir,'n8n-admin.private.json');
const settings=await requestApp(base+'/rest/settings');
if(settings.status!==200)throw Error('n8n ainda nao esta pronto');
const setup=settings.data?.data?.userManagement?.showSetupOnFirstLoad;
if(typeof setup!=='boolean')throw Error('Resposta de configuracao n8n inesperada');
let credentials=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
const post=(route,body)=>requestApp(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body,timeout:30000});
if(setup){
  if(!credentials){credentials={email:'admin@'+tenant.domain,password:'Aa1!'+secret().slice(0,40),provisioned:false};writeJSON(file,credentials);}
  const result=await post('/rest/owner/setup',{email:credentials.email,password:credentials.password,firstName:'CloudWorld',lastName:'Admin'});
  if(result.status!==200)throw Error('Cadastro inicial n8n falhou; credencial privada preservada para revisao');
}
if(credentials){
  const result=await post('/rest/login',{emailOrLdapLoginId:credentials.email,password:credentials.password});
  if(result.status!==200)throw Error('Login n8n nao confirmado; nenhuma senha existente foi redefinida');
  writeJSON(file,{...credentials,provisioned:true});console.log('n8n: conta administrativa confirmada; senha somente em arquivo privado');
}else console.log('n8n: proprietario existente preservado; nenhuma conta ou senha alterada');
