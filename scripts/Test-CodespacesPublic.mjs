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
writeJSON(path.join(RUNTIME,'reports','codespaces-public-http.json'),{at:new Date().toISOString(),checks,scope:'HTTPS publico sem credenciais; nao substitui login e operacao em navegador.'});
for(const check of checks)console.log(check.application+': '+(check.ok?'OK HTTP '+check.status:'FALHOU '+(check.status||check.error)));
if(checks.some(check=>!check.ok))process.exitCode=1;
