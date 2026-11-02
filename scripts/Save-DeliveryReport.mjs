import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT,RUNTIME,tenantPath,writeJSON} from '../infra.mjs';
import {latestBackup,readiness} from '../operations.mjs';
const id='apresentacao',read=file=>JSON.parse(fs.readFileSync(file));
const reportDir=path.join(RUNTIME,'reports'),get=name=>read(path.join(reportDir,name+'.json'));
const latest=latestBackup(id);assert.ok(latest);
const restored=fs.readdirSync(path.join(RUNTIME,'restore-tests')).map(d=>path.join(RUNTIME,'restore-tests',d,'result.json')).filter(f=>fs.existsSync(f)).map(read).filter(r=>r.ok&&r.phase==='complete'&&r.temporaryResourcesRemoved&&r.source===latest.dir).sort((a,b)=>Date.parse(b.finishedAt)-Date.parse(a.finishedAt))[0];assert.ok(restored,'Recuperacao do ultimo backup nao aprovada');
const summary=r=>{const rows=Array.isArray(r.checks)?r.checks.map(({name,ok})=>({name,ok})):Object.entries(r.checks).map(([name,ok])=>({name,ok}));assert.ok(rows.length&&rows.every(r=>r.ok),'Verificacao real pendente');return {at:r.at,passed:rows.length,total:rows.length,checks:rows};};
const tap=fs.readFileSync(path.join(reportDir,'unit-tests.tap'),'utf8'),number=key=>Number(tap.match(new RegExp('^# '+key+' (\\d+)$','m'))?.[1]);
const code={at:fs.statSync(path.join(reportDir,'unit-tests.tap')).mtime.toISOString(),total:number('tests'),passed:number('pass'),failed:number('fail')};assert.ok(code.total>0&&code.passed===code.total&&code.failed===0);
const gate=readiness(id),audit=get('npm-audit.private'),exported=read(path.join(RUNTIME,'offsite-export','export.json'));
const report={at:new Date().toISOString(),tenant:id,code,recovery:{...summary(restored),backupAt:restored.backupAt,temporaryResourcesRemoved:true,scope:restored.scope},services:summary(read(path.join(tenantPath(id),'smoke-report.json'))),portal:summary(get('codespaces-portal-live')),https:summary(get('codespaces-public-http')),integration:summary(get('platform-live-test')),portalIdentity:summary(get('portal-identity')),restart:summary(get('portal-restart')),
  dependencyAudit:{at:fs.statSync(path.join(reportDir,'npm-audit.private.json')).mtime.toISOString(),vulnerabilities:audit.metadata?.vulnerabilities,scope:'Somente dependencias npm de producao do painel; nao certifica imagens Docker ou seguranca completa.'},
  export:{file:exported.file,bytes:exported.bytes,sha256:exported.sha256,backupAt:exported.backupAt,offHostVerified:false,transfer:'nao confirmada; tentativa no navegador integrado cancelada; pacote privado preservado no Codespaces',keyStoredSeparately:false},
  commercial:{ready:gate.ready,items:gate.items},scope:'Evidencias de homologacao em uma empresa de apresentacao. Nao aprova operacao comercial continua, MFA, canais externos ou duas empresas completas no servidor de destino.'};
writeJSON(path.join(ROOT,'reports','recovery-and-delivery.json'),report);
for(const name of ['code','recovery','services','portal','https','integration','portalIdentity','restart'])console.log(name+': '+report[name].passed+'/'+report[name].total+' aprovados');
console.log('Oferta comercial: '+(gate.ready?'criterios atendidos':'PENDENTE'));
