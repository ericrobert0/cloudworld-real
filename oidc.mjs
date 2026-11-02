import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as client from 'openid-client';
import {tenantPath} from './infra.mjs';
import {requestApp,atomicJSON} from './integration.mjs';
const fail=(s,status=401)=>Object.assign(Error(s),{status});
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
export function oidcSettings(id){const f=path.join(tenantPath(id),'portal-oidc.private.json');return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):null;}
export function ssoStatus(id,accounts){const c=oidcSettings(id);return {enabled:!!c?.enabled,requireSso:!!c?.requireSso,linkedUsers:accounts.users(id).filter(u=>u.enabled&&u.identity).length};}
export function requireCentralLogin(id,input,accounts){
  if(typeof input.requireSso!=='boolean'||Object.keys(input).some(k=>k!=='requireSso'))throw fail('Opcao invalida',400);
  const c=oidcSettings(id),status=ssoStatus(id,accounts);if(!c?.enabled||input.requireSso&&!status.linkedUsers)throw fail('Configure e vincule uma conta central primeiro',409);
  atomicJSON(path.join(tenantPath(id),'portal-oidc.private.json'),{...c,requireSso:input.requireSso});return ssoStatus(id,accounts);
}
export class PortalOIDC{
  constructor(accounts,{origin,transport=requestApp,clock=()=>Date.now()}={}){this.accounts=accounts;this.origin=origin;this.transport=transport;this.clock=clock;this.pending=new Map();this.active=0;this.statusCache=new Map();}
  async verifySession(context){
    if(context.authSource!=='oidc')return;
    if(this.accounts.verifyCentral){await this.accounts.verifyCentral(context);return;}
    const {tenant,user}=context,c=this.accounts.oidc(tenant),identity=user.identity;
    if(!c?.enabled||c.issuer!==context.issuer||identity?.subject!==context.subject||!Number.isInteger(identity?.directoryId))throw fail('Vinculo central indisponivel',403);
    const key=tenant+':'+user.id+':'+user.version,cache=this.statusCache.get(key);if(cache&&this.clock()-cache.at<30000){if(!cache.active)throw fail('Conta central suspensa ou desvinculada',403);return;}
    let settings;try{settings=JSON.parse(fs.readFileSync(this.accounts.file(tenant,'integrations.private.json')));}catch{throw fail('Identidade central indisponivel',503);}const token=settings.connectors?.auth?.token;if(!token)throw fail('Identidade central indisponivel',503);
    let r;try{r=await this.transport(new URL('/api/v3/core/users/'+identity.directoryId+'/',c.issuer).href,{headers:{Authorization:'Bearer '+token},timeout:8000});}catch{throw fail('Identidade central indisponivel',503);}
    if(r.status!==200)throw fail('Nao foi possivel verificar a identidade central',503);
    const d=r.data,active=d.is_active===true&&Number(d.pk)===identity.directoryId&&(!d.uuid||d.uuid===identity.subject)&&d.attributes?.cloudworld_tenant===tenant&&d.attributes?.cloudworld_user_id===user.id;
    this.statusCache.set(key,{at:this.clock(),active});while(this.statusCache.size>1000)this.statusCache.delete(this.statusCache.keys().next().value);
    if(!active)throw fail('Conta central suspensa ou desvinculada',403);
  }
  async configuration(id){
    const c=this.accounts.oidc(id),t=this.accounts.manifest(id);
    if(!c?.enabled||!c.clientId||!c.clientSecret)throw fail('Login central nao configurado',409);
    const expected=new URL('/application/o/cloudworld-portal/',t.urls.auth).href;
    if(c.issuer!==expected||!expected.startsWith('https:')||c.redirectUri!==this.origin+'/auth/callback')throw fail('Configuracao do login central invalida',409);
    const fetcher=async(input,init={})=>{
      const url=new URL(input);if(url.origin!==new URL(expected).origin)throw fail('Endpoint do provedor fora do dominio permitido');
      const headers=Object.fromEntries(new Headers(init.headers));
      const r=await this.transport(url.href,{method:init.method||'GET',headers,body:init.body===undefined?undefined:String(init.body),timeout:10000});
      return new Response([204,205,304].includes(r.status)?null:typeof r.data==='string'?r.data:JSON.stringify(r.data),{status:r.status,headers:Object.fromEntries(Object.entries(r.headers||{'content-type':'application/json'}).filter(([,v])=>!Array.isArray(v)))});
    };
    const config=await client.discovery(new URL(expected),c.clientId,c.clientSecret,client.ClientSecretPost(c.clientSecret),{[client.customFetch]:fetcher});
    client.enableNonRepudiationChecks(config);return {config,c};
  }
  async start(id){
    for(const [key,v] of this.pending)if(this.clock()-v.at>300000)this.pending.delete(key);
    if(this.pending.size+this.active>=100)throw fail('Muitas solicitacoes de login. Tente novamente.',429);
    this.active++;let configuration;try{configuration=await this.configuration(id);}finally{this.active--;}
    const {config,c}=configuration,verifier=client.randomPKCECodeVerifier(),challenge=await client.calculatePKCECodeChallenge(verifier),state=client.randomState(),nonce=client.randomNonce(),cookie=crypto.randomBytes(32).toString('base64url');
    this.pending.set(state,{id,config,verifier,state,nonce,cookie:hash(cookie),at:this.clock(),issuer:c.issuer});
    const url=client.buildAuthorizationUrl(config,{redirect_uri:c.redirectUri,scope:'openid profile email cloudworld',code_challenge:challenge,code_challenge_method:'S256',state,nonce});
    return {url:url.href,cookie};
  }
  async finish(url,cookie){
    const state=url.searchParams.get('state'),p=this.pending.get(state);if(p)this.pending.delete(state);
    if(!p||this.clock()-p.at>300000||typeof cookie!=='string'||hash(cookie)!==p.cookie)throw fail('Solicitacao de login expirada ou invalida');
    if(url.origin!==this.origin||url.pathname!=='/auth/callback')throw fail('Callback invalido');
    let tokens;try{tokens=await client.authorizationCodeGrant(p.config,url,{pkceCodeVerifier:p.verifier,expectedState:p.state,expectedNonce:p.nonce,idTokenExpected:true});}catch{throw fail('Nao foi possivel validar o login central');}
    const claims=tokens.claims();if(claims.iss!==p.issuer||claims.cloudworld_tenant!==p.id||typeof claims.sub!=='string'||!claims.sub)throw fail('Identidade nao pertence a esta empresa',403);
    const user=this.accounts.users(p.id).find(u=>u.id===claims.cloudworld_user_id&&u.enabled);
    if(!user||user.identity?.issuer!==p.issuer||user.identity?.subject!==claims.sub)throw fail('Usuario nao vinculado ou suspenso no portal',403);
    return this.accounts.issueSession(p.id,user,{authSource:'oidc',subject:claims.sub,issuer:p.issuer});
  }
}
