import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gatewayConfig } from '../service.mjs';

const project = 'cw-edge-lab-' + randomBytes(5).toString('hex');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), project + '-'));
const file = path.join(directory, 'compose.json');
const tenants = ['empresa-a', 'empresa-b'].map((id, index) => ({
  id, domain: id + '.test', project: project + '-' + id, sharedIngress: true, port: 18000 + index * 10
}));
const { compose, tenantFiles } = gatewayConfig(tenants, { linuxHost: true });
compose.name = project;
tenantFiles['Caddyfile.probe'] = 'http://:5678 {\n respond /healthz/readiness ready\n}\n';
for (const tenant of tenants) {
  compose.networks[tenant.id] = { internal: true };
  delete compose.services['gateway-' + tenant.id].ports;
  compose.services['probe-' + tenant.id] = {
    image: 'caddy:2.10.2', networks: { [tenant.id]: { aliases: [tenant.id + '-n8n'] } },
    volumes: ['./Caddyfile.probe:/etc/caddy/Caddyfile:ro']
  };
}
for (const [name, content] of Object.entries(tenantFiles)) fs.writeFileSync(path.join(directory, name), content);
fs.writeFileSync(file, JSON.stringify(compose));
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 30_000 }).trim();
const dc = (...args) => docker('compose', '-f', file, ...args);
try {
  dc('up', '-d', '--pull', 'never');
  for (const [index, tenant] of tenants.entries()) {
    const other = tenants[1 - index];
    const ownGateway = 'gateway-' + tenant.id;
    const ownHost = 'n8n.' + tenant.domain;
    const foreignHost = 'n8n.' + other.domain;
    const otherContainer = dc('ps', '-q', 'gateway-' + other.id);
    const foreignIP = docker('inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', otherContainer);
    assert.match(foreignIP, /^\d+\.\d+\.\d+\.\d+$/);
    const command = [
      'for attempt in 1 2 3 4 5 6 7 8 9 10; do',
      '  body=$(wget -qO- -T 2 --header "Host: $2" "http://$1/healthz/readiness") && break;',
      '  sleep 1;',
      'done;',
      'test "$body" = ready;',
      'for target in "$3 /healthz/readiness" "$2 /"; do',
      '  set -- "$1" $target "$4";',
      '  reply=$(wget -S -O /dev/null -T 2 --header "Host: $2" "http://$1$3" 2>&1) || true;',
      '  echo "$reply" | grep -q "HTTP/1.1 404";',
      'done;'
    ].join(' ');
    dc('exec', '-T', 'probe-' + tenant.id, 'sh', '-ec', command, 'lab', ownGateway, ownHost, foreignHost, foreignIP);
    dc('exec', '-T', 'probe-' + tenant.id, 'sh', '-ec',
      'reply=$(wget -S -O /dev/null -T 3 --header "Host: $2" "http://$1/healthz/readiness" 2>&1) && exit 1; echo "$reply" | grep -Ei "timed out|connection refused|no route to host|network unreachable"', 'lab', foreignIP, foreignHost);
    console.log(tenant.id + ': rota própria responde, domínio vizinho e editor retornam 404, TCP vizinho bloqueado.');
  }
} finally {
  dc('down', '--volumes');
  for (const name of [...Object.keys(tenantFiles), 'compose.json']) fs.unlinkSync(path.join(directory, name));
  fs.rmdirSync(directory);
}
