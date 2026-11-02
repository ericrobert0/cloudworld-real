import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {RUNTIME,tenantPath,writeJSON} from '../infra.mjs';
import {codespacesIdentity,assertPresentationTenant} from '../codespaces.mjs';
import {configureMonitoring,probe} from '../monitoring.mjs';
const id=process.argv[2]||'apresentacao',remote=codespacesIdentity(),dir=tenantPath(id);
const tenant=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json'),'utf8'));assertPresentationTenant(tenant);
const requested=[{id:'host-local',type:'ping',host:'127.0.0.1'},{id:'portal-dns',type:'dns',host:new URL(remote.url(8100)).hostname},{id:'painel-tcp',type:'tcp',host:'127.0.0.1',port:8099},{id:'portal-tcp',type:'tcp',host:'127.0.0.1',port:8100}];
const capabilities=[];
try{
  const route=JSON.parse(execFileSync('ip',['-j','route','show','default'],{encoding:'utf8',timeout:3000}))[0];
  if(!net.isIPv4(route?.gateway))throw Error('Gateway Ethernet IPv4 nao identificado.');
  const arp={id:'gateway-arp',type:'arping',host:route.gateway},result=await probe(arp);
  capabilities.push({type:'arping',...result});if(result.state==='up')requested.push(arp);
}catch{capabilities.push({type:'arping',state:'unsupported',detail:'Gateway/interface Ethernet nao identificado neste ambiente.'});}
const file=path.join(dir,'monitoring.private.json'),existing=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
const added=requested.filter(target=>!existing.some(saved=>saved.id===target.id));
configureMonitoring(id,[...existing,...added]);
const checks=[];
for(const target of requested){const saved=existing.find(item=>item.id===target.id)||target;checks.push({id:saved.id,type:saved.type,...await probe(saved)});}
writeJSON(path.join(RUNTIME,'reports','codespaces-network-monitoring.json'),{at:new Date().toISOString(),tenant:id,checks,capabilities,snmp:{state:'not-configured',detail:'Nenhum equipamento/agente SNMPv3 externo informado. Nao inventar alvo nem credenciais.'},scope:'Loopback e DNS deste Codespace; ARP do gateway somente quando uma resposta real foi observada. Nao mede uma VPS ou rede de cliente externa.'});
for(const check of checks)console.log(check.id+': '+check.state);
for(const capability of capabilities)console.log(capability.type+': '+capability.state);
console.log('SNMPv3 externo: nao configurado (sem agente informado).');
if(checks.some(check=>check.state!=='up'))process.exitCode=1;
