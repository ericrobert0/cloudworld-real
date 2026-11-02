import fs from 'node:fs';
import path from 'node:path';
import {RUNTIME,createTenant,tenantPath,writeJSON} from './infra.mjs';
import {catalog} from './service.mjs';

export const appPorts={auth:18001,chat:18002,n8n:18003,postiz:18004,cloud:18005,erp:18006};
export function codespacesIdentity(env=process.env){
  const name=env.CODESPACE_NAME;
  if(env.CODESPACES!=='true'||!name||!/^[a-z0-9][a-z0-9-]{5,100}$/.test(name))throw Error('Execute no Codespace remoto.');
  if(env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN&&env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN!=='app.github.dev')throw Error('Dominio de encaminhamento nao homologado.');
  return {name,url:port=>`https://${name}-${port}.app.github.dev`};
}
export function assertPresentationTenant(t,env=process.env){
  if(t.local)return;
  const remote=codespacesIdentity(env);
  if(t.runtime!=='codespaces'||t.codespace!==remote.name)throw Error('Operacao restrita ao ambiente de apresentacao deste Codespace.');
}
export function codespacesGateway(urls){
  const targets={auth:'auth:9000',chat:'chat:3000',n8n:'n8n:5678',postiz:'postiz:5000',cloud:'cloud:80',erp:'erp:8080'};
  return '{\n auto_https off\n}\n'+Object.entries(appPorts).map(([app,port])=>{
    const u=new URL(urls[app]);
    if(u.protocol!=='https:'||!/^[a-z0-9-]+\.app\.github\.dev$/.test(u.hostname)||u.port)throw Error('Endereco Codespaces invalido no gateway.');
    // Postiz computes a parent cookie domain. Scope it to this forwarded hostname.
    const cookie=app==='postiz'?` header_down Set-Cookie "(?i)Domain=[^;]+" "Domain=${u.hostname}"\n`:'';
    return `:${port} {\n encode gzip\n @forwarded_browser {\n host localhost\n header Origin https://localhost:${port}\n header Sec-Fetch-Site same-origin\n }\n request_header @forwarded_browser Origin ${u.origin}\n header {\n ?X-Content-Type-Options nosniff\n ?X-Frame-Options SAMEORIGIN\n ?Referrer-Policy strict-origin-when-cross-origin\n >Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"\n -Server\n }\n reverse_proxy ${targets[app]} {\n header_up Host ${u.host}\n header_up X-Forwarded-Proto https\n${cookie} }\n}\n`;
  }).join('\n');
}
export function createCodespacesTenant(id,env=process.env){
  const remote=codespacesIdentity(env);
  const base=path.join(RUNTIME,'tenants');
  if(fs.existsSync(base)&&fs.readdirSync(base).some(n=>fs.existsSync(path.join(base,n,'tenant.json'))))throw Error('Este Codespace suporta somente uma empresa de apresentacao. Nao reutilizar as mesmas portas para outro cliente.');
  // The original factory supplies the same isolated databases, networks and secrets.
  const t=createTenant(id,`${id}.localhost`,8443),dir=tenantPath(id);
  const c=JSON.parse(fs.readFileSync(path.join(dir,'compose.json'),'utf8'));
  const urls=Object.fromEntries(Object.entries(appPorts).map(([app,port])=>[app,remote.url(port)]));
  Object.assign(t,{domain:new URL(remote.url(8100)).hostname,runtime:'codespaces',codespace:remote.name,local:false,resourceProfile:'economia-codespaces',urls,apiUrls:Object.fromEntries(Object.entries(appPorts).map(([app,port])=>[app,`http://127.0.0.1:${port}`])),deferredServices:{waha:'Aguardando vinculo com o numero WhatsApp e avaliacao de espaco',wireguard:'Encaminhamento Codespaces suporta TCP; VPN exige servidor apropriado'}});
  for(const name of ['chat','chat-init','chat-worker'])c.services[name].environment.FRONTEND_URL=urls.chat;
  Object.assign(c.services.n8n.environment,{N8N_HOST:new URL(urls.n8n).host,N8N_EDITOR_BASE_URL:urls.n8n,WEBHOOK_URL:urls.n8n+'/'});
  c.services.n8n.extra_hosts=['host.docker.internal:host-gateway'];
  Object.assign(c.services.postiz.environment,{MAIN_URL:urls.postiz,FRONTEND_URL:urls.postiz,NEXT_PUBLIC_BACKEND_URL:urls.postiz+'/api'});
  Object.assign(c.services.cloud.environment,{NEXTCLOUD_TRUSTED_DOMAINS:new URL(urls.cloud).host,OVERWRITEHOST:new URL(urls.cloud).host,OVERWRITECLIURL:urls.cloud});
  c.services['auth-worker'].environment.AUTHENTIK_BOOTSTRAP_EMAIL='admin@cloudworld.example';
  c.services.waha.profiles=['whatsapp'];
  c.services.ingress.ports=Object.values(appPorts).map(p=>`127.0.0.1:${p}:${p}`);
  fs.writeFileSync(path.join(dir,'Caddyfile'),codespacesGateway(urls));
  writeJSON(path.join(dir,'tenant.json'),t);writeJSON(path.join(dir,'compose.json'),c);
  writeJSON(path.join(dir,'service.json'),{plan:catalog.plan,version:catalog.version,lifecycle:'configured',applications:catalog.applications,commercialRelease:'pending-publication-and-production-validation',runtime:'codespaces'});
  writeJSON(path.join(RUNTIME,'catalog.json'),catalog);
  return t;
}
