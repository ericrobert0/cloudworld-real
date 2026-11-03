import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import {tenantPath,RUNTIME} from './infra.mjs';
import {EventArchive,archiveDirectory} from './integration-archive.mjs';

export const operations={
  auth:['check','users.list'],chat:['check','contacts.create','contacts.list'],erp:['check','customers.upsert'],
  cloud:['check','folders.create'],postiz:['check','integrations.list'],n8n:['check','events.send'],waha:['check','messages.send']
};
const required={auth:['token'],chat:['token','accountId'],erp:['apiKey','apiSecret'],cloud:['username','password'],postiz:['token'],n8n:['webhookPath','token'],waha:['token']};
const read=(file,fallback)=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):fallback;
export function atomicJSON(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.'+crypto.randomUUID()+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,file);
}
const error=(message,status=400)=>Object.assign(Error(message),{status});
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
export function requestApp(url,{method='GET',headers={},body,timeout=8000}={}){
  return new Promise((resolve,reject)=>{
    const encoded=body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body);
    const u=new URL(url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return reject(error('URL invalida'));
    const isLocal=u.hostname.endsWith('.localhost');let ca=path.join(RUNTIME,'local-ca.crt');
    const base=path.join(RUNTIME,'tenants');
    if(isLocal&&fs.existsSync(base))for(const id of fs.readdirSync(base)){
      const manifest=path.join(base,id,'tenant.json');if(!fs.existsSync(manifest))continue;
      const t=JSON.parse(fs.readFileSync(manifest));
      if(u.hostname.endsWith('.'+t.domain)){
        const own=path.join(base,id,'local-ca.crt');
        ca=fs.existsSync(own)?own:id==='piloto'?ca:path.join(base,id,'local-ca.crt');break;
      }
    }
    const opts={method,headers:{...headers,...(encoded!==undefined?{'Content-Length':Buffer.byteLength(encoded)}:{})},timeout,
      ...(isLocal?{lookup:(_h,o,cb)=>o?.all?cb(null,[{address:'127.0.0.1',family:4}]):cb(null,'127.0.0.1',4)}:{}),
      ...(u.protocol==='https:'&&isLocal&&fs.existsSync(ca)?{ca:fs.readFileSync(ca)}:{})};
    const req=(u.protocol==='https:'?https:http).request(u,opts,res=>{
      const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>1048576){res.destroy();reject(error('Resposta excedeu 1 MB',502));}else chunks.push(b);});
      res.on('error',reject);res.on('end',()=>{const text=Buffer.concat(chunks).toString();let data;try{data=JSON.parse(text);}catch{data=text;}resolve({status:res.statusCode,data,headers:res.headers});});
    });req.on('timeout',()=>req.destroy(error('Tempo de resposta excedido',504)));req.on('error',reject);req.end(encoded);
  });
}

export class IntegrationHub{
  constructor({transport=requestApp,clock=()=>Date.now()}={}){this.transport=transport;this.clock=clock;this.working=false;this.polling=false;this.limits=new Map();}
  dir(id){const dir=tenantPath(id);if(!fs.existsSync(path.join(dir,'tenant.json')))throw error('Empresa inexistente',404);return dir;}
  file(id,name){return path.join(this.dir(id),name);}
  settings(id){return read(this.file(id,'integrations.private.json'),{connectors:{},routes:[],keys:[]});}
  publicSettings(id){const s=this.settings(id),sync=read(this.file(id,'integration-sources.private.json'),{});return {connectors:Object.fromEntries(Object.keys(operations).map(app=>{const c=s.connectors[app]||{};return [app,{configured:required[app].every(k=>!!c[k]),enabled:c.enabled===true,operations:operations[app],fields:required[app],requireAck:app==='n8n'&&c.requireAck===true,accountId:c.accountId||'',username:c.username||'',webhookPath:c.webhookPath||''}];})),sources:{chatContacts:{enabled:s.sources?.chatContacts===true,lastAt:sync.chat?.lastAt,error:sync.chat?.error,initialized:!!sync.chat?.seen}},routes:s.routes,keys:s.keys.map(({hash,...k})=>k),delivery:'at-least-once',maxAttempts:5};}
  configure(id,patch){
    const s=this.settings(id);
    if(patch.sources!==undefined){if(typeof patch.sources?.chatContacts!=='boolean'||Object.keys(patch.sources).some(k=>k!=='chatContacts'))throw error('Origem invalida');s.sources={chatContacts:patch.sources.chatContacts};}
    for(const [app,input] of Object.entries(patch.connectors||{})){
      if(!Object.hasOwn(operations,app)||!input||typeof input!=='object')throw error('Conector invalido');
      const c={...s.connectors[app]};for(const [k,v] of Object.entries(input)){
        if(![...required[app],'enabled',...(app==='n8n'?['requireAck']:[])].includes(k))throw error('Campo desconhecido: '+k);
        if(k==='enabled'||k==='requireAck'){if(typeof v!=='boolean')throw error(k+' deve ser booleano');}
        else if(typeof v!=='string'||v.length>4096||/[\r\n]/.test(v))throw error('Credencial invalida');
        if(v!==''||k==='enabled'||k==='requireAck')c[k]=v;
      }
      if(c.accountId&&!/^\d+$/.test(c.accountId))throw error('accountId invalido');
      if(c.webhookPath&&!/^[a-zA-Z0-9/_-]{1,120}$/.test(c.webhookPath))throw error('Caminho do webhook invalido');
      if(c.username&&!/^[a-zA-Z0-9@._-]{1,120}$/.test(c.username))throw error('Usuario Nextcloud invalido');
      s.connectors[app]=c;
    }
    if(patch.routes!==undefined){
      if(!Array.isArray(patch.routes)||patch.routes.length>20)throw error('Maximo de 20 rotas');
      s.routes=patch.routes.map(r=>{
        if(!/^[a-z][a-z0-9.-]{1,70}$/.test(r.id||'')||!['contact.created','message.received','sale.created','file.created','social.published'].includes(r.event)||!operations[r.app]?.includes(r.operation)||r.operation==='check'||typeof r.enabled!=='boolean')throw error('Rota invalida');
        // Routes only carry the event payload; no executable expressions or arbitrary URLs.
        return {id:r.id,event:r.event,app:r.app,operation:r.operation,enabled:r.enabled};
      });if(new Set(s.routes.map(r=>r.id)).size!==s.routes.length)throw error('IDs de rotas duplicados');
    }
    atomicJSON(this.file(id,'integrations.private.json'),s);return this.publicSettings(id);
  }
  issueKey(id,{name='Integracao',scopes=['events:write','events:read']}={}){
    const valid=['events:write','events:read','connectors:read',...Object.entries(operations).flatMap(([app,ops])=>ops.map(op=>`${app}:${op}`))];
    if(typeof name!=='string'||name.length>80||!Array.isArray(scopes)||!scopes.length||scopes.some(s=>!valid.includes(s)))throw error('Permissoes invalidas');
    const s=this.settings(id);if(s.keys.length>=30)throw error('Revogue uma chave antes de criar outra');
    const token='cw_'+crypto.randomBytes(32).toString('base64url');const key={id:crypto.randomUUID(),name,scopes,hash:digest(token),createdAt:new Date(this.clock()).toISOString()};
    s.keys.push(key);atomicJSON(this.file(id,'integrations.private.json'),s);return {id:key.id,token,scopes};
  }
  revokeKey(id,keyId){const s=this.settings(id);s.keys=s.keys.filter(k=>k.id!==keyId);atomicJSON(this.file(id,'integrations.private.json'),s);}
  authorize(id,authorization,scope){
    const hash=digest((authorization||'').replace(/^Bearer /,''));const k=this.settings(id).keys.find(k=>k.hash===hash);
    if(!k)throw error('Chave invalida para esta empresa',401);if(!k.scopes.includes(scope))throw error('Permissao insuficiente',403);
    const now=this.clock(),old=this.limits.get(k.id),v=old&&old.until>now?old:{count:0,until:now+60000};if(++v.count>120)throw error('Limite de requisicoes',429);this.limits.set(k.id,v);
    if(this.limits.size>1000)for(const [id,v] of this.limits)if(v.until<=now)this.limits.delete(id);
    return k;
  }
  async invoke(id,app,operation,payload={},eventId=''){
    if(!Object.hasOwn(operations,app)||!operations[app].includes(operation))throw error('Operacao nao suportada');
    const c=this.settings(id).connectors[app];if(!c?.enabled||!required[app].every(k=>!!c[k]))throw error('Conector nao configurado ou desativado',409);
    const tenant=read(this.file(id,'tenant.json'));const base=app==='waha'?`http://127.0.0.1:${tenant.port+2}`:tenant.apiUrls?.[app]||tenant.urls[app];
    const headers={'Content-Type':'application/json','X-CloudWorld-Event-Id':eventId};
    if(app==='auth')headers.Authorization='Bearer '+c.token;
    if(app==='chat')headers.api_access_token=c.token;
    if(app==='erp')headers.Authorization=`token ${c.apiKey}:${c.apiSecret}`;
    if(app==='cloud')headers.Authorization='Basic '+Buffer.from(c.username+':'+c.password).toString('base64');
    if(app==='postiz')headers.Authorization=c.token;
    if(app==='n8n')headers['X-CloudWorld-Key']=c.token;
    if(app==='waha')headers['X-Api-Key']=c.token;
    const call=async(route,method='GET',body)=>{
      let r;try{r=await this.transport(new URL(route,base).href,{method,headers,body,timeout:app==='cloud'?45000:10000});}catch(e){throw error('Conexao com '+app+' falhou'+(e.code&&/^[A-Z_]+$/.test(e.code)?' ('+e.code+')':''),502);}
      if(r.status<200||r.status>=300)throw error(`${app}: HTTP ${r.status}`,r.status===429||r.status>=500?503:422);
      return r.data;
    };
    const checks={auth:'/api/v3/core/users/me/',chat:`/api/v1/accounts/${c.accountId}/contacts?page=1`,erp:'/api/method/frappe.auth.get_logged_user',cloud:'/ocs/v2.php/cloud/user?format=json',postiz:'/api/public/v1/integrations',waha:'/api/sessions',n8n:'/healthz/readiness'};
    if(app==='cloud')headers['OCS-APIRequest']='true';
    if(operation==='check'){
      const result=await call(checks[app]);
      if(app==='erp'&&(!result?.message||result.message==='Guest'))throw error('ERP nao autenticado',422);
      if(app==='cloud'&&(![100,200].includes(Number(result?.ocs?.meta?.statuscode))||result?.ocs?.data?.id!==c.username))throw error('Nextcloud nao autenticado',422);
      const tested=app==='n8n'?read(this.file(id,'integration-webhook-health.json'),{}):{};
      return {ok:true,app,authentication:app==='n8n'&&!(tested.fingerprint===digest(JSON.stringify(c))&&this.clock()-tested.at<3600000)?'webhook-nao-verificado':'verified'};
    }
    if(operation==='users.list')return call('/api/v3/core/users/?page_size=50');
    if(operation==='contacts.list'){
      const page=Number(payload.page||1);if(!Number.isInteger(page)||page<1||page>100)throw error('Pagina invalida');
      return call(`/api/v1/accounts/${c.accountId}/contacts?page=${page}`);
    }
    if(operation==='integrations.list')return call(checks.postiz);
    if(operation==='contacts.create'){
      const name=String(payload.name||'').trim();if(!name||name.length>140)throw error('Nome do contato obrigatorio');
      return call(`/api/v1/accounts/${c.accountId}/contacts`,'POST',{name,...(payload.email?{email:String(payload.email)}:{}),...(payload.phone?{phone_number:String(payload.phone)}:{}),identifier:'cw-'+(eventId||crypto.randomUUID())});
    }
    if(operation==='customers.upsert'){
      const name=String(payload.name||'').trim();if(!name||name.length>140)throw error('Nome do cliente obrigatorio');
      const marker='CloudWorld:'+digest(String(payload.source||'api')+':'+String(payload.sourceId||eventId||crypto.randomUUID())).slice(0,32);
      const existing=await call('/api/resource/Customer?'+new URLSearchParams({filters:JSON.stringify([['customer_details','like','%'+marker+'%']]),limit_page_length:'1'}));
      if(existing?.data?.length)return {existing:true,...existing.data[0]};
      const leaf=async(type)=>{const r=await call('/api/resource/'+encodeURIComponent(type)+'?'+new URLSearchParams({filters:JSON.stringify([['is_group','=',0]]),limit_page_length:'1'}));return r.data?.[0]?.name;};
      const customer_group=payload.customerGroup||await leaf('Customer Group'),territory=payload.territory||await leaf('Territory');
      if(!customer_group||!territory)throw error('Configure um grupo de clientes e um territorio no ERP',422);
      return call('/api/resource/Customer','POST',{customer_name:name,customer_type:'Company',customer_group,territory,...(payload.email?{email_id:String(payload.email)}:{}),customer_details:marker});
    }
    if(operation==='folders.create'){
      const folder=String(payload.folder||'');if(!/^[\p{L}\p{N} _.-]{1,100}$/u.test(folder)||['.','..'].includes(folder))throw error('Nome de pasta invalido');
      const route=`/remote.php/dav/files/${encodeURIComponent(c.username)}/${encodeURIComponent(folder)}`;
      let r;try{r=await this.transport(new URL(route,base).href,{method:'MKCOL',headers});}catch{throw error('Conexao com cloud falhou',502);}
      if(r.status===405)return {folder,existing:true};if(r.status!==201)throw error('cloud: HTTP '+r.status,r.status>=500?503:422);return {folder,created:true};
    }
    if(operation==='events.send'){
      const deliveryId=eventId||crypto.randomUUID();
      const result=await call('/webhook/'+c.webhookPath,'POST',{...payload,id:deliveryId,tenant:id});
      if(c.requireAck&&(result?.accepted!==true||result.eventId!==deliveryId||result.tenant!==id)){
        atomicJSON(this.file(id,'integration-webhook-health.json'),{at:this.clock(),error:'acknowledgement-mismatch'});
        throw error('n8n nao confirmou o evento e a empresa esperados',422);
      }
      atomicJSON(this.file(id,'integration-webhook-health.json'),{fingerprint:digest(JSON.stringify(c)),at:this.clock()});return result;
    }
    if(operation==='messages.send'){
      if(!/^\d{8,16}@c\.us$/.test(payload.chatId||'')||typeof payload.text!=='string'||!payload.text||payload.text.length>4000)throw error('Destino ou texto invalido');
      return call('/api/sendText','POST',{session:'default',chatId:payload.chatId,text:payload.text});
    }
  }
  queue(id){return read(this.file(id,'integration-events.private.json'),[]);}
  archive(id){return new EventArchive(archiveDirectory(this.dir(id)));}
  queueStats(id){
    const all=this.queue(id),states={pending:0,failed:0,delivered:0,unrouted:0};
    for(const event of all)states[this.summary(event).state]++;
    return {active:all.length,limit:10000,warning:all.length>=9000,states,archived:this.archive(id).names().length};
  }
  compact(id,{keepDelivered=1000,maxEvents=500}={}){
    if(!Number.isInteger(keepDelivered)||keepDelivered<0||keepDelivered>9000||!Number.isInteger(maxEvents)||maxEvents<1||maxEvents>500)throw error('Limites de arquivamento invalidos');
    if(fs.existsSync(this.file(id,'.operation.lock')))throw error('Empresa em manutencao',409);
    const all=this.queue(id),completed=all.filter(e=>e.deliveries.length&&e.deliveries.every(d=>d.state==='delivered'));
    const selected=completed.slice(0,Math.min(maxEvents,Math.max(0,completed.length-keepDelivered))),ids=new Set(selected.map(e=>e.id));
    const archive=this.archive(id),at=new Date(this.clock()).toISOString();
    // Archive first, then remove from the active queue. A failed write leaves
    // the original queue intact; a retry safely reuses already published records.
    for(const event of selected)archive.store(event,at);
    if(selected.length)atomicJSON(this.file(id,'integration-events.private.json'),all.filter(e=>!ids.has(e.id)));
    return {archived:selected.length,remaining:all.length-selected.length,eligible:Math.max(0,completed.length-keepDelivered-selected.length)};
  }
  enqueue(id,input,key){
    if(typeof key!=='string'||!key||key.length>160)throw error('Idempotency-Key obrigatorio (ate 160 caracteres)');
    if(!['contact.created','message.received','sale.created','file.created','social.published'].includes(input.type)||!input.payload||typeof input.payload!=='object'||Array.isArray(input.payload))throw error('Evento invalido');
    if(Buffer.byteLength(JSON.stringify(input.payload))>32768)throw error('Payload excedeu 32 KB',413);
    if(fs.existsSync(this.file(id,'.operation.lock')))throw error('Empresa em manutencao; tente novamente depois',503);
    let events=this.queue(id);const fingerprint=digest(JSON.stringify({type:input.type,payload:input.payload})),archived=this.archive(id).find(key),previous=events.find(e=>e.key===key)||archived?.event;
    if(previous){if(previous.fingerprint!==fingerprint)throw error('Chave de idempotencia reutilizada com outro conteudo',409);return {...this.summary(previous),...(archived?{archived:true,archivedAt:archived.archivedAt}:{})};}
    if(events.length>=9000){this.compact(id,{keepDelivered:events.length>=10000?0:1000});events=this.queue(id);}
    if(events.length>=10000)throw error('Fila ativa atingiu limite; revise entregas pendentes, falhas ou sem fluxo',503);
    const routes=this.settings(id).routes.filter(r=>r.enabled&&r.event===input.type);
    const e={id:crypto.randomUUID(),key,fingerprint,type:input.type,payload:input.payload,createdAt:new Date(this.clock()).toISOString(),deliveries:routes.map(r=>({route:r.id,app:r.app,operation:r.operation,state:'pending',attempts:0,nextAt:this.clock()}))};
    events.push(e);atomicJSON(this.file(id,'integration-events.private.json'),events);return this.summary(e);
  }
  summary(e){return {id:e.id,type:e.type,createdAt:e.createdAt,state:!e.deliveries.length?'unrouted':e.deliveries.every(d=>d.state==='delivered')?'delivered':e.deliveries.some(d=>d.state==='failed')?'failed':'pending',deliveries:e.deliveries.map(d=>({...d}))};}
  events(id){return this.queue(id).slice(-100).reverse().map(e=>this.summary(e));}
  retry(id,eventId){const all=this.queue(id),e=all.find(e=>e.id===eventId);if(!e)throw error('Evento inexistente',404);for(const d of e.deliveries)if(d.state==='failed'){d.state='pending';d.attempts=0;d.nextAt=this.clock();delete d.error;}atomicJSON(this.file(id,'integration-events.private.json'),all);return this.summary(e);}
  async pollSources(ids){
    if(this.polling)return;this.polling=true;
    try{for(const id of ids){
      if(!this.settings(id).sources?.chatContacts||fs.existsSync(this.file(id,'.operation.lock')))continue;
      const state=read(this.file(id,'integration-sources.private.json'),{});
      try{
        const contacts=[];let complete=false;
        for(let page=1;page<=100;page++){
          const r=await this.invoke(id,'chat','contacts.list',{page});if(!Array.isArray(r.payload))throw error('Resposta de contatos invalida',422);
          contacts.push(...r.payload);if(r.payload.length<15||contacts.length>=Number(r.meta?.count||Infinity)){complete=true;break;}
        }
        if(!complete)throw error('Mais de 1500 contatos: configure webhooks para esta empresa',422);
        const seen=state.chat?.seen,queued=new Set(this.queue(id).map(e=>e.key));
        if(seen)for(const c of contacts)if(!seen.includes(String(c.id))&&!queued.has('chat:contact_created:'+c.id))this.enqueue(id,{type:'contact.created',payload:{name:c.name,email:c.email,phone:c.phone_number,source:'chat',sourceId:String(c.id)}},'chat:contact_created:'+c.id);
        state.chat={seen:contacts.map(c=>String(c.id)),lastAt:new Date(this.clock()).toISOString(),received:seen?contacts.filter(c=>!seen.includes(String(c.id))).length:0};
      }catch(e){state.chat={...state.chat,error:e.status?e.message:'Falha ao consultar contatos',lastAt:new Date(this.clock()).toISOString()};}
      atomicJSON(this.file(id,'integration-sources.private.json'),state);
    }}finally{this.polling=false;}
  }
  async drain(ids){
    if(this.working)return;this.working=true;
    try{for(const id of ids){
      if(fs.existsSync(this.file(id,'.operation.lock')))continue;
      let budget=20;
      for(const e of this.queue(id))for(let i=0;i<e.deliveries.length;i++){
        const d=e.deliveries[i];if(d.state!=='pending'||d.nextAt>this.clock())continue;
        if(budget--<=0)continue;
        let failure;try{await this.invoke(id,d.app,d.operation,d.app==='n8n'?{type:e.type,payload:e.payload}:e.payload,e.id);}catch(err){failure=err;}
        // Reload after I/O: API requests may have added events while waiting.
        const fresh=this.queue(id),current=fresh.find(v=>v.id===e.id).deliveries[i];current.attempts++;
        if(!failure){current.state='delivered';current.deliveredAt=new Date(this.clock()).toISOString();delete current.error;}
        else{current.error=failure.status?failure.message:'Falha interna do conector';current.state=current.attempts>=5||failure.status===422?'failed':'pending';current.nextAt=this.clock()+Math.min(300000,1000*2**current.attempts);}
        atomicJSON(this.file(id,'integration-events.private.json'),fresh);
      }
    }}finally{this.working=false;}
  }
}
