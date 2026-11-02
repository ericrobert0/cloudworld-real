import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {promisify} from 'node:util';
import {ROOT,RUNTIME,tenantPath} from './infra.mjs';
import {atomicJSON} from './integration.mjs';
import {readBody} from './api.mjs';
import {PortalOIDC,oidcSettings} from './oidc.mjs';
import {requestOriginAllowed} from './request-origin.mjs';
const scrypt=promisify(crypto.scrypt),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const fail=(s,status=400)=>Object.assign(Error(s),{status});
export const customerApps={chat:'Atendimento',erp:'Gestão empresarial',cloud:'Arquivos',postiz:'Redes sociais'};
const read=(file,otherwise)=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):otherwise;
export class PortalAccounts{
  constructor(){this.attempts=new Map();this.activeLogins=0;}
  file(id,name){const d=tenantPath(id);if(!fs.existsSync(path.join(d,'tenant.json')))throw fail('Empresa inexistente',404);return path.join(d,name);}
  users(id){return read(this.file(id,'portal-users.private.json'),[]);}
  list(id){return this.users(id).map(({salt,hash,...u})=>u);}
  async save(id,input){
    const all=this.users(id),previous=input.id?all.find(u=>u.id===input.id):null;
    if(input.id&&!previous)throw fail('Usuario inexistente',404);
    const username=(input.username||previous?.username||'').toLowerCase(),name=(input.name||previous?.name||'').trim();
    if(!/^[a-z][a-z0-9._-]{2,63}$/.test(username)||!name||name.length>120)throw fail('Nome e usuario invalidos');
    if(all.some(u=>u.username===username&&u.id!==previous?.id))throw fail('Usuario ja cadastrado',409);
    if(!previous&&all.length>=100)throw fail('Limite de 100 usuarios por empresa');
    const apps=input.apps??previous?.apps??Object.keys(customerApps);
    if(!Array.isArray(apps)||apps.some(a=>!Object.hasOwn(customerApps,a)))throw fail('Ferramentas invalidas');
    if(input.enabled!==undefined&&typeof input.enabled!=='boolean')throw fail('enabled deve ser booleano');
    const password=!previous||input.resetPassword?crypto.randomBytes(24).toString('base64url'):null;
    const salt=password?crypto.randomBytes(16).toString('hex'):previous.salt;
    const hash=password?(await scrypt(password,salt,64)).toString('hex'):previous.hash;
    // Reload after scrypt so concurrent operator requests cannot overwrite users.
    const current=this.users(id);if(!previous&&current.some(u=>u.username===username))throw fail('Usuario ja cadastrado',409);
    if(!previous&&current.length>=100)throw fail('Limite de usuarios atingido');
    if(previous&&current.find(u=>u.id===previous.id)?.version!==previous.version)throw fail('Conta alterada por outra solicitacao; atualize a pagina',409);
    const u={id:previous?.id||crypto.randomUUID(),username,name,apps:[...new Set(apps)],enabled:input.enabled??previous?.enabled??true,salt,hash,version:(previous?.version||0)+1,createdAt:previous?.createdAt||new Date().toISOString(),...(previous?.identity?{identity:previous.identity}:{})};
    atomicJSON(this.file(id,'portal-users.private.json'),[...current.filter(v=>v.id!==u.id),u]);return {...this.list(id).find(v=>v.id===u.id),...(password?{initialPassword:password}:{})};
  }
  limit(key,{max=10,windowMs=600000}={}){const now=Date.now(),prev=this.attempts.get(key),a=prev&&prev.until>now?prev:{count:0,until:now+windowMs};if(++a.count>max)throw fail('Muitas tentativas. Aguarde antes de tentar novamente.',429);this.attempts.set(key,a);if(this.attempts.size>2000){for(const [k,v] of this.attempts)if(v.until<now)this.attempts.delete(k);while(this.attempts.size>2000)this.attempts.delete(this.attempts.keys().next().value);}}
  async login(id,username,password,address='local'){
    if(typeof id!=='string'||!/^[a-z][a-z0-9-]{1,30}$/.test(id)||typeof username!=='string'||typeof password!=='string'||username.length>64||password.length>128)throw fail('Acesso invalido',401);
    if(oidcSettings(id)?.requireSso)throw fail('Use o botao de login central para esta empresa',403);
    if(this.activeLogins>=4)throw fail('Muitos acessos simultaneos. Tente novamente em instantes.',429);
    this.limit(address+':'+id+':'+username.toLowerCase());
    let u;try{u=this.users(id).find(u=>u.username===username.toLowerCase());}catch{}
    let hash;this.activeLogins++;try{hash=await scrypt(password,u?.salt||'cloudworld-dummy-salt',64);}finally{this.activeLogins--;}
    if(!u?.enabled||!crypto.timingSafeEqual(hash,Buffer.from(u.hash,'hex')))throw fail('Empresa, usuario ou senha invalidos',401);
    this.attempts.delete(address+':'+id+':'+username.toLowerCase());return this.issueSession(id,u);
  }
  issueSession(id,u,metadata={authSource:'password'}){
    const token=crypto.randomBytes(32).toString('base64url'),now=Date.now(),sessions=this.sessions(id).filter(s=>s.expires>now);
    if(sessions.length>=500)sessions.splice(0,sessions.length-499);
    sessions.push({hash:sha(token),userId:u.id,version:u.version,expires:now+8*3600000,lastAt:now,...metadata});atomicJSON(this.file(id,'portal-sessions.private.json'),sessions);return id+'.'+token;
  }
  sessions(id){return read(this.file(id,'portal-sessions.private.json'),[]);}
  authenticate(cookie){
    const m=(cookie||'').match(/^([a-z][a-z0-9-]{1,30})\.([a-zA-Z0-9_-]{43})$/);if(!m)throw fail('Entre na sua conta',401);
    const [,id,token]=m;let all;try{all=this.sessions(id);}catch{throw fail('Entre na sua conta',401);}
    const s=all.find(s=>s.hash===sha(token)),now=Date.now(),u=s&&this.users(id).find(u=>u.id===s.userId);
    if(!s||s.expires<=now||s.lastAt<now-1800000||!u?.enabled||s.version!==u.version)throw fail('Sessao encerrada. Entre novamente.',401);
    if(s.authSource!=='oidc'&&oidcSettings(id)?.requireSso)throw fail('Use o login central para continuar.',401);
    if(now-s.lastAt>60000){s.lastAt=now;atomicJSON(this.file(id,'portal-sessions.private.json'),all);}
    return {tenant:id,user:u,authSource:s.authSource,subject:s.subject,issuer:s.issuer};
  }
  logout(cookie){try{const {tenant}=this.authenticate(cookie);atomicJSON(this.file(tenant,'portal-sessions.private.json'),this.sessions(tenant).filter(s=>s.hash!==sha(cookie.split('.')[1])));}catch{}}
}
export function createPortal({accounts=new PortalAccounts(),origin='http://127.0.0.1:8100',proxyHost=null}={}){
  const expected=new URL(origin),secure=expected.protocol==='https:';
  if(!['http:','https:'].includes(expected.protocol)||expected.username||expected.password||expected.pathname!=='/'||expected.search||expected.hash)throw Error('Informe apenas a origem HTTP/HTTPS do portal');
  origin=expected.origin;
  if(!secure&&!['127.0.0.1','localhost'].includes(expected.hostname))throw Error('Portal externo exige HTTPS.');
  if(proxyHost!==null&&(!secure||!/^localhost:[1-9][0-9]{0,4}$/.test(proxyHost)||Number(proxyHost.split(':')[1])>65535))throw Error('Alias do proxy deve ser localhost com porta e origem HTTPS.');
  const page=fs.readFileSync(path.join(ROOT,'public','portal.html'));
  const oidc=new PortalOIDC(accounts,{origin});
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if(secure)res.setHeader('Strict-Transport-Security','max-age=63072000; includeSubDomains; preload');
    const fromLoopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if(req.headers.host!==expected.host&&!(proxyHost&&fromLoopback&&req.headers.host===proxyHost)){res.writeHead(403);res.end();return;}
    const cookie=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('cw_portal='))?.slice(10);
    try{
      if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(page);return;}
      if(req.method==='POST'&&req.url==='/api/sso/start'){
        if(!requestOriginAllowed(req,{origin,proxyHost}))throw fail('Origem invalida',403);
        const {tenant}=await readBody(req,4096);accounts.limit('oidc:'+req.socket.remoteAddress+':'+String(tenant),{max:60,windowMs:60000});
        const flow=await oidc.start(tenant);res.setHeader('Set-Cookie','cw_oidc='+flow.cookie+'; Path=/auth/callback; HttpOnly; SameSite=Lax; Max-Age=300'+(secure?'; Secure':''));json(res,200,{url:flow.url});return;
      }
      if(req.method==='GET'&&req.url.startsWith('/auth/callback?')){
        const transaction=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('cw_oidc='))?.slice(8);
        const token=await oidc.finish(new URL(req.url,origin),transaction);
        res.setHeader('Set-Cookie',['cw_oidc=; Path=/auth/callback; HttpOnly; SameSite=Lax; Max-Age=0'+(secure?'; Secure':''),'cw_portal='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800'+(secure?'; Secure':'')]);res.writeHead(303,{Location:'/'});res.end();return;
      }
      const assets={'/portal.js':['portal.js','application/javascript'],'/portal.css':['portal.css','text/css'],'/bootstrap.css':['vendor/bootstrap.min.css','text/css']};
      if(req.method==='GET'&&assets[req.url]){const [file,type]=assets[req.url];res.setHeader('Content-Type',type+'; charset=utf-8');res.end(fs.readFileSync(path.join(ROOT,'public',file)));return;}
      if(req.method==='POST'&&['/api/login','/api/logout'].includes(req.url)){
        if(!requestOriginAllowed(req,{origin,proxyHost}))throw fail('Origem invalida',403);
        if(req.url==='/api/logout'){accounts.logout(cookie);res.setHeader('Set-Cookie','cw_portal=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+(secure?'; Secure':''));json(res,200,{ok:true});return;}
        const body=await readBody(req,4096),token=await accounts.login(body.tenant,body.username,body.password,req.socket.remoteAddress);
        res.setHeader('Set-Cookie','cw_portal='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800'+(secure?'; Secure':''));json(res,200,{ok:true});return;
      }
      if(req.method==='GET'&&req.url==='/api/me'){
        const context=accounts.authenticate(cookie);try{await oidc.verifySession(context);}catch(e){if(e.status===403)accounts.logout(cookie);throw e;}
        const {tenant,user}=context,t=read(accounts.file(tenant,'tenant.json'));
        json(res,200,{company:tenant,authSource:context.authSource==='oidc'?'oidc':'password',maintenance:fs.existsSync(path.join(tenantPath(tenant),'.operation.lock')),user:{name:user.name,username:user.username},apps:user.apps.filter(a=>customerApps[a]&&t.urls[a]).map(a=>({id:a,name:customerApps[a],url:t.urls[a]}))});return;
      }
      res.writeHead(404);res.end();
    }catch(e){json(res,e.status||400,{error:e.status?e.message:'Nao foi possivel concluir a solicitacao'});}
  });server.maxConnections=128;server.headersTimeout=10000;server.requestTimeout=15000;server.keepAliveTimeout=5000;return {server,accounts,origin};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.join(ROOT,'portal.mjs')){
  const origin=process.env.CW_PORTAL_ORIGIN||'http://127.0.0.1:8100',port=Number(process.env.CW_PORTAL_PORT||8100);
  const {server}=createPortal({origin,proxyHost:process.env.CW_PORTAL_PROXY_HOST||null});server.listen(port,'127.0.0.1',()=>console.log('Portal CloudWorld: '+origin));
}
