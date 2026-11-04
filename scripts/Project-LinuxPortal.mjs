import fs from 'node:fs';
import path from 'node:path';
import { RUNTIME } from '../infra.mjs';
import { createIdentityBroker, portalProjection, validTenant } from '../portal-isolation.mjs';

if (process.platform !== 'linux' || process.getuid() === 0) {
  throw Error('O projetor exige uma conta de serviço Linux sem root.');
}

const root = '/var/lib/cloudworld-portal';
const config = path.join(root, 'config');
const tenants = path.join(RUNTIME, 'tenants');

function refresh() {
  const ids = new Set();
  const entries = fs.existsSync(tenants) ? fs.readdirSync(tenants, { withFileTypes: true }) : [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-z][a-z0-9-]{1,30}$/.test(entry.name)) continue;
    const id = validTenant(entry.name);
    const destination = path.join(config, id + '.json');
    try {
      const value = portalProjection(id);
      const temp = destination + '.tmp';
      fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o640 });
      fs.chmodSync(temp, 0o640);
      fs.renameSync(temp, destination);
      ids.add(id);
    } catch {
      console.error('Projeção indisponível para ' + id);
    }
  }
  for (const file of fs.readdirSync(config)) {
    if (file.endsWith('.json') && !ids.has(file.slice(0, -5))) fs.unlinkSync(path.join(config, file));
  }
}

refresh();
const socket = path.join(root, 'identity.sock');
if (fs.existsSync(socket)) {
  if (!fs.lstatSync(socket).isSocket()) throw Error('Caminho inválido para o socket de identidade.');
  fs.unlinkSync(socket);
}
const broker = createIdentityBroker();
await new Promise((resolve, reject) => {
  broker.once('error', reject);
  broker.listen(socket, resolve);
});
fs.chmodSync(socket, 0o660);
setInterval(refresh, 2_000);
