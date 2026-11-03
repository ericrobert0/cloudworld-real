import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { ROOT, RUNTIME, tenantPath, writeJSON } from '../infra.mjs';
import { assertPresentationTenant, codespacesIdentity } from '../codespaces.mjs';

const options = process.argv.slice(2);
const supported = ['--resume', '--live-integration'];
if (options.some(option => !supported.includes(option))) {
  throw Error('Uso: node scripts/Check-PresentationReady.mjs [--resume] [--live-integration]');
}

const remote = codespacesIdentity();
const id = 'apresentacao';
const tenant = JSON.parse(fs.readFileSync(path.join(tenantPath(id), 'tenant.json'), 'utf8'));
if (tenant.local) throw Error('Selecione a empresa remota de apresentacao.');
assertPresentationTenant(tenant);

const steps = {};
function run(script, args, timeout, quiet = false) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT, timeout, stdio: quiet ? 'ignore' : 'inherit'
  });
  return result.status === 0;
}

try {
  if (options.includes('--resume')) {
    steps.panelsStarted = run('scripts/Start-CodespacesPanels.mjs', [], 150_000);
    steps.servicesResumed = steps.panelsStarted && run('manage.mjs', ['resume', id], 1_250_000);
    if (!steps.servicesResumed) throw Error('Falha ao retomar o ambiente.');
  }

  const attempts = options.includes('--resume') ? 4 : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    console.log(`Verificando as aplicacoes (${attempt}/${attempts}).`);
    steps.services = run('manage.mjs', ['smoke', id], 360_000, true);
    if (steps.services) break;
    if (attempt < attempts) await delay(15_000);
  }
  if (!steps.services) console.log('Confira runtime/tenants/apresentacao/smoke-report.json.');

  steps.portal = run('scripts/Test-CodespacesPortal.mjs', [id], 90_000);
  if (options.includes('--live-integration') && steps.services && steps.portal) {
    steps.integration = run('scripts/test-platform-live.mjs', [id], 300_000);
  }
  steps.publicAccess = run('scripts/Test-CodespacesPublic.mjs', [], 200_000);
} finally {
  const internal = steps.services === true && steps.portal === true;
  const integrationOk = !options.includes('--live-integration') || steps.integration === true;
  const ready = internal && integrationOk && steps.publicAccess === true;
  const report = { at: new Date().toISOString(), tenant: id, codespace: remote.name, internal, ready, steps };
  const directory = path.join(RUNTIME, 'reports');
  fs.mkdirSync(directory, { recursive: true });
  writeJSON(path.join(directory, 'presentation-readiness.json'), report);
  console.log(`Servicos internos: ${internal ? 'OK' : 'PENDENTE'}. Acesso de convidados: ${steps.publicAccess ? 'OK' : 'PENDENTE'}.`);
  if (!ready) process.exitCode = 2;
}
