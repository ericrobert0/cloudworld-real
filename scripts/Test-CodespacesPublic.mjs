import path from 'node:path';
import {RUNTIME,writeJSON} from '../infra.mjs';
import {codespacesIdentity} from '../codespaces.mjs';
const remote=codespacesIdentity();
const targets={portal:8100,auth:18001,chat:18002,postiz:18004,cloud:18005,erp:18006};
const checks=await Promise.all(Object.entries(targets).map(async([application,port])=>{
  const url=remote.url(port)+'/';
  try{
    const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});
    const location=response.headers.get('location');
    if(location&&new URL(location,url).origin!==new URL(url).origin)throw Error('Redirecionamento externo; login da ferramenta nao foi confirmado.');
    // Do not record cookies, authentication headers or page bodies.
    await response.body?.cancel();
    return {application,url,status:response.status,ok:response.status>=200&&response.status<400};
  }catch(error){return {application,url,ok:false,error:error.message};}
}));
const protectedPaths={portal:'/api/me',auth:'/api/v3/core/users/me/',chat:'/api/v1/accounts/1/contacts',postiz:'/api/public/v1/integrations',cloud:'/remote.php/dav/files/admin/',erp:'/api/resource/Customer'};
for(const [application,route] of Object.entries(protectedPaths)){
  const url=remote.url(targets[application])+route;
  try{const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});await r.body?.cancel();checks.push({application:application+'-dados-privados',url,status:r.status,ok:[401,403].includes(r.status)});}
  catch{checks.push({application:application+'-dados-privados',url,ok:false,error:'Verificacao HTTPS indisponivel.'});}
}
for(const [application,port] of Object.entries({operador:8099,n8n:18003})){
  const url=remote.url(port)+'/';
  try{
    const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)}),location=r.headers.get('location');await r.body?.cancel();
    checks.push({application:application+'-acesso-privado',url,status:r.status,ok:[401,403,404].includes(r.status)||(r.status===302&&!!location&&new URL(location,url).origin!==new URL(url).origin)});
  }catch{checks.push({application:application+'-acesso-privado',url,ok:false,error:'Nao foi possivel confirmar a barreira privada.'});}
}
writeJSON(path.join(RUNTIME,'reports','codespaces-public-http.json'),{at:new Date().toISOString(),checks,scope:'HTTPS sem credenciais: disponibilidade, recusa de dados privados e barreira de acesso administrativo. Nao e auditoria completa nem garantia contra ataques.'});
for(const check of checks)console.log(check.application+': '+(check.ok?'OK HTTP '+check.status:'FALHOU '+(check.status||check.error)));
if(checks.some(check=>!check.ok))process.exitCode=1;
