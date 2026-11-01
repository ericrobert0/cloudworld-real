import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
process.env.VW_RUNTIME_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'cw-oidc-'));
const {createTenant,tenantPath}=await import('../infra.mjs');
const {atomicJSON}=await import('../integration.mjs');
const {PortalAccounts}=await import('../portal.mjs');
const {PortalOIDC,requireCentralLogin}=await import('../oidc.mjs');
createTenant('alpha');createTenant('bravo','bravo.localhost',8453);
const accounts=new PortalAccounts(),u=await accounts.save('alpha',{name:'Alpha',username:'sso-user'}),issuer='https://auth.alpha.localhost:8443/application/o/cloudworld-portal/',origin='http://127.0.0.1:8100';
const users=accounts.users('alpha');users[0].identity={issuer,subject:'subject-alpha',directoryId:42};atomicJSON(accounts.file('alpha','portal-users.private.json'),users);
atomicJSON(path.join(tenantPath('alpha'),'portal-oidc.private.json'),{enabled:true,issuer,clientId:'client-alpha',clientSecret:'private-secret',redirectUri:origin+'/auth/callback'});
const keys=await generateKeyPair('RS256'),foreign=await generateKeyPair('RS256'),jwk={...await exportJWK(keys.publicKey),kid:'key-1',alg:'RS256',use:'sig'};
let currentNonce,wrongClaim={},tokenCalls=0,variant='';
async function transport(url,options){
  const uurl=new URL(url);const headers={'content-type':'application/json'};
  if(url.includes('.well-known'))return {status:200,headers,data:{issuer,authorization_endpoint:new URL('/authorize',issuer).href,token_endpoint:new URL('/token',issuer).href,jwks_uri:new URL('/jwks',issuer).href,response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],token_endpoint_auth_methods_supported:['client_secret_post'],code_challenge_methods_supported:['S256']}};
  if(uurl.pathname==='/jwks')return {status:200,headers,data:{keys:[jwk]}};
  if(uurl.pathname==='/token'){
    tokenCalls++;const params=new URLSearchParams(options.body);assert.equal(params.get('client_secret'),'private-secret');assert.ok(params.get('code_verifier'));assert.equal(params.get('redirect_uri'),origin+'/auth/callback');
    const token=await new SignJWT({nonce:currentNonce,cloudworld_tenant:'alpha',cloudworld_user_id:u.id,...wrongClaim}).setProtectedHeader({alg:'RS256',kid:'key-1'}).setSubject(variant==='subject'?'foreign-subject':'subject-alpha').setIssuer(variant==='issuer'?'https://foreign.invalid/':issuer).setAudience(variant==='audience'?'client-bravo':'client-alpha').setIssuedAt().setExpirationTime(variant==='expired'?Math.floor(Date.now()/1000)-600:'2m').sign(variant==='signature'?foreign.privateKey:keys.privateKey);
    return {status:200,headers,data:{access_token:'at',token_type:'Bearer',expires_in:120,id_token:token}};
  }throw Error('Unexpected endpoint');
}
async function flow(oidc){const f=await oidc.start('alpha'),url=new URL(f.url);currentNonce=url.searchParams.get('nonce');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('response_type'),'code');return {f,callback:new URL(origin+'/auth/callback?'+new URLSearchParams({code:'single-use-code',state:url.searchParams.get('state'),iss:issuer}))};}
test('OIDC verifica assinatura, vinculo de empresa/usuario, PKCE e cria sessao do portal',async()=>{wrongClaim={};const oidc=new PortalOIDC(accounts,{origin,transport}),{f,callback}=await flow(oidc);const cookie=await oidc.finish(callback,f.cookie);assert.equal(accounts.authenticate(cookie).tenant,'alpha');await assert.rejects(()=>oidc.finish(callback,f.cookie),{status:401});});
test('estado de outro navegador e fluxo expirado sao recusados antes da troca do codigo',async()=>{
  let now=0;const oidc=new PortalOIDC(accounts,{origin,transport,clock:()=>now});const {f,callback}=await flow(oidc),before=tokenCalls;await assert.rejects(()=>oidc.finish(callback,'another-browser'),{status:401});assert.equal(tokenCalls,before);
  const next=await flow(oidc);now=301000;await assert.rejects(()=>oidc.finish(next.callback,next.f.cookie),{status:401});
});
test('nonce incorreto e identidade de outra empresa nao abrem sessao',async()=>{
  for(const claims of [{cloudworld_tenant:'bravo'},{cloudworld_user_id:crypto.randomUUID()},{nonce:'invalid-nonce'}]){
    wrongClaim=claims;const oidc=new PortalOIDC(accounts,{origin,transport}),{f,callback}=await flow(oidc);await assert.rejects(()=>oidc.finish(callback,f.cookie));
  }wrongClaim={};
});
test('token com assinatura, emissor, audiencia, validade ou sujeito incorretos e recusado',async()=>{
  for(const v of ['signature','issuer','audience','expired','subject']){variant=v;const oidc=new PortalOIDC(accounts,{origin,transport}),{f,callback}=await flow(oidc);await assert.rejects(()=>oidc.finish(callback,f.cookie));}variant='';
});
test('sessao SSO revalida suspensao central e falha fechada quando a identidade esta indisponivel',async()=>{
  let now=0,active=true;atomicJSON(accounts.file('alpha','integrations.private.json'),{connectors:{auth:{token:'readonly-directory-token'}}});
  const oidc=new PortalOIDC(accounts,{origin,clock:()=>now,transport:async()=>({status:200,data:{pk:42,uuid:'subject-alpha',is_active:active,attributes:{cloudworld_tenant:'alpha',cloudworld_user_id:u.id}}})}),user=accounts.users('alpha')[0],context={tenant:'alpha',user,authSource:'oidc',issuer,subject:user.identity.subject};
  await oidc.verifySession(context);active=false;now=31000;await assert.rejects(()=>oidc.verifySession(context),{status:403});
  now=62000;oidc.transport=async()=>({status:503});await assert.rejects(()=>oidc.verifySession(context),{status:503});
});
test('modo central obrigatorio recusa senha local e exige conta vinculada',async()=>{
  assert.throws(()=>requireCentralLogin('bravo',{requireSso:true},accounts),{status:409});
  const local=await accounts.login('alpha',u.username,u.initialPassword);requireCentralLogin('alpha',{requireSso:true},accounts);assert.throws(()=>accounts.authenticate(local),{status:401});await assert.rejects(()=>accounts.login('alpha',u.username,u.initialPassword),{status:403});requireCentralLogin('alpha',{requireSso:false},accounts);
});
