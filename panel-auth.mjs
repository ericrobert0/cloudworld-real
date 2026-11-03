import crypto from 'node:crypto';
import fs from 'node:fs';
import {requestOriginAllowed} from './request-origin.mjs';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);};
export function createPanelAuth({password,origin,proxyHost=null,pagePath,clock=Date.now}){
  const sessions=new Map(),attempts=new Map(),secure=new URL(origin).protocol==='https:';
  const expected='Basic '+Buffer.from('admin:'+password).toString('base64');
  const token=req=>(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('cw_panel_session='))?.slice(17);
  const cookie=(value,maxAge)=>'cw_panel_session='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+maxAge+(secure?'; Secure':'');
  const redirect=(res,location)=>{res.writeHead(303,{Location:location});res.end();};
  function authorized(req){
    if(equal(req.headers.authorization||'',expected))return true;
    const value=token(req);if(!value||!/^[A-Za-z0-9_-]{43}$/.test(value))return false;
    const key=hash(value),expires=sessions.get(key);if(!expires)return false;
    if(expires<=clock()){sessions.delete(key);return false;}return true;
  }
  return {authorized,async handle(req,res){
    if(req.method==='GET'&&(req.url==='/login'||req.url==='/login?error=1')){
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
      const page=fs.readFileSync(pagePath,'utf8').replace('<!-- LOGIN_ERROR -->',req.url.includes('?')?'<p role="alert" class="error">Usuário ou senha incorretos. Tente novamente.</p>':'');
      res.writeHead(200);res.end(page);return true;
    }
    if(req.method==='POST'&&['/auth/login','/auth/logout'].includes(req.url)){
      if(!requestOriginAllowed(req,{origin,proxyHost})){res.writeHead(403);res.end('Origem invalida');return true;}
      if(req.url==='/auth/logout'){const value=token(req);if(value)sessions.delete(hash(value));res.setHeader('Set-Cookie',cookie('',0));redirect(res,'/login');return true;}
      if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')){res.writeHead(415);res.end();return true;}
      const now=clock(),address=req.socket.remoteAddress;
      for(const [key,value] of attempts)if(value.until<=now)attempts.delete(key);
      const count=attempts.get(address)||{count:0,until:now+600000};
      if(attempts.size>=1024&&!attempts.has(address)||++count.count>10){res.writeHead(429,{'Retry-After':'600'});res.end('Muitas tentativas. Aguarde alguns minutos.');return true;}
      attempts.set(address,count);
      try{
        let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096){res.writeHead(413);res.end();return true;}}
        const input=new URLSearchParams(body);
        if(!equal(input.get('username')||'','admin')||!equal(input.get('password')||'',password)){redirect(res,'/login?error=1');return true;}
        attempts.delete(address);for(const [key,expires] of sessions)if(expires<=now)sessions.delete(key);
        if(sessions.size>=128)sessions.delete(sessions.keys().next().value);
        const value=crypto.randomBytes(32).toString('base64url');sessions.set(hash(value),now+8*3600000);
        res.setHeader('Set-Cookie',cookie(value,28800));redirect(res,'/');
      }catch{if(!res.headersSent){res.writeHead(400);res.end('Nao foi possivel entrar');}}
      return true;
    }
    if(req.method==='GET'&&req.url==='/'&&!authorized(req)){redirect(res,'/login');return true;}
    return false;
  }};
}
