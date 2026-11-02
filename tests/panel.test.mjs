import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {setTimeout} from 'node:timers/promises';
import os from 'node:os';
process.env.VW_RUNTIME_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'vlan-world-test-'));
const {ROOT,RUNTIME,createTenant}=await import('../infra.mjs');
test('painel exige autenticacao, rejeita CSRF e Host falso; pagina tem JS valido',async()=>{
  createTenant('callback','callback.localhost',8493);
  const port=18199,base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,[path.join(ROOT,'panel.mjs')],{env:{...process.env,VW_PANEL_PORT:String(port)},windowsHide:true,stdio:'ignore'});
  try{
    let response;for(let i=0;i<60;i++){try{response=await fetch(base);break;}catch{await setTimeout(100);}}
    assert.equal(response?.status,401);
    const password=fs.readFileSync(path.join(RUNTIME,'panel-password.txt'),'utf8').trim();
    const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')};
    const page=await fetch(base,{headers});assert.equal(page.status,200);
    const html=await page.text();const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new vm.Script(script));
    assert.ok(html.includes('Central de operações'));
    for(const asset of ['/assets/bootstrap.min.css','/assets/panel.css']){const r=await fetch(base+asset,{headers});assert.equal(r.status,200);assert.ok(r.headers.get('content-type').includes('text/css'));assert.ok((await r.text()).length>1000);}
    assert.equal((await fetch(base+'/assets/../secrets.json',{headers})).status,404);
    assert.equal((await fetch(base+'/api/status',{headers})).status,200);
    const invalidHost=await new Promise((resolve,reject)=>{const req=http.get(base,{headers:{...headers,Host:'attacker.invalid'}},r=>{r.resume();resolve(r.statusCode);});req.on('error',reject);});
    assert.equal(invalidHost,403);
    const callback=async authorization=>new Promise((resolve,reject)=>{const req=http.get(base+'/api/v1/tenants/callback/events',{headers:{Host:`host.docker.internal:${port}`,Authorization:authorization}},r=>{r.resume();resolve(r.statusCode);});req.on('error',reject);});
    assert.equal(await callback('Bearer invalid'),401);
    assert.equal(await callback(headers.Authorization),403);
    const post={method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action:'suspend',id:'piloto'})};
    assert.equal((await fetch(base+'/api/action',post)).status,403);
    assert.equal((await fetch(base+'/api/action',{...post,headers:{...post.headers,Origin:'https://attacker.invalid'}})).status,403);
    assert.equal((await fetch(base+'/api/action',{...post,headers:{...post.headers,Origin:base},body:JSON.stringify({action:'create',id:'../escape'})})).status,400);
  }finally{child.kill();}
});

test('painel atras de HTTPS aceita somente o host e a origem configurados',async()=>{
  createTenant('proxyapi');
  const port=18200,origin='https://example-cloudworld-8099.app.github.dev';
  const child=spawn(process.execPath,[path.join(ROOT,'panel.mjs')],{env:{...process.env,VW_PANEL_PORT:String(port),CW_PANEL_ORIGIN:origin,CW_PANEL_PROXY_HOST:`localhost:${port}`},windowsHide:true,stdio:'ignore'});
  try{
    for(let i=0;i<60;i++){try{await fetch(`http://127.0.0.1:${port}`);break;}catch{await setTimeout(100);}}
    const password=fs.readFileSync(path.join(RUNTIME,'panel-password.txt'),'utf8').trim();
    const request=(route,headers={},body)=>new Promise((resolve,reject)=>{
      const req=http.request({hostname:'127.0.0.1',port,path:route,method:body?'POST':'GET',headers:{Host:new URL(origin).host,...headers}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end(body);
    });
    assert.equal(await request('/'),401);
    const auth={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')};
    assert.equal(await request('/',auth),200);
    assert.equal(await request('/',{...auth,Host:`localhost:${port}`}),200);
    assert.equal(await request('/',{...auth,Host:'attacker.invalid'}),403);
    assert.equal(await request('/',{...auth,Host:'attacker.invalid','X-Forwarded-Host':new URL(origin).host}),403);
    const payload=JSON.stringify({action:'create',id:'../escape'}),headers={...auth,'Content-Type':'application/json'};
    assert.equal(await request('/api/action',{...headers,Origin:origin},payload),400);
    assert.equal(await request('/api/action',{...headers,Origin:'https://attacker.invalid'},payload),403);
    const forwarded={...headers,Host:`localhost:${port}`,Origin:`https://localhost:${port}`,'Sec-Fetch-Site':'same-origin'};
    assert.equal(await request('/api/action',forwarded,payload),400);
    assert.equal(await request('/api/action',{...forwarded,'Sec-Fetch-Site':'cross-site'},payload),403);
    assert.equal(await request('/api/v1/tenants/proxyapi/keys',forwarded,JSON.stringify({scopes:['invalid']})),400);
  }finally{child.kill();}
});
