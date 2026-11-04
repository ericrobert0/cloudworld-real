import fs from 'node:fs';
import path from 'node:path';
import { RUNTIME, writeJSON } from '../infra.mjs';
import { tenants } from '../service.mjs';

const [id, portalUrl] = process.argv.slice(2);
const tenant = tenants().find(tenant => tenant.id === id && tenant.sharedIngress);
if (!tenant || !portalUrl) throw Error('Uso: node scripts/Check-DeploymentHttps.mjs EMPRESA https://portal.dominio');
const portal = new URL(portalUrl);
if (portal.protocol !== 'https:' || portal.origin !== portalUrl) throw Error('Informe somente a origem HTTPS do portal.');

const targets = [
  ['portal', portal.origin, [200]],
  ['sessão do portal sem credencial', portal.origin + '/api/me', [401]],
  ['API administrativa no portal', portal.origin + '/api/v1/tenants/' + id + '/status', [404]],
  ['editor n8n público', tenant.urls.n8n + '/', [404]],
  ['disponibilidade n8n', tenant.urls.n8n + '/healthz/readiness', [200]]
];
for (const [name, url] of Object.entries(tenant.urls)) {
  if (name !== 'n8n') targets.push([name, url, [200, 301, 302, 303, 307, 308]]);
}

const checks = await Promise.all(targets.map(async ([name, url, expected]) => {
  try {
    if (new URL(url).protocol !== 'https:') throw Error('HTTPS obrigatório');
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    await response.body?.cancel();
    return { name, status: response.status, expected, ok: expected.includes(response.status) };
  } catch (error) {
    return { name, ok: false, error: error.cause?.code || error.name };
  }
}));
const report = { tenant: id, at: new Date().toISOString(), ok: checks.every(check => check.ok), checks };
const file = path.join(RUNTIME, 'reports', 'deployment-https-' + id + '.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
writeJSON(file, report);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 2;
