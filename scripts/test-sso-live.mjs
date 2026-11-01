import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {tenantPath,RUNTIME} from '../infra.mjs';
import {requestApp,atomicJSON} from '../integration.mjs';
import {PortalAccounts} from '../portal.mjs';
import {PortalOIDC} from '../oidc.mjs';
const ids=process.argv.slice(2).filter(s=>!s.startsWith('--')),httpMode=!process.argv.includes('--direct');if(!ids.length)ids.push('piloto');
const accounts=new PortalAccounts(),oidc=new PortalOIDC(accounts,{origin:'http://127.0.0.1:8100'}),checks=[];
async function authorize(id){
  const t=JSON.parse(fs.readFileSync(path.join(tenantPath(id),'tenant.json'))),credentials=JSON.parse(fs.readFileSync(path.join(tenantPath(id),'portal-initial.private.json'))),jar=new Map(),authOrigin=new URL(t.urls.auth).origin;
  let start;if(httpMode){const r=await fetch('http://127.0.0.1:8100/api/sso/start',{method:'POST',headers:{Origin:'http://127.0.0.1:8100','Content-Type':'application/json'},body:JSON.stringify({tenant:id})});assert.equal(r.status,200);start=await r.json();start.cookie=r.headers.getSetCookie().find(s=>s.startsWith('cw_oidc=')).split(';')[0].slice(8);}else start=await oidc.start(id);
  async function req(url,method='GET',body){
    if(new URL(url).origin!==authOrigin)throw Error('Redirecionamento fora da identidade esperada');
    const r=await requestApp(url,{method,headers:{Accept:'application/json',Origin:authOrigin,Referer:authOrigin+'/',Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(body?{'Content-Type':'application/json','X-CSRFToken':jar.get('csrftoken')||''}:{})},body,timeout:15000});
    for(const value of r.headers?.['set-cookie']||[]){const part=value.split(';')[0],i=part.indexOf('=');jar.set(part.slice(0,i),part.slice(i+1));}return r;
  }
  let r=await req(start.url),page;
  for(let i=0;i<8&&r.headers?.location;i++){
    const next=new URL(r.headers.location,authOrigin);
    if(next.origin==='http://127.0.0.1:8100')return {id,start,callback:next};
    if(next.pathname.startsWith('/if/flow/')){page=next;break;}
    r=await req(next.href);
  }
  if(!page)throw Error('Fluxo de autenticacao nao encontrado');
  const flowEndpoint=page=>{const slug=page.pathname.split('/').filter(Boolean).at(-1),url=new URL('/api/v3/flows/executor/'+slug+'/',authOrigin);url.searchParams.set('query',page.search.slice(1));return url;};
  let executor=flowEndpoint(page);
  r=await req(executor.href);
  for(let step=0;step<12;step++){
    const c=r.headers?.location?{type:'redirect',to:r.headers.location}:r.data;if(c?.response_errors&&Object.keys(c.response_errors).length)throw Error('Provedor recusou os dados da etapa de autenticacao');
    if(c?.component==='ak-stage-identification')r=await req(executor.href,'POST',{component:c.component,uid_field:credentials.username});
    else if(c?.component==='ak-stage-password')r=await req(executor.href,'POST',{component:c.component,password:credentials.password});
    else if(c?.type==='redirect'||c?.component==='xak-flow-redirect'){
      let next=new URL(c.to,authOrigin);
      for(let i=0;i<10;i++){
        if(next.origin==='http://127.0.0.1:8100')return {id,start,callback:next};
        if(next.pathname.startsWith('/if/flow/')){executor=flowEndpoint(next);r=await req(executor.href);break;}
        const response=await req(next.href);if(!response.headers?.location){r=response;break;}next=new URL(response.headers.location,authOrigin);
      }
    }else throw Error('Etapa inesperada na identidade: '+String(c?.component||c?.type||r.status));
  }throw Error('Fluxo excedeu limite de etapas');
}
async function finish(flow){
  if(!httpMode)return oidc.finish(flow.callback,flow.start.cookie);
  const r=await fetch(flow.callback,{redirect:'manual',headers:{Cookie:'cw_oidc='+flow.start.cookie}});if(r.status!==303)throw Error('Callback OIDC recusado');
  const cookie=r.headers.getSetCookie().find(s=>s.startsWith('cw_portal=')).split(';')[0].slice(10);
  const me=await fetch('http://127.0.0.1:8100/api/me',{headers:{Cookie:'cw_portal='+cookie}});assert.equal((await me.json()).company,flow.id);return cookie;
}
try{
  const flows=[];for(const id of ids){flows.push(await authorize(id));checks.push({name:id+': autenticacao por usuario e senha no Authentik',ok:true});console.log(id+': autenticacao no Authentik OK');}
  if(flows.length===2){
    const [a,b]=flows,swapped=new URL(b.callback);swapped.searchParams.set('code',a.callback.searchParams.get('code'));
    await assert.rejects(()=>finish({...b,callback:swapped}));checks.push({name:'Codigo de outra empresa recusado',ok:true});
    // The failed callback consumes its state; obtain a fresh legitimate B flow.
    flows[1]=await authorize(b.id);
  }
  for(const id of ids){
    const attempt=await authorize(id),config=JSON.parse(fs.readFileSync(path.join(tenantPath(id),'portal-oidc.private.json'))),discovery=await requestApp(config.issuer+'.well-known/openid-configuration');
    const body=new URLSearchParams({grant_type:'authorization_code',client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.redirectUri,code:attempt.callback.searchParams.get('code'),code_verifier:crypto.randomBytes(32).toString('base64url')});
    const response=await requestApp(discovery.data.token_endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString()});assert.equal(response.status,400);assert.equal(response.data.error,'invalid_grant');checks.push({name:id+': verifier PKCE incorreto recusado pelo Authentik',ok:true});
  }
  for(const f of flows){const token=await finish(f);assert.equal(accounts.authenticate(token).tenant,f.id);await assert.rejects(()=>finish(f));accounts.logout(token);checks.push({name:f.id+': codigo, assinatura, identidade e replay validados',ok:true});console.log(f.id+': sessao central e rejeicao de replay OK');}
}catch(e){checks.push({name:'Login central real',ok:false,error:e.message});console.log('Validacao SSO pendente: '+e.message);process.exitCode=1;}
atomicJSON(path.join(RUNTIME,'reports','sso-live-test.json'),{at:new Date().toISOString(),checks,scope:'Fluxo HTTP real do Authentik com senha, PKCE, troca de codigo e validacao assinada. Sem desativar TLS ou registrar credenciais.'});
