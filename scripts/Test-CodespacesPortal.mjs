import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {RUNTIME,tenantPath,writeJSON} from '../infra.mjs';
import {codespacesIdentity,assertPresentationTenant} from '../codespaces.mjs';
import {requestApp} from '../integration.mjs';
const remote=codespacesIdentity(),id=process.argv[2]||'apresentacao',dir=tenantPath(id),t=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json')));
assertPresentationTenant(t);
const credentials=JSON.parse(fs.readFileSync(path.join(dir,'portal-initial.private.json'))),origin=remote.url(8100),checks=[];
const request=(route,options={})=>requestApp('http://127.0.0.1:8100'+route,{...options,headers:{Host:new URL(origin).host,...options.headers}});
let cookie;
const check=async(name,fn)=>{try{await fn();checks.push({name,ok:true});console.log(name+': OK');}catch(e){checks.push({name,ok:false,error:e.message});console.log(name+': FALHOU');}};
try{
  await check('Portal real responde e protege dados sem sessao',async()=>{assert.equal((await request('/')).status,200);assert.equal((await request('/api/me')).status,401);});
  await check('Login recusa origem incorreta',async()=>{assert.equal((await request('/api/login',{method:'POST',headers:{Origin:'https://attacker.invalid','Content-Type':'application/json'},body:{}})).status,403);});
  await check('Login real cria sessao HttpOnly, Secure e SameSite',async()=>{
    const r=await request('/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:{tenant:id,username:credentials.username,password:credentials.password}});
    assert.equal(r.status,200);const header=r.headers['set-cookie']?.[0]||'';
    for(const flag of ['HttpOnly','Secure','SameSite=Strict'])assert.ok(header.includes(flag));cookie=header.split(';')[0];assert.ok(cookie);
  });
  await check('Proxy HTTPS aceita somente fetch same-origin e preserva a protecao da sessao',async()=>{
    const headers={Host:'localhost:8100',Origin:'https://localhost:8100','Content-Type':'application/json',Cookie:cookie};
    for(const site of ['cross-site','same-site'])assert.equal((await request('/api/logout',{method:'POST',headers:{...headers,'Sec-Fetch-Site':site},body:{}})).status,403);
    assert.equal((await request('/api/logout',{method:'POST',headers,body:{}})).status,403);
    assert.equal((await request('/api/me',{headers:{Cookie:cookie}})).status,200);
    assert.equal((await request('/api/logout',{method:'POST',headers:{...headers,'Sec-Fetch-Site':'same-origin'},body:{}})).status,200);
    const r=await request('/api/login',{method:'POST',headers:{...headers,'Sec-Fetch-Site':'same-origin'},body:{tenant:id,username:credentials.username,password:credentials.password}});
    assert.equal(r.status,200);const header=r.headers['set-cookie']?.[0]||'';
    assert.ok(header.includes('Secure'));cookie=header.split(';')[0];assert.ok(cookie);
  });
  await check('Cliente recebe quatro ferramentas da sua empresa com HTTPS',async()=>{
    assert.ok(cookie);const r=await request('/api/me',{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.equal(r.data.company,id);
    assert.deepEqual(r.data.apps.map(a=>a.id).sort(),['chat','cloud','erp','postiz']);
    for(const app of r.data.apps)assert.equal(app.url,t.urls[app.id]);
  });
  await check('Portal recusa administracao e sessao de outra empresa',async()=>{
    for(const route of ['/api/status','/api/action','/api/v1/tenants/'+id+'/keys'])assert.equal((await request(route,{headers:{Cookie:cookie}})).status,404);
    assert.equal((await request('/api/me',{headers:{Cookie:cookie.replace(id+'.','unrelated-company.')}})).status,401);
  });
}finally{
  if(cookie)await check('Logout revoga a sessao real',async()=>{assert.equal((await request('/api/logout',{method:'POST',headers:{Cookie:cookie,Origin:origin}})).status,200);assert.equal((await request('/api/me',{headers:{Cookie:cookie}})).status,401);});
  writeJSON(path.join(RUNTIME,'reports','codespaces-portal-live.json'),{at:new Date().toISOString(),client:id,checks,scope:'HTTP interno do portal real com origem HTTPS configurada; encaminhamento externo deve ser verificado separadamente.'});
}
if(checks.some(c=>!c.ok))process.exitCode=1;
