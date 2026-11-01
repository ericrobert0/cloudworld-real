import {addPostiz} from './postiz.mjs';
import {economyProfile} from './resource-profile.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const RUNTIME = process.env.VW_RUNTIME_DIR ? path.resolve(process.env.VW_RUNTIME_DIR) : path.join(ROOT, 'runtime');
export const secret = () => crypto.randomBytes(32).toString('hex');
export const writeJSON = (p, value) => { fs.mkdirSync(path.dirname(p), {recursive:true}); const tmp=p+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp, JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,p); };
export function tenantPath(id) {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(id)) throw Error('Cliente: 2 a 31 caracteres, letras minusculas, numeros e hifen.');
  return path.join(RUNTIME,'tenants',id);
}
const health = cmd => ({test:['CMD-SHELL',cmd], interval:'15s', timeout:'10s', retries:20, start_period:'600s'});
const healthy = (...names) => Object.fromEntries(names.map(n=>[n,{condition:'service_healthy'}]));
const completed = name => ({[name]:{condition:'service_completed_successfully'}});
export function createTenant(id, domain=`${id}.localhost`, port=8443, options={}) {
  const dir=tenantPath(id);
  if(!/^(?=.{1,180}$)[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(domain)) throw Error('Dominio invalido.');
  if(!Number.isInteger(port)||(port!==443&&port<1024)||port>64000) throw Error('Porta invalida.');
  if(fs.existsSync(path.join(dir,'compose.json'))) throw Error('Cliente ja existe; nao sobrescrevo credenciais.');
  const local=domain.endsWith('.localhost'), project=`vw-${id}`, sharedIngress=options.sharedIngress===true;
  if(options.resourceProfile!==undefined&&!['padrao','economia-local'].includes(options.resourceProfile))throw Error('Perfil de recursos invalido');
  if(!local&&options.resourceProfile==='economia-local')throw Error('Perfil economico automatico restrito ao ambiente local');
  if(sharedIngress&&local)throw Error('A entrada publica central exige dominio real.');
  const url = app => `https://${app}.${domain}${port===443||sharedIngress?'':`:${port}`}`;
  const passwords=Object.fromEntries(['auth','authKey','authAdmin','chat','chatKey','n8n','n8nKey','postiz','postizKey','temporal','cloud','cloudAdmin','maria','erpAdmin','waha','wahaDashboard'].map(k=>[k,secret()]));
  const s={}, networks={}, volumes={};
  function svc(name,image,net,props={}) {
    net.forEach(n=>{networks[n]??={};});
    s[name]={image,restart:'unless-stopped',networks:net,cpus:1,pids_limit:512,mem_limit:'512m',logging:{driver:'json-file',options:{'max-size':'10m','max-file':'3'}},...props};
    for(const v of s[name].volumes??[]) if(typeof v==='string'&&!v.startsWith('.')&&!v.startsWith('/')&&v.includes(':')) volumes[v.split(':')[0]]={};
    return s[name];
  }
  function pg(name,user,pass,image='postgres:16-alpine',db=user) {
    svc(name,image,[name],{environment:{POSTGRES_USER:user,POSTGRES_PASSWORD:pass,POSTGRES_DB:db},volumes:[`${name}:/var/lib/postgresql/data`],healthcheck:health(`pg_isready -U ${user} -d ${db}`),mem_limit:'512m'});
  }
  function redis(name,net=name) { svc(name,'redis:7.2-alpine',[net],{command:['redis-server','--appendonly','yes'],volumes:[`${name}:/data`],healthcheck:health('redis-cli ping | grep -q PONG'),mem_limit:'256m'}); }
  pg('auth-db',`auth_${id.replaceAll('-','_')}`,passwords.auth);
  const ae={AUTHENTIK_POSTGRESQL__HOST:'auth-db',AUTHENTIK_POSTGRESQL__USER:s['auth-db'].environment.POSTGRES_USER,AUTHENTIK_POSTGRESQL__NAME:s['auth-db'].environment.POSTGRES_DB,AUTHENTIK_POSTGRESQL__PASSWORD:passwords.auth,AUTHENTIK_SECRET_KEY:passwords.authKey,AUTHENTIK_ERROR_REPORTING__ENABLED:'false'};
  for(const [name,command] of [['auth','server'],['auth-worker','worker']]) svc(name,'ghcr.io/goauthentik/server:2026.8.5',['auth-db',...(name==='auth'?['proxy']:[])],{command,environment:{...ae,...(name==='auth-worker'?{AUTHENTIK_BOOTSTRAP_PASSWORD:passwords.authAdmin,AUTHENTIK_BOOTSTRAP_EMAIL:`admin@${domain}`}:{})},volumes:['auth-data:/data','auth-templates:/templates'],depends_on:healthy('auth-db'),shm_size:'512m',mem_limit:'1536m',healthcheck:health('ak healthcheck')});
  pg('chat-db',`chat_${id.replaceAll('-','_')}`,passwords.chat,'pgvector/pgvector:pg16'); redis('chat-redis','chat-db');
  const ce={NODE_ENV:'production',RAILS_ENV:'production',INSTALLATION_ENV:'docker',SECRET_KEY_BASE:passwords.chatKey,FRONTEND_URL:url('chat'),FORCE_SSL:'true',ENABLE_ACCOUNT_SIGNUP:'false',POSTGRES_HOST:'chat-db',POSTGRES_DATABASE:s['chat-db'].environment.POSTGRES_DB,POSTGRES_USERNAME:s['chat-db'].environment.POSTGRES_USER,POSTGRES_PASSWORD:passwords.chat,REDIS_URL:'redis://chat-redis:6379',RAILS_LOG_TO_STDOUT:'true',ACTIVE_STORAGE_SERVICE:'local',DEFAULT_LOCALE:'pt_BR'};
  svc('chat-init','chatwoot/chatwoot:v4.19.1',['chat-db'],{restart:'no',environment:ce,volumes:['chat-storage:/app/storage'],command:['bundle','exec','rails','db:chatwoot_prepare'],depends_on:healthy('chat-db','chat-redis')});
  svc('chat','chatwoot/chatwoot:v4.19.1',['chat-db','proxy'],{environment:ce,volumes:['chat-storage:/app/storage'],entrypoint:'docker/entrypoints/rails.sh',command:['bundle','exec','rails','s','-p','3000','-b','0.0.0.0'],depends_on:completed('chat-init'),mem_limit:'1536m'});
  svc('chat-worker','chatwoot/chatwoot:v4.19.1',['chat-db'],{environment:ce,volumes:['chat-storage:/app/storage'],command:['bundle','exec','sidekiq','-C','config/sidekiq.yml'],depends_on:completed('chat-init'),mem_limit:'1024m'});
  svc('waha','devlikeapro/waha:latest',['waha'],{environment:{WHATSAPP_API_KEY:passwords.waha,WAHA_DASHBOARD_USERNAME:'admin',WAHA_DASHBOARD_PASSWORD:passwords.wahaDashboard,WHATSAPP_SWAGGER_ENABLED:'false',WHATSAPP_DEFAULT_ENGINE:'WEBJS'},volumes:['waha-sessions:/app/.sessions','waha-media:/app/.media'],ports:[`127.0.0.1:${port+2}:3000`],shm_size:'512m',mem_limit:'1536m'});
  // WAHA permanece privado. Integracao usa n8n/API; o App nativo pode exigir WAHA Plus.
  pg('n8n-db',`n8n_${id.replaceAll('-','_')}`,passwords.n8n);
  svc('n8n','docker.n8n.io/n8nio/n8n:2.45.7',['n8n-db','proxy','waha'],{environment:{DB_TYPE:'postgresdb',DB_POSTGRESDB_HOST:'n8n-db',DB_POSTGRESDB_DATABASE:s['n8n-db'].environment.POSTGRES_DB,DB_POSTGRESDB_USER:s['n8n-db'].environment.POSTGRES_USER,DB_POSTGRESDB_PASSWORD:passwords.n8n,N8N_ENCRYPTION_KEY:passwords.n8nKey,N8N_HOST:`n8n.${domain}`,N8N_PROTOCOL:'https',N8N_EDITOR_BASE_URL:url('n8n'),WEBHOOK_URL:`${url('n8n')}/`,N8N_PROXY_HOPS:'1',GENERIC_TIMEZONE:'America/Sao_Paulo',TZ:'America/Sao_Paulo',N8N_DIAGNOSTICS_ENABLED:'false',N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS:'true',EXECUTIONS_DATA_PRUNE:'true',EXECUTIONS_DATA_MAX_AGE:'168'},volumes:['n8n-data:/home/node/.n8n'],depends_on:healthy('n8n-db'),mem_limit:'1024m',healthcheck:health("wget -q -O - http://127.0.0.1:5678/healthz/readiness >/dev/null")});
  addPostiz({services:s,networks,volumes},{id,url:url('postiz'),secrets:passwords});
  pg('cloud-db',`cloud_${id.replaceAll('-','_')}`,passwords.cloud); redis('cloud-redis','cloud-db');
  const cloud={POSTGRES_HOST:'cloud-db',POSTGRES_DB:s['cloud-db'].environment.POSTGRES_DB,POSTGRES_USER:s['cloud-db'].environment.POSTGRES_USER,POSTGRES_PASSWORD:passwords.cloud,NEXTCLOUD_ADMIN_USER:'admin',NEXTCLOUD_ADMIN_PASSWORD:passwords.cloudAdmin,NEXTCLOUD_TRUSTED_DOMAINS:`cloud.${domain} cloud.${domain}:${port}`,TRUSTED_PROXIES:'172.16.0.0/12',OVERWRITEPROTOCOL:'https',OVERWRITEHOST:`cloud.${domain}${port===443||sharedIngress?'':`:${port}`}`,OVERWRITECLIURL:url('cloud'),REDIS_HOST:'cloud-redis'};
  svc('cloud','nextcloud:33-apache',['cloud-db','proxy'],{environment:cloud,volumes:['cloud-data:/var/www/html'],depends_on:healthy('cloud-db','cloud-redis'),mem_limit:'1024m'});
  svc('cloud-cron','nextcloud:33-apache',['cloud-db'],{entrypoint:'/cron.sh',volumes:['cloud-data:/var/www/html'],depends_on:{cloud:{condition:'service_started'}},mem_limit:'256m'});
  svc('erp-db','mariadb:11.8',['erp-data'],{environment:{MARIADB_ROOT_PASSWORD:passwords.maria},command:['--character-set-server=utf8mb4','--collation-server=utf8mb4_unicode_ci','--skip-character-set-client-handshake','--innodb-snapshot-isolation=OFF'],volumes:['erp-db:/var/lib/mysql'],healthcheck:health('healthcheck.sh --connect --innodb_initialized'),mem_limit:'768m'});
  redis('erp-cache','erp-data');redis('erp-queue','erp-data');
  const erpVol=['erp-sites:/home/frappe/frappe-bench/sites','erp-logs:/home/frappe/frappe-bench/logs'];
  const erpEnv={FRAPPE_REDIS_CACHE:'redis://erp-cache:6379',FRAPPE_REDIS_QUEUE:'redis://erp-queue:6379'};
  const erp=(name,props={})=>svc(name,'frappe/erpnext:v16.53.0',['erp-data'],{volumes:erpVol,environment:erpEnv,mem_limit:'768m',...props});
  erp('erp-config',{restart:'no',entrypoint:['bash','-ec'],command:['ls -1 apps > sites/apps.txt; bench set-config -g db_host erp-db; bench set-config -gp db_port 3306; bench set-config -g redis_cache redis://erp-cache:6379; bench set-config -g redis_queue redis://erp-queue:6379; bench set-config -g redis_socketio redis://erp-queue:6379; bench set-config -gp socketio_port 9000'],depends_on:healthy('erp-db','erp-cache','erp-queue')});
  erp('erp-init',{restart:'no',entrypoint:['bash','-ec'],environment:{...erpEnv,ERP_ADMIN_PASSWORD:passwords.erpAdmin,DB_ROOT_PASSWORD:passwords.maria},command:['if [ ! -f sites/frontend/site_config.json ]; then bench new-site --mariadb-user-host-login-scope="%" --admin-password="$$ERP_ADMIN_PASSWORD" --db-root-username=root --db-root-password="$$DB_ROOT_PASSWORD" --install-app erpnext --set-default frontend; fi'],depends_on:completed('erp-config'),mem_limit:'1536m'});
  erp('erp-backend',{depends_on:completed('erp-init')});
  erp('erp-websocket',{command:['node','/home/frappe/frappe-bench/apps/frappe/socketio.js'],depends_on:completed('erp-init')});
  erp('erp-worker',{command:['bench','worker','--queue','long,default,short'],depends_on:completed('erp-init')});
  erp('erp-scheduler',{command:['bench','schedule'],depends_on:completed('erp-init')});
  erp('erp',{networks:['erp-data','proxy'],command:['nginx-entrypoint.sh'],environment:{BACKEND:'erp-backend:8000',FRAPPE_SITE_NAME_HEADER:'frontend',SOCKETIO:'erp-websocket:9000',UPSTREAM_REAL_IP_ADDRESS:'127.0.0.1',UPSTREAM_REAL_IP_HEADER:'X-Forwarded-For',UPSTREAM_REAL_IP_RECURSIVE:'off',PROXY_READ_TIMEOUT:'120',CLIENT_MAX_BODY_SIZE:'50m'},depends_on:{'erp-backend':{condition:'service_started'},'erp-websocket':{condition:'service_started'}}});
  // So o ingress tem portas de aplicacoes; nenhum banco e publicado no host.
  svc('ingress','caddy:2.10.2',['proxy'],{ports:[`${local||sharedIngress?'127.0.0.1:':''}${port}:443`,`${local||sharedIngress?'127.0.0.1:':''}${port===443?80:port+1}:80`],volumes:['./Caddyfile:/etc/caddy/Caddyfile:ro','caddy-data:/data','caddy-config:/config'],mem_limit:'256m'});
  svc('wireguard','lscr.io/linuxserver/wireguard:latest',['vpn'],{profiles:['vpn'],cap_add:['NET_ADMIN'],environment:{PUID:'1000',PGID:'1000',TZ:'America/Sao_Paulo',SERVERURL:'configure-seu-endpoint.invalid',SERVERPORT:'51820',PEERS:'admin',PEERDNS:'1.1.1.1',INTERNAL_SUBNET:'10.13.13.0',ALLOWEDIPS:'10.13.13.0/24',LOG_CONFS:'false'},ports:[`${port+3}:51820/udp`],volumes:['wireguard-config:/config'],sysctls:{'net.ipv4.conf.all.src_valid_mark':'1'},mem_limit:'256m'});
  const targets={auth:'auth:9000',chat:'chat:3000',n8n:'n8n:5678',postiz:'postiz:5000',cloud:'cloud:80',erp:'erp:8080'};
  if(sharedIngress){
    s.ingress.profiles=['local-ingress'];
    for(const app of Object.keys(targets))s[app].networks=Object.fromEntries(s[app].networks.map(n=>[n,n==='proxy'?{aliases:[`${id}-${app}`]}:{}]));
  }
  const caddy='{\n auto_https disable_redirects\n}\n'+Object.entries(targets).map(([app,target])=>`${app}.${domain} {\n ${local?'tls internal\n ':''}encode zstd gzip\n reverse_proxy ${target}\n header X-Content-Type-Options nosniff\n}\n`).join('\n');
  fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(path.join(dir,'Caddyfile'),caddy);
  const economy=local&&options.resourceProfile!=='padrao';
  const config={id,domain,port,local,project,sharedIngress,resourceProfile:economy?'economia-local':'padrao',serviceVersion:'2026-10-31.4',plan:'microempresa-padrao',createdAt:new Date().toISOString(),urls:Object.fromEntries(Object.keys(targets).map(k=>[k,url(k)]))};
  writeJSON(path.join(dir,'tenant.json'),config);writeJSON(path.join(dir,'secrets.json'),passwords);
  const initial={name:project,services:s,networks,volumes},compose=economy?economyProfile(initial):initial;writeJSON(path.join(dir,'compose.json'),compose);
  writeJSON(path.join(dir,'images.requested.json'),Object.fromEntries(Object.entries(s).map(([k,v])=>[k,v.image])));
  return config;
}
