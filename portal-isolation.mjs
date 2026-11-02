import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {PortalAccounts,createPortal} from './portal.mjs';
import {PortalOIDC} from './oidc.mjs';
import {readBody} from './read-body.mjs';
const fail=(message,status=503)=>Object.assign(Error(message),{status});
export function validTenant(id){if(typeof id!=='string'||!/^[a-z][a-z0-9-]{1,30}$/.test(id))throw fail('Empresa invalida',404);return id;}

// Contains only portal data. App integration tokens never leave the operator.
export function portalProjection(id,accounts=new PortalAccounts()){
  validTenant(id);
  const manifest=JSON.parse(fs.readFileSync(accounts.file(id,'tenant.json')));
  return {at:Date.now(),tenant:{id,urls:manifest.urls},users:accounts.users(id),oidc:accounts.oidc(id),maintenance:accounts.maintenance(id)};
}
export class IsolatedPortalAccounts extends PortalAccounts{
  constructor(root){super();this.root=path.resolve(root);}
  projection(id){
    validTenant(id);const value=JSON.parse(fs.readFileSync(path.join(this.root,'config',id+'.json')));
    if(!Number.isFinite(value.at)||Date.now()-value.at>15000||value.at>Date.now()+5000)throw fail('Administracao temporariamente indisponivel');
    return value;
  }
  file(id,name){
    validTenant(id);this.projection(id);
    if(name!=='portal-sessions.private.json')throw fail('Arquivo fora do escopo do portal',403);
    return path.join(this.root,'sessions',id,name);
  }
  users(id){return this.projection(id).users;}
  oidc(id){return this.projection(id).oidc;}
  maintenance(id){return this.projection(id).maintenance;}
  manifest(id){return this.projection(id).tenant;}
  async save(){throw fail('Administracao indisponivel no portal publico',403);}
  async verifyCentral(context){
    const body=JSON.stringify({tenant:context.tenant,userId:context.user.id,version:context.user.version,issuer:context.issuer,subject:context.subject});
    await new Promise((resolve,reject)=>{
      const q=http.request({socketPath:path.join(this.root,'identity.sock'),path:'/verify',method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(body)},timeout:10000},r=>{r.resume();r.on('end',()=>r.statusCode===204?resolve():reject(fail('Identidade central indisponivel',r.statusCode===403?403:503)));});
      q.on('error',()=>reject(fail('Identidade central indisponivel')));q.on('timeout',()=>q.destroy());q.end(body);
    });
  }
}
// A narrow local broker: no arbitrary URLs, credentials or application actions.
export function createIdentityBroker(accounts=new PortalAccounts()){
  const oidc=new PortalOIDC(accounts);let active=0;
  const server=http.createServer(async(req,res)=>{
    if(req.method!=='POST'||req.url!=='/verify'){res.writeHead(404);res.end();return;}
    if(active>=4){res.writeHead(503);res.end();return;}
    active++;
    try{
      const b=await readBody(req,2048);validTenant(b.tenant);
      const user=accounts.users(b.tenant).find(u=>u.id===b.userId&&u.enabled&&u.version===b.version);
      if(!user)throw fail('Conta indisponivel',403);
      await oidc.verifySession({tenant:b.tenant,user,authSource:'oidc',issuer:b.issuer,subject:b.subject});
      res.writeHead(204);res.end();
    }catch(e){res.writeHead(e.status===403?403:503);res.end();}finally{active--;}
  });
  server.maxConnections=16;server.requestTimeout=5000;server.headersTimeout=5000;server.timeout=10000;server.keepAliveTimeout=1000;
  return server;
}
export function startIsolatedPortal(root,origin,proxyHost){
  const accounts=new IsolatedPortalAccounts(root);
  const {server}=createPortal({accounts,origin,proxyHost});
  server.listen(8100,'127.0.0.1',()=>console.log('Portal CloudWorld isolado: '+origin));
  return server;
}
