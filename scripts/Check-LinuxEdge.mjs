import http from 'node:http';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { RUNTIME } from '../infra.mjs';
import { tenants } from '../service.mjs';

const ids = process.argv.slice(2);
if (ids.length !== 2 || ids[0] === ids[1]) {
  throw Error('Uso: node scripts/Check-LinuxEdge.mjs EMPRESA_A EMPRESA_B');
}

const available = tenants();
const selected = ids.map(id => available.find(tenant => tenant.id === id && tenant.sharedIngress));
if (selected.some(tenant => !tenant)) throw Error('Informe duas empresas com entrada compartilhada.');
const composeFile = path.join(RUNTIME, 'edge', 'compose.json');
const gateways = new Map();

function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8', timeout: 10_000 }).trim();
}

function status(port, hostname, route) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path: route, headers: { Host: hostname } }, response => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on('error', reject);
    request.setTimeout(5000, () => request.destroy(Error('Gateway sem resposta')));
  });
}

for (const tenant of selected) {
  const container = docker(['compose', '-f', composeFile, 'ps', '-q', 'gateway-' + tenant.id]);
  if (!/^[a-f0-9]{12,64}$/.test(container)) throw Error('Gateway ausente para ' + tenant.id);
  const networks = JSON.parse(docker(['inspect', '--format', '{{json .NetworkSettings.Networks}}', container]));
  const network = networks[tenant.project + '_proxy'];
  if (Object.keys(networks).length !== 1 || !network?.IPAddress) {
    throw Error('Rede inesperada no gateway de ' + tenant.id);
  }
  gateways.set(tenant.id, network.IPAddress);
}

for (const [index, tenant] of selected.entries()) {
  const other = selected[1 - index];
  const port = tenant.port + 1;
  const ownHost = 'n8n.' + tenant.domain;
  const foreignHost = 'n8n.' + other.domain;
  const checks = [
    ['disponibilidade da própria empresa', ownHost, '/healthz/readiness', 200],
    ['rota da outra empresa', foreignHost, '/healthz/readiness', 404],
    ['editor n8n', ownHost, '/', 404]
  ];
  for (const [label, hostname, route, expected] of checks) {
    const actual = await status(port, hostname, route);
    if (actual !== expected) throw Error(`${tenant.id} / ${label}: HTTP ${actual}, esperado ${expected}`);
  }
  const probe = `
    const http = require('node:http');
    const [own, foreign, ownHost, foreignHost] = process.argv.slice(1);
    function check(host, hostname) {
      return new Promise(resolve => {
        const req = http.get({host, port:80, path:'/healthz/readiness', headers:{Host:hostname}}, res => {
          res.resume();
          resolve(res.statusCode);
        });
        req.on('error', error => resolve(error.code));
        req.setTimeout(2500, () => req.destroy(Object.assign(Error('timeout'), {code:'ETIMEDOUT'})));
      });
    }
    (async () => {
      if (await check(own, ownHost) !== 200 || await check(own, foreignHost) !== 404) process.exitCode = 1;
      const cross = await check(foreign, foreignHost);
      if (!['ETIMEDOUT','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH'].includes(cross)) process.exitCode = 1;
    })();
  `;
  docker(['compose', '-f', path.join(RUNTIME, 'tenants', tenant.id, 'compose.json'), 'exec', '-T',
    'n8n', 'node', '-e', probe, gateways.get(tenant.id), gateways.get(other.id), ownHost, foreignHost]);
  console.log(tenant.id + ' | rede e rotas verificadas a partir do host e do container');
}
