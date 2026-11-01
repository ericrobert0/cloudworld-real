import crypto from 'node:crypto';
import {postizOfflineStartup} from './postiz.mjs';
// Build only a disposable, isolated copy. Never reuse production volume/network names.
export function recoveryPlan(original,tenant,{project,port=8543,files=[]}={}){
  if(!/^vw-recovery-[a-z0-9-]+$/.test(project)||!tenant.local||port===tenant.port||!Number.isInteger(port)||port<1024||port>63997)throw Error('Plano de recuperacao invalido');
  const c=structuredClone(original),allowed=new Set(files),mapString=v=>typeof v==='string'?v.replaceAll(':'+tenant.port,':'+port):v;
  const rewrite=v=>typeof v==='string'?mapString(v):Array.isArray(v)?v.map(rewrite):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rewrite(x)])):v;
  c.name=project;c.networks=Object.fromEntries(Object.keys(c.networks).map(n=>[n,{internal:true}]));c.volumes=Object.fromEntries(Object.keys(c.volumes).map(n=>[n,{}]));
  const dbs=[];
  for(const [name,originalService] of Object.entries(c.services)){
    if(originalService.profiles?.length){delete c.services[name];continue;}
    if(!/@sha256:[a-f0-9]{64}$/.test(originalService.image))throw Error('Imagem nao fixada: '+name);
    if(originalService.privileged||originalService.network_mode||originalService.pid||originalService.devices||originalService.cap_add?.length)throw Error('Privilegio inesperado: '+name);
    const s=c.services[name]=rewrite(originalService);delete s.container_name;delete s.ports;s.restart='no';s.extra_hosts={'host.docker.internal':'127.0.0.1','gateway.docker.internal':'127.0.0.1'};
    if(!Array.isArray(s.networks)||!s.networks.length||s.networks.some(n=>!Object.hasOwn(c.networks,n)))throw Error('Rede explicita e interna obrigatoria: '+name);
    for(const mount of s.volumes||[]){if(typeof mount!=='string')throw Error('Montagem nao suportada');const source=mount.split(':')[0];if(source.startsWith('./')){if(!allowed.has(source.slice(2))||source.slice(2).includes('/'))throw Error('Arquivo de montagem ausente');}else if(!Object.hasOwn(c.volumes,source))throw Error('Montagem fora dos volumes isolados');}
    if(name.endsWith('-db')&&s.environment?.POSTGRES_DB){dbs.push({name,type:'pg',database:originalService.environment.POSTGRES_DB,user:originalService.environment.POSTGRES_USER});s.environment={POSTGRES_USER:'cw_restore_admin',POSTGRES_PASSWORD:crypto.randomBytes(32).toString('hex'),POSTGRES_DB:'cw_restore_maintenance'};s.healthcheck={test:['CMD-SHELL','pg_isready -U cw_restore_admin -d cw_restore_maintenance'],interval:'5s',timeout:'4s',retries:40};}
    else if(name.endsWith('-db')&&s.environment?.MARIADB_ROOT_PASSWORD){dbs.push({name,type:'maria'});s.healthcheck={test:['CMD-SHELL','MYSQL_PWD="$$MARIADB_ROOT_PASSWORD" mariadb --protocol=tcp -h127.0.0.1 -uroot -Nse "SELECT 1" >/dev/null'],interval:'5s',timeout:'5s',retries:60,start_period:'60s'};}
  }
  c.services.ingress.ports=['127.0.0.1:'+port+':443'];c.services.waha.ports=['127.0.0.1:'+(port+2)+':3000'];
  if(c.services.postiz){c.services.postiz.environment.RUN_CRON='false';c.services.postiz.command=postizOfflineStartup;}
  return {compose:c,dbs,tenant:rewrite({...tenant,project,port,urls:tenant.urls})};
}
