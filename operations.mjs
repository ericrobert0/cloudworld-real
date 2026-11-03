import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {ROOT,RUNTIME,tenantPath} from './infra.mjs';
import {atomicJSON} from './integration.mjs';
import {backupTargetEvidence} from './backup-target.mjs';
import {backupScheduleReadiness} from './backup-schedule.mjs';
const read=(p,fallback)=>{try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return fallback;}};
export function latestBackup(id){
  const base=path.join(RUNTIME,'backups',id);if(!fs.existsSync(base))return null;
  return fs.readdirSync(base,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>({dir:path.join(base,d.name),manifest:read(path.join(base,d.name,'manifest.json'),null)})).filter(b=>b.manifest?.client===id).sort((a,b)=>Date.parse(b.manifest.createdAt)-Date.parse(a.manifest.createdAt))[0]||null;
}
export function readiness(id){
  const dir=tenantPath(id),t=read(path.join(dir,'tenant.json'),null);if(!t)throw Error('Empresa inexistente');
  const users=read(path.join(dir,'portal-users.private.json'),[]),backup=latestBackup(id),policy=read(path.join(RUNTIME,'backup-policy.private.json'),{}),job=read(path.join(RUNTIME,'backup-jobs',id+'.json'),{});
  const codespaces=t.runtime==='codespaces',target=backupTargetEvidence(policy.externalDirectory),schedule=backupScheduleReadiness(policy,{codespaces});
  const restoreBase=path.join(RUNTIME,'restore-tests'),restore=backup&&fs.existsSync(restoreBase)&&fs.readdirSync(restoreBase).some(d=>{const r=read(path.join(restoreBase,d,'result.json'),{});return r.ok&&path.resolve(r.source||'')===path.resolve(backup.dir);});
  const functionalBase=path.join(RUNTIME,'functional-recovery'),functional=backup&&fs.existsSync(functionalBase)&&fs.readdirSync(functionalBase).some(d=>{const r=read(path.join(functionalBase,d,'result.json'),{});return r.ok===true&&r.tenant===id&&r.originalResumed===true&&r.copyStopped===true&&path.resolve(r.backup||'')===path.resolve(backup.dir);});
  const reports=path.join(RUNTIME,'reports'),hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'compose.json'))).digest('hex');
  const loadReport=prefix=>fs.existsSync(reports)?fs.readdirSync(reports).filter(n=>new RegExp('^'+prefix+'-\\d+\\.json$').test(n)).map(n=>read(path.join(reports,n),{})).filter(r=>r.tenant===id).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0]:null;
  const sustained=loadReport('load-local'),bursts=loadReport('load-bursts'),validLoad=r=>r?.ok===true&&r.phase==='complete'&&r.composeSha256===hash&&Date.now()-Date.parse(r.finishedAt)<36*3600000,localLoad=validLoad(sustained)&&validLoad(bursts);
  const burstRows=(bursts?.rounds||[]).flatMap(r=>r.bursts||[]),loadRequests=(sustained?.stages||[]).flatMap(s=>s.endpoints||[]).reduce((n,e)=>n+(Number(e.requests)||0),0)+burstRows.reduce((n,e)=>n+(Number(e.requests)||0),0),maxInFlight=Math.max(0,...burstRows.map(r=>Number(r.maxInFlight)||0));
  const notification=read(path.join(RUNTIME,'notification.private.json'),{}),notificationHealth=read(path.join(RUNTIME,'notification-health.private.json'),{}),notificationFingerprint=notification.url?crypto.createHash('sha256').update(notification.url+'\n'+(notification.token||'')).digest('hex'):'';
  const items=[
    {id:'portal',label:'Acesso separado do cliente',ok:users.some(u=>u.enabled),detail:'Portal próprio; permissões das ferramentas continuam sendo configuradas em cada aplicação.'},
    {id:'mfa',label:'Segundo fator e contas individuais validados',ok:false,detail:'O responsavel precisa cadastrar seu autenticador; validar acesso, recuperacao e permissoes em cada ferramenta antes da entrega.'},
    {id:'customer-isolation',label:'Duas empresas completas homologadas no servidor de destino',ok:false,detail:codespaces?'Este Codespaces atende uma empresa de apresentacao. Ensaios de bancos e testes de codigo nao certificam duas empresas completas em producao.':'Exige ensaio de APIs, arquivos, sessoes, redes e credenciais de duas empresas no servidor de destino.'},
    {id:'backup',label:'Backup local recente',ok:!!backup&&Date.now()-Date.parse(backup.manifest.createdAt)<36*3600000,detail:backup?.manifest.createdAt||'Nenhum backup completo encontrado'},
    {id:'schedule',label:'Rotina automática de backup',...schedule},
    {id:'external',label:'Cópia criptografada fora do servidor',ok:target.offHost&&!!job.export?.ok&&!!policy.externalDirectory&&job.backupAt===backup?.manifest.createdAt&&job.export.targetId===crypto.createHash('sha256').update(path.resolve(policy.externalDirectory)).digest('hex'),detail:target.reason+'. Manter a chave de recuperacao separada.'},
    {id:'restore',label:'Teste de integridade e restauração do último backup',ok:!!(restore||functional),detail:'Verifica SQL e extração de volumes; consulte também o ensaio funcional.'},
    {id:'functional-restore',label:'Aplicações e dados do último backup recuperados',ok:!!functional,detail:'Ensaio local isolado de APIs, dados e portal; não certifica continuidade, carga, canais externos ou restauração em outro servidor.'},
    {id:'local-load',label:'Ensaio local de consultas e rajadas',ok:!!localLoad,detail:localLoad?loadRequests+' leituras registradas, rajadas com até '+maxInFlight+' requisições em voo. Não define usuários/clientes nem homologa produção.':'Requer perfis de consultas contínuas e rajadas recentes, sem falhas e na configuração atual. Não substitui teste no servidor definitivo.'},
    {id:'domain',label:'Domínio de produção',ok:!codespaces&&!t.local&&!t.domain.endsWith('.localhost')&&!t.domain.endsWith('.app.github.dev'),detail:codespaces?'Endereco temporario do Codespaces; dominio/endereco definitivo depende do servidor de producao.':'Ainda exige DNS, HTTPS e teste de acesso externo.'},
    {id:'hosting',label:'Servidor de produção disponível continuamente',ok:false,detail:codespaces?'Codespaces remoto para apresentacao: sujeito a cota, suspensao e retencao. Nao homologado para operacao continua.':'Nao homologado. Disponibilidade depende do host e da configuracao de servicos.'},
    {id:'notification',label:'Avisos fora do painel',ok:notification.enabled===true&&notification.url?.startsWith('https:')&&notificationHealth.fingerprint===notificationFingerprint,detail:notificationHealth.fingerprint===notificationFingerprint?'Destino confirmou recebimento em '+notificationHealth.at:'Configure e teste o destino; alertas locais ficam registrados no painel.'},
    {id:'licensing',label:'Licenças e condições comerciais revisadas',ok:false,detail:'Revisar oferta, principalmente n8n, antes de liberar acesso comercial.'},
    {id:'business',label:'Configuração e treinamento do cliente',ok:false,detail:'ERP, WhatsApp, redes sociais, permissões, contrato e treinamento precisam ser definidos por cliente.'},
    {id:'capacity',label:'Capacidade e disponibilidade homologadas',ok:false,detail:'Não há limite comercial de clientes aprovado. Testar no servidor definitivo.'}
  ];const profile=read(path.join(dir,'resource-profile.json'),null),resources=profile?.composeSha256===hash?{profile:profile.profile,verifiedAt:profile.at,detail:profile.settings}:{profile:t.resourceProfile||'padrao',verifiedAt:null,detail:'Nenhuma aplicacao de perfil confirmada para a configuracao atual.'};return {tenant:id,ready:items.every(i=>i.ok),items,resources,backup:backup?{at:backup.manifest.createdAt}:null,backupJob:job};
}
export class AlertStore{
  constructor({clock=()=>Date.now()}={}){this.lastAt=null;this.clock=clock;this.maintenance=new Map();}
  evaluate(snapshot){
    if(!snapshot.at||snapshot.at===this.lastAt)return;this.lastAt=snapshot.at;
    const file=path.join(RUNTIME,'alerts.json'),all=read(file,[]),observations=[],suppressed=new Set();
    for(const t of snapshot.tenants){
      const lock=path.join(tenantPath(t.id),'.operation.lock'),locked=fs.existsSync(lock);
      observations.push({tenant:t.id,key:'maintenance-stale',bad:locked&&this.clock()-fs.statSync(lock).mtimeMs>=6*3600000,label:'Operacao em manutencao ha mais de seis horas; conferir processos e trava'});
      if(locked&&this.clock()-fs.statSync(lock).mtimeMs<6*3600000){this.maintenance.set(t.id,this.clock()+300000);continue;}
      if(!locked&&(this.maintenance.get(t.id)||0)>this.clock())suppressed.add(t.id);
      for(const c of t.checks||[])observations.push({tenant:t.id,key:'probe:'+c.name,bad:c.state==='down'||c.state==='unsupported',label:'Verificação: '+c.name});
      for(const c of t.connectors||[])observations.push({tenant:t.id,key:'api:'+c.app,bad:c.state==='failed',label:'Conexão com '+c.app});
      for(const c of t.containers||[])observations.push({tenant:t.id,key:'container:'+c.name,bad:c.state==='failed'||c.state==='restarting',label:'Serviço: '+c.name});
      const events=read(path.join(tenantPath(t.id),'integration-events.private.json'),[]);
      observations.push({tenant:t.id,key:'queue-capacity',bad:events.length>=9000,label:'Fila de integracoes proxima do limite; revisar entregas e arquivamento'});
      observations.push({tenant:t.id,key:'deliveries',bad:events.some(e=>e.deliveries.some(d=>d.state==='failed')),label:'Há entregas de eventos que precisam de revisão'});
      const sources=read(path.join(tenantPath(t.id),'integration-sources.private.json'),{});
      const settings=read(path.join(tenantPath(t.id),'integrations.private.json'),{});
      observations.push({tenant:t.id,key:'source:chat',bad:settings.sources?.chatContacts===true&&!!sources.chat?.error,label:'Captura de contatos do Chatwoot'});
      observations.push({tenant:t.id,key:'backup-job',bad:read(path.join(RUNTIME,'backup-jobs',t.id+'.json'),{}).state==='error',label:'Rotina automatica de backup falhou'});
      const b=latestBackup(t.id);observations.push({tenant:t.id,key:'backup',bad:!b||Date.now()-Date.parse(b.manifest.createdAt)>36*3600000,label:'Backup ausente ou com mais de 36 horas'});
      observations.push({tenant:t.id,key:'docker',bad:!!snapshot.dockerError,label:'Consulta ao Docker indisponível'});
    }
    for(const o of observations){
      let entry=all.find(a=>a.tenant===o.tenant&&a.key===o.key&&!a.resolvedAt);
      if(o.bad){if(suppressed.has(o.tenant))continue;if(!entry){entry={id:crypto.randomUUID(),tenant:o.tenant,key:o.key,label:o.label,openedAt:snapshot.at,failures:0,state:'observing'};all.push(entry);}entry.failures++;entry.lastAt=snapshot.at;if(entry.failures>=2)entry.state='open';}
      else if(entry){entry.resolvedAt=snapshot.at;entry.state='resolved';}
    }
    atomicJSON(file,all.slice(-1000));
  }
  list(id){return read(path.join(RUNTIME,'alerts.json'),[]).filter(a=>a.tenant===id&&a.state!=='observing').slice(-100).reverse();}
}
export function saveJobHistory(jobs){atomicJSON(path.join(RUNTIME,'job-history.json'),jobs.slice(-100).map(({time,action,id,state})=>({time,action,id,state})));}
export function loadJobHistory(){return read(path.join(RUNTIME,'job-history.json'),[]).slice(-30).map(j=>j.state==='running'?{...j,state:'error',output:'A sessão anterior foi interrompida. Confira os serviços antes de repetir a operação.'}:j);}
