import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tenantPath} from './infra.mjs';
import {atomicJSON,requestApp} from './integration.mjs';
const exec=promisify(execFile);
const hostValid=h=>typeof h==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9.:-]{0,180}$/.test(h);
export function containerPhase(c){
  if(c.State==='running'&&c.Phase==='stopping')return 'stopping';
  if(c.State==='restarting')return 'restarting';
  if(c.State==='dead'||/unhealthy/.test(c.Status||''))return 'failed';
  if(c.State==='running')return /health: starting/.test(c.Status||'')?'starting':'running';
  if(c.State==='exited')return /Exited \(0\)/.test(c.Status||'')?'stopped':'failed';
  return ['created','paused','removing'].includes(c.State)?c.State:'unknown';
}
export function runtimeMonitoring(tenant,engine){
  const project=tenant?.project;
  return {
    containers:project?engine.containers.filter(c=>c.Project===project).map(c=>({name:c.Names,state:containerPhase(c),detail:c.Phase==='stopping'?'Sinal de encerramento observado; aguardando confirmacao da parada.':c.Status})):[],
    events:project?(engine.events?.recent||[]).filter(e=>e.project===project):[],
    eventStream:engine.events?{connected:engine.events.connected,error:engine.events.error,lastEventAt:engine.events.lastEventAt}:null
  };
}
export function configureMonitoring(id,targets){
  if(!Array.isArray(targets)||targets.length>20)throw Error('Maximo de 20 alvos');
  const clean=targets.map(t=>{
    if(!/^[a-z][a-z0-9-]{1,40}$/.test(t.id||'')||!hostValid(t.host)||!['dns','tcp','ping','arping','snmp'].includes(t.type))throw Error('Alvo de monitoramento invalido');
    const out={id:t.id,type:t.type,host:t.host};
    if(t.type==='tcp'||(t.type==='snmp'&&t.port!==undefined)){if(!Number.isInteger(t.port)||t.port<1||t.port>65535)throw Error('Porta invalida');out.port=t.port;}
    if(t.type==='snmp'){
      if(!t.user||!t.authKey||!t.privKey)throw Error('SNMPv3 exige usuario, chave SHA e chave AES');
      for(const k of ['user','authKey','privKey'])if(typeof t[k]!=='string'||t[k].length>200)throw Error('Credencial SNMP invalida');
      Object.assign(out,{user:t.user,authKey:t.authKey,privKey:t.privKey});
    }return out;
  });if(new Set(clean.map(t=>t.id)).size!==clean.length)throw Error('IDs duplicados');
  atomicJSON(path.join(tenantPath(id),'monitoring.private.json'),clean);return clean.map(({authKey,privKey,...t})=>t);
}
export async function probe(target,{transport=requestApp,lookup=dns.lookup,command=exec,snmpLoader=()=>import('net-snmp')}={}){
  const started=Date.now();try{
    let detail;
    if(target.type==='dns'){
      if(target.host.endsWith('.localhost'))return {state:'local',detail:'Nome local; resolvido por loopback, sem consulta DNS publica',latencyMs:0};
      let timer;
      try{detail=(await Promise.race([lookup(target.host,{all:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Timeout DNS')),5000);})])).map(r=>r.address).join(', ');}finally{clearTimeout(timer);}
    }else if(target.type==='tcp'){
      await new Promise((resolve,reject)=>{const s=net.connect({host:target.host,port:target.port});s.setTimeout(3000);s.on('connect',()=>{s.destroy();resolve();});s.on('timeout',()=>s.destroy(Error('Timeout TCP')));s.on('error',reject);});detail='Porta acessivel';
    }else if(target.type==='http'){
      const r=await transport(target.url);if(r.status<200||r.status>=400)throw Error('HTTP '+r.status);detail='HTTP '+r.status;
    }else if(target.type==='ping'||target.type==='arping'){
      if(target.type==='arping'&&process.platform==='win32')return {state:'unsupported',detail:'ARPING requer agente Linux no mesmo segmento de rede'};
      const args=target.type==='arping'?['-c','1','-w','2',target.host]:process.platform==='win32'?['-4','-n','1','-w','2000',target.host]:['-c','1','-W','2',target.host];
      const output=await command(target.type==='arping'?'arping':'ping',args,{timeout:4000,windowsHide:true,maxBuffer:16384});
      if(target.type==='ping'&&process.platform==='win32'&&!/\bTTL=\d+/i.test(output.stdout||''))throw Error('PING sem resposta echo IPv4');
      detail='Resposta recebida';
    }else if(target.type==='snmp'){
      let snmp;try{const mod=await snmpLoader();snmp=mod.default||mod;}catch{return {state:'unsupported',detail:'Instale a dependencia opcional net-snmp para habilitar SNMPv3'};}
      detail=await new Promise((resolve,reject)=>{
        const session=snmp.createV3Session(target.host,{name:target.user,level:snmp.SecurityLevel.authPriv,authProtocol:snmp.AuthProtocols.sha,authKey:target.authKey,privProtocol:snmp.PrivProtocols.aes,privKey:target.privKey},{port:target.port||161,timeout:2500,retries:0});
        session.get(['1.3.6.1.2.1.1.3.0'],(err,vars)=>{session.close();if(err||!vars?.length||snmp.isVarbindError(vars[0]))reject(Error('SNMPv3 sem resposta valida'));else resolve('sysUpTime='+vars[0].value);});
      });
    }else throw Error('Tipo nao suportado');
    return {state:'up',detail,latencyMs:Date.now()-started};
  }catch(e){return {state:e.code==='ENOENT'?'unsupported':'down',detail:e.code==='ENOENT'?'Ferramenta de rede ausente':target.type==='snmp'?'Falha SNMPv3 (verifique agente e credenciais)':e.code||e.message,latencyMs:Date.now()-started};}
}
export class Monitor{
  constructor(hub){this.hub=hub;this.snapshot={at:null,tenants:[]};this.busy=false;}
  async refresh(tenants,engine){
    if(this.busy)return;this.busy=true;
    try{
      const results=[];
      for(const t of tenants){
        const maintenance=fs.existsSync(path.join(tenantPath(t.id),'.operation.lock'));
        const {containers,events}=runtimeMonitoring(t,engine);
        if(maintenance){results.push({id:t.id,maintenance:true,checks:[],connectors:[],containers,events});continue;}
        const checks=[];const add=async(name,target)=>checks.push({name,...await probe(target)});
        await Promise.all(Object.entries(t.apiUrls||t.urls).map(([app,url])=>add(app,{type:'http',url:url+({postiz:'/api/auth/can-register',n8n:'/healthz/readiness',cloud:'/status.php',auth:'/-/health/ready/'}[app]||'/')})));
        const f=path.join(tenantPath(t.id),'monitoring.private.json'),targets=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):[];
        await Promise.all(targets.map(target=>add(target.id,target)));
        const connectors=[];
        for(const [app,c] of Object.entries(this.hub.publicSettings(t.id).connectors)){
          if(!c.enabled||!c.configured){connectors.push({app,state:'not-configured'});continue;}
          try{const result=await this.hub.invoke(t.id,app,'check');connectors.push({app,state:result.authentication==='verified'?'authenticated':'reachable',detail:result.authentication});}catch(e){connectors.push({app,state:'failed',detail:e.message});}
        }
        results.push({id:t.id,checks,connectors,containers,events});
      }
      this.snapshot={at:new Date().toISOString(),dockerError:engine.error,eventStream:engine.events?{connected:engine.events.connected,error:engine.events.error,lastEventAt:engine.events.lastEventAt}:null,tenants:results};
    }finally{this.busy=false;}
  }
}
