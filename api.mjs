import {readBody} from './read-body.mjs';
import {IntegrationHub} from './integration.mjs';
import {Monitor,configureMonitoring,runtimeMonitoring} from './monitoring.mjs';
import {PortalAccounts} from './portal.mjs';
import {AlertStore,readiness} from './operations.mjs';
import {NotificationDelivery,notificationSettings,configureNotifications} from './notifications.mjs';
import {ssoStatus,requireCentralLogin} from './oidc.mjs';
import {requestOriginAllowed} from './request-origin.mjs';

const err=(message,status)=>Object.assign(Error(message),{status});
export {readBody} from './read-body.mjs';
export function normalizeWebhook(source,body){
  if(source==='chat'){
    const c=body.contact||body;
    if(body.event==='contact_created')return {type:'contact.created',payload:{name:c.name,email:c.email,phone:c.phone_number,source:'chat',sourceId:String(c.id)}};
    if(body.event==='message_created'&&body.message_type==='incoming')return {type:'message.received',payload:{text:body.content,source:'chat',sourceId:String(body.id),name:body.sender?.name,phone:body.sender?.phone_number}};
  }
  if(source==='waha'&&body.event==='message'&&!body.payload?.fromMe)return {type:'message.received',payload:{text:body.payload?.body,chatId:body.payload?.from,source:'waha',sourceId:body.payload?.id}};
  throw err('Evento nao suportado (mensagens de saida sao ignoradas)',422);
}
export function createControlAPI({listTenants,engine,origin,proxyHost=null,hub=new IntegrationHub()}){
  const monitor=new Monitor(hub),accounts=new PortalAccounts(),alerts=new AlertStore(),notifications=new NotificationDelivery();
  const tick=async()=>{const all=listTenants(),ids=all.map(t=>t.id);await Promise.allSettled([(async()=>{await hub.pollSources(ids);await hub.drain(ids);})(),(async()=>{await monitor.refresh(all,engine());alerts.evaluate(monitor.snapshot);await notifications.tick();})()]);};
  const worker=setInterval(()=>{tick().catch(()=>{});},15000);worker.unref();
  function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
  return {hub,monitor,tick,close:()=>clearInterval(worker),async handle(req,res,operator){
    const u=new URL(req.url,origin),m=u.pathname.match(/^\/api\/v1\/tenants\/([a-z][a-z0-9-]{1,30})\/(.+)$/);
    if(!m)return false;
    try{
      const [,id,resource]=m;hub.dir(id);
      const mutating=!['GET','HEAD'].includes(req.method);
      if(operator&&mutating&&!requestOriginAllowed(req,{origin,proxyHost}))throw err('Origin invalida',403);
      // Bearer clients use explicit scoped tokens; never gain operator rights.
      const authorize=scope=>{if(!operator)hub.authorize(id,req.headers.authorization,scope);};
      const onlyOperator=()=>{if(!operator)throw err('Acesso exclusivo do operador',403);};
      if(resource==='integrations'&&req.method==='GET'){authorize('connectors:read');json(res,200,hub.publicSettings(id));}
      else if(resource==='integrations'&&req.method==='PUT'){onlyOperator();json(res,200,hub.configure(id,await readBody(req)));}
      else if(resource==='keys'&&req.method==='POST'){onlyOperator();json(res,201,hub.issueKey(id,await readBody(req)));}
      else if(/^keys\/[a-f0-9-]+$/.test(resource)&&req.method==='DELETE'){onlyOperator();hub.revokeKey(id,resource.split('/')[1]);json(res,200,{revoked:true});}
      else if(resource==='events'&&req.method==='POST'){authorize('events:write');json(res,202,hub.enqueue(id,await readBody(req),req.headers['idempotency-key']));}
      else if(resource==='events'&&req.method==='GET'){authorize('events:read');json(res,200,hub.events(id));}
      else if(resource==='events/stats'&&req.method==='GET'){onlyOperator();json(res,200,hub.queueStats(id));}
      else if(resource==='events/archive'&&req.method==='POST'){onlyOperator();json(res,200,hub.compact(id,await readBody(req)));}
      else if(/^contacts\/[1-9][0-9]{0,15}\/delivery$/.test(resource)&&req.method==='GET'){
        onlyOperator();const contactId=resource.split('/')[1],event=hub.queue(id).find(e=>e.key==='chat:contact_created:'+contactId);
        json(res,200,{contactId,captureEnabled:hub.settings(id).sources?.chatContacts===true,event:event?hub.summary(event):null});
      }
      else if(resource==='sources/chat/scan'&&req.method==='POST'){onlyOperator();await hub.pollSources([id]);json(res,200,hub.publicSettings(id).sources);}
      else if(/^events\/[a-f0-9-]+\/retry$/.test(resource)&&req.method==='POST'){onlyOperator();json(res,200,hub.retry(id,resource.split('/')[1]));}
      else if(/^connectors\/[a-z0-9]+\/[a-z.]+$/.test(resource)&&req.method==='POST'){
        const [,app,op]=resource.split('/');authorize(`${app}:${op}`);json(res,200,await hub.invoke(id,app,op,await readBody(req),req.headers['idempotency-key']||''));
      }
      else if(/^webhooks\/(chat|waha)$/.test(resource)&&req.method==='POST'){
        authorize('events:write');const source=resource.split('/')[1],body=await readBody(req),input=normalizeWebhook(source,body);
        const sourceId=source==='waha'?body.payload?.id:body.id||body.contact?.id;
        if(!sourceId)throw err('ID do evento de origem obrigatorio',400);
        json(res,202,hub.enqueue(id,input,source+':'+body.event+':'+sourceId));
      }
      else if(resource==='monitoring'&&req.method==='GET'){onlyOperator();const current=engine();json(res,200,{at:monitor.snapshot.at,...monitor.snapshot.tenants.find(t=>t.id===id),dockerError:current.error,...runtimeMonitoring(listTenants().find(t=>t.id===id),current)});}
      else if(resource==='monitoring'&&req.method==='PUT'){onlyOperator();json(res,200,configureMonitoring(id,(await readBody(req)).targets));}
      else if(resource==='portal/users'&&req.method==='GET'){onlyOperator();json(res,200,accounts.list(id));}
      else if(resource==='portal/users'&&req.method==='POST'){onlyOperator();json(res,200,await accounts.save(id,await readBody(req)));}
      else if(resource==='portal/sso'&&req.method==='GET'){onlyOperator();json(res,200,ssoStatus(id,accounts));}
      else if(resource==='portal/sso'&&req.method==='PUT'){onlyOperator();json(res,200,requireCentralLogin(id,await readBody(req),accounts));}
      else if(resource==='operations'&&req.method==='GET'){onlyOperator();json(res,200,{...readiness(id),alerts:alerts.list(id)});}
      else if(resource==='notifications'&&req.method==='GET'){onlyOperator();json(res,200,notificationSettings());}
      else if(resource==='notifications'&&req.method==='PUT'){onlyOperator();json(res,200,configureNotifications(await readBody(req)));}
      else if(resource==='notifications/test'&&req.method==='POST'){onlyOperator();json(res,200,await notifications.test());}
      else{throw err('Rota inexistente',404);}
    }catch(e){json(res,e.status||400,{error:e.status?e.message:'Configuracao ou dados invalidos'});}return true;
  }};
}
