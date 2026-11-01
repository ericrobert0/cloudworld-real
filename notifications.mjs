import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {RUNTIME} from './infra.mjs';
import {atomicJSON,requestApp} from './integration.mjs';
const file=path.join(RUNTIME,'notification.private.json'),read=(p,f)=>{try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return f;}};
const fingerprint=c=>c.url?crypto.createHash('sha256').update(c.url+'\n'+(c.token||'')).digest('hex'):'';
// Fingerprints stay private and are never returned by the API.
export function notificationSettings(){const c=read(file,{}),h=read(path.join(RUNTIME,'notification-health.private.json'),{});return {enabled:c.enabled===true,configured:!!c.url,host:c.url?new URL(c.url).hostname:'',enabledAt:c.enabledAt||null,lastConfirmedAt:h.fingerprint===fingerprint(c)?h.at:null};}
export function configureNotifications(input){
  const c=read(file,{}),before=fingerprint(c);if(typeof input.enabled!=='boolean')throw Error('enabled deve ser booleano');
  if(input.url){const url=new URL(input.url);if(url.username||url.password||url.hash||(url.protocol!=='https:'&&!(url.protocol==='http:'&&url.hostname==='127.0.0.1')))throw Error('Destino deve usar HTTPS (HTTP somente no loopback de teste)');if(c.url!==url.href)delete c.token;c.url=url.href;}
  if(input.token){if(typeof input.token!=='string'||input.token.length>4096||/[\r\n]/.test(input.token))throw Error('Token invalido');c.token=input.token;}
  if(input.enabled&&!c.url)throw Error('Informe o destino de notificacoes');
  if(input.enabled&&(!c.enabled||fingerprint(c)!==before))c.enabledAt=new Date().toISOString();c.enabled=input.enabled;
  atomicJSON(file,c);return notificationSettings();
}
export class NotificationDelivery{
  constructor({transport=requestApp,clock=()=>Date.now()}={}){this.transport=transport;this.clock=clock;this.busy=false;}
  async test(){
    const c=read(file,{});if(!c.enabled||!c.url)throw Error('Configure e habilite o destino primeiro');
    const r=await this.transport(c.url,{method:'POST',timeout:5000,headers:{'Content-Type':'application/json',...(c.token?{Authorization:'Bearer '+c.token}:{})},body:{text:'CloudWorld: teste do canal de alertas',incident:{type:'test',at:new Date(this.clock()).toISOString()}}});
    if(r.status<200||r.status>=300)throw Error('Destino nao confirmou o teste');
    atomicJSON(path.join(RUNTIME,'notification-health.private.json'),{fingerprint:fingerprint(c),at:new Date(this.clock()).toISOString()});return {ok:true,at:new Date(this.clock()).toISOString()};
  }
  async tick(){
    if(this.busy)return;const c=read(file,{});if(!c.enabled||!c.url)return;this.busy=true;
    try{
      const statusFile=path.join(RUNTIME,'notification-deliveries.json'),state=read(statusFile,{}),alerts=read(path.join(RUNTIME,'alerts.json'),[]);let budget=5;
      for(const a of alerts.filter(a=>a.state==='open'||a.state==='resolved'&&Date.parse(a.resolvedAt)>=Date.parse(c.enabledAt||0))){
        const key=fingerprint(c)+':'+a.id+':'+a.state,s=state[key]||{attempts:0,nextAt:0};if(s.delivered||s.attempts>=5||s.nextAt>this.clock()||budget--<=0)continue;
        const incident={id:a.id,company:a.tenant,state:a.state,service:a.key,openedAt:a.openedAt,...(a.resolvedAt?{resolvedAt:a.resolvedAt}:{})};
        try{const r=await this.transport(c.url,{method:'POST',timeout:5000,headers:{'Content-Type':'application/json',...(c.token?{Authorization:'Bearer '+c.token}:{})},body:{text:'CloudWorld: '+a.tenant+' · '+a.label+' · '+(a.state==='open'?'ATENCAO':'RECUPERADO'),incident}});if(r.status<200||r.status>=300)throw Error();s.delivered=true;s.deliveredAt=new Date(this.clock()).toISOString();delete s.error;atomicJSON(path.join(RUNTIME,'notification-health.private.json'),{fingerprint:fingerprint(c),at:s.deliveredAt});}
        catch{s.error='Destino nao confirmou o recebimento';s.nextAt=this.clock()+Math.min(300000,2000*2**s.attempts);}
        s.attempts++;state[key]=s;atomicJSON(statusFile,Object.fromEntries(Object.entries(state).slice(-2000)));
      }
    }finally{this.busy=false;}
  }
}
