import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { RUNTIME, writeJSON, tenantPath } from '../infra.mjs';
import { tenants } from '../service.mjs';
import { inspectHttpsTarget } from '../https-check.mjs';

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
  ['API administrativa n8n', tenant.urls.n8n + '/rest/settings', [404]],
  ['webhook de teste n8n', tenant.urls.n8n + '/webhook-test/cloudworld-check', [404]],
  ['disponibilidade n8n', tenant.urls.n8n + '/healthz/readiness', [200]]
];
const privatePaths = {
  auth: '/api/v3/core/users/me/',
  chat: '/api/v1/accounts/1/contacts',
  erp: '/api/resource/Customer',
  cloud: '/remote.php/dav/files/admin/',
  postiz: '/api/public/v1/integrations'
};
for (const [name, route] of Object.entries(privatePaths)) {
  targets.push(['dados privados ' + name, tenant.urls[name] + route, [401, 403]]);
}
for (const [name, url] of Object.entries(tenant.urls)) {
  if (name !== 'n8n') targets.push([name, url, [200, 301, 302, 303, 307, 308]]);
}

const checks = await Promise.all(targets.map(target => inspectHttpsTarget(target)));
const report = {
  tenant: id, at: new Date().toISOString(), ok: checks.every(check => check.ok), checks,
  hostname: os.hostname(), portalOrigin: portal.origin,
  composeSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(tenantPath(id),'compose.json'))).digest('hex'),
  tenantConfigSha256: crypto.createHash('sha256').update(JSON.stringify({domain:tenant.domain,urls:tenant.urls})).digest('hex')
};
const file = path.join(RUNTIME, 'reports', 'deployment-https-' + id + '.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
writeJSON(file, report);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 2;
