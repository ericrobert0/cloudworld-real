import fs from 'node:fs';
import path from 'node:path';
import {ROOT,RUNTIME,createTenant,tenantPath,writeJSON} from './infra.mjs';
export const catalog={
  version:'2026-10-31.4',name:'CloudWorld — Microempresa',plan:'microempresa-padrao',
  applications:['auth','chat','n8n','postiz','cloud','erp'],
  delivery:'Um projeto isolado por empresa, com o mesmo conjunto de ferramentas e limites por servico.',
  availability:process.env.CODESPACES==='true'?'Apresentacao remota real; disponibilidade comercial ainda nao homologada.':'Piloto local; capacidade e disponibilidade comercial ainda nao homologadas.',
  integrations:{api:'API v1 por empresa, chaves com escopos e fila persistente de eventos.',flows:'Captura opcional de contatos Chatwoot para ERPNext/n8n; requer configurar e validar credenciais.',whatsapp:'Exige pareamento/licenca da integracao ou Cloud API',sso:'Conforme suporte e edicao de cada produto'},
  licensing:{n8n:'Validar acordo comercial antes de cobrar acesso hospedado.',waha:'Core incluido; Apps/Plus dependem de licenca propria.'}
};
export function tenants(){
  const base=path.join(RUNTIME,'tenants');fs.mkdirSync(base,{recursive:true});
  return fs.readdirSync(base).filter(n=>fs.existsSync(path.join(base,n,'tenant.json'))).map(n=>JSON.parse(fs.readFileSync(path.join(base,n,'tenant.json'))));
}
export function allocatePort(existing){
  for(let port=8453;port<64000;port+=10)if(existing.every(t=>Math.abs(t.port-port)>=4))return port;
  throw Error('Sem portas disponiveis.');
}
export function onboard(id,baseDomain=''){
  tenantPath(id);
  if(baseDomain&&(!/^(?=.{1,150}$)[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(baseDomain)||baseDomain.endsWith('.localhost')))throw Error('Informe um dominio real, ou deixe vazio para piloto local.');
  fs.mkdirSync(RUNTIME,{recursive:true});const registry=path.join(RUNTIME,'.onboard.lock');let fd;
  try{fd=fs.openSync(registry,'wx');}catch{throw Error('Outro cadastro esta em andamento.');}
  try{
    const existing=tenants();
    if(existing.some(t=>t.id===id))throw Error('Empresa ja cadastrada.');
    const domain=baseDomain?`${id}.${baseDomain}`:`${id}.localhost`;
    if(existing.some(t=>t.domain===domain))throw Error('Dominio ja cadastrado.');
    const t=createTenant(id,domain,allocatePort(existing),{sharedIngress:!!baseDomain});
    writeJSON(path.join(tenantPath(id),'service.json'),{plan:catalog.plan,version:catalog.version,lifecycle:'configured',createdAt:t.createdAt,applications:catalog.applications,commercialRelease:'pending-runtime-and-integrations'});
    writeJSON(path.join(RUNTIME,'catalog.json'),catalog);
    if(t.sharedIngress)writeGateway();
    return t;
  }finally{fs.closeSync(fd);fs.unlinkSync(registry);}
}
export function gatewayConfig(all,{linuxHost=false}={}){
  const selected=all.filter(t=>t.sharedIngress),networks={};
  if(!selected.length)throw Error('Nenhum cliente configurado para entrada publica central.');
  const routes=[],hostRoutes=[],tenantFiles={},services={};
  const gateway={image:'caddy:2.10.2',restart:'unless-stopped',cpus:1,mem_limit:'512m',logging:{driver:'json-file',options:{'max-size':'10m','max-file':'3'}}};
  const ports={auth:9000,chat:3000,n8n:5678,postiz:5000,cloud:80,erp:8080};
  for(const t of selected){
    tenantPath(t.id);
    if(!/^[a-z0-9.-]+$/.test(t.domain))throw Error('Dominio invalido no cadastro.');
    networks[t.id]={external:true,name:`${t.project}_proxy`};
    const tenantRoutes=[];
    const loopbackPort=t.port+1;
    if(linuxHost&&(!Number.isInteger(t.port)||loopbackPort>65535||loopbackPort<1024))throw Error('Porta inválida no cadastro.');
    for(const app of catalog.applications){
      const upstream=`${t.id}-${app}:${ports[app]}`;
      const hostname=`${app}.${t.domain}`;
      const proxyToApp=linuxHost?
        `reverse_proxy ${upstream} {\n  header_up X-Forwarded-Proto https\n }\n`:
        `reverse_proxy ${upstream}\n`;
      const proxy=app==='n8n'?
        ` @automation path /healthz/readiness /webhook/* /webhook-waiting/*\n handle @automation {\n  ${proxyToApp} }\n handle {\n  respond 404\n }\n`:
        ` ${proxyToApp}`;
      tenantRoutes.push(`${linuxHost?'http://':''}${hostname} {\n encode zstd gzip\n header X-Content-Type-Options nosniff\n${proxy}}\n`);
      if(linuxHost)hostRoutes.push(`${hostname} {\n reverse_proxy 127.0.0.1:${loopbackPort}\n}\n`);
    }
    if(linuxHost){
      const file=`Caddyfile.${t.id}`;
      tenantFiles[file]=tenantRoutes.join('\n')+'\nhttp:// {\n respond 404\n}\n';
      services[`gateway-${t.id}`]={...gateway,ports:[`127.0.0.1:${loopbackPort}:80`],volumes:[`./${file}:/etc/caddy/Caddyfile:ro`],networks:[t.id]};
    }else routes.push(...tenantRoutes);
  }
  if(!linuxHost)services.gateway={...gateway,ports:['80:80','443:443','443:443/udp'],volumes:['./Caddyfile:/etc/caddy/Caddyfile:ro','edge-data:/data','edge-config:/config'],networks:Object.keys(networks)};
  return {caddyfile:routes.join('\n'),tenantFiles,hostCaddyfile:hostRoutes.join('\n'),compose:{name:'vw-edge',services,networks,volumes:linuxHost?{}:{'edge-data':{},'edge-config':{}}}};
}
export function writeGateway(){
  const config=gatewayConfig(tenants(),{linuxHost:process.env.CW_LINUX_EDGE==='1'}),dir=path.join(RUNTIME,'edge');
  writeJSON(path.join(dir,'compose.json'),config.compose);fs.writeFileSync(path.join(dir,'Caddyfile'),config.caddyfile);
  for(const [file,content] of Object.entries(config.tenantFiles))fs.writeFileSync(path.join(dir,file),content);
  if(config.hostCaddyfile)fs.writeFileSync(path.join(dir,'Caddyfile.host'),config.hostCaddyfile);
  return dir;
}
export function adopt(id){
  const dir=tenantPath(id),file=path.join(dir,'compose.json'),c=JSON.parse(fs.readFileSync(file));
  if(catalog.applications.some(n=>!c.services[n]))throw Error('Ambiente incompleto para o pacote padrao.');
  if(!fs.existsSync(path.join(dir,'compose.before-standard.json')))fs.copyFileSync(file,path.join(dir,'compose.before-standard.json'));
  for(const s of Object.values(c.services)){s.cpus=1;s.pids_limit=512;s.mem_limit??='512m';}
  writeJSON(file,c);
  const t=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json')));
  t.plan=catalog.plan;t.serviceVersion=catalog.version;t.sharedIngress??=false;writeJSON(path.join(dir,'tenant.json'),t);
  writeJSON(path.join(dir,'service.json'),{plan:catalog.plan,version:catalog.version,lifecycle:'configured',applications:catalog.applications,commercialRelease:'pending-runtime-and-integrations'});
  writeJSON(path.join(RUNTIME,'catalog.json'),catalog);return t;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.join(ROOT,'service.mjs')){
  try{
    if(process.env.CODESPACES==='true'&&process.argv[2]==='onboard')throw Error('Este Codespace suporta uma empresa de apresentacao. Novos clientes exigem outro ambiente dimensionado.');
    if(process.argv[2]==='onboard')console.log(JSON.stringify(onboard(process.argv[3],process.argv[4]||''),null,2));
    else if(process.argv[2]==='edge')console.log(writeGateway());
    else if(process.argv[2]==='catalog')console.log(JSON.stringify(catalog,null,2));
    else if(process.argv[2]==='adopt')console.log(JSON.stringify(adopt(process.argv[3]),null,2));
    else throw Error('Uso: node service.mjs onboard EMPRESA [DOMINIO-BASE] | adopt EMPRESA | edge | catalog');
  }catch(e){console.error(e.message);process.exitCode=1;}
}
