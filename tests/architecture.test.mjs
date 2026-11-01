import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
process.env.VW_RUNTIME_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'vlan-world-test-'));
const {createTenant,tenantPath}=await import('../infra.mjs');
const id=`test-${Date.now()}`;
test('gerador isola clientes, credenciais, bancos e portas',()=>{
  const t=createTenant(id,`${id}.localhost`,12043);
  const c=JSON.parse(fs.readFileSync(path.join(tenantPath(id),'compose.json')));
  const secrets=JSON.parse(fs.readFileSync(path.join(tenantPath(id),'secrets.json')));
  assert.equal(new Set(Object.values(secrets)).size,Object.keys(secrets).length);
  for(const name of ['auth','chat','waha','n8n','postiz','postiz-db','postiz-redis','temporal','temporal-init','cloud','erp','ingress']) assert.ok(c.services[name],`${name} obrigatorio`);
  assert.equal(c.services.mixpost,undefined);
  assert.equal(c.services.temporal.environment.SKIP_ADD_CUSTOM_SEARCH_ATTRIBUTES,'true');
  assert.equal(c.services.temporal.environment.BIND_ON_IP,'0.0.0.0');
  assert.equal(c.services.postiz.depends_on['temporal-init'].condition,'service_completed_successfully');
  assert.ok(c.services['temporal-init'].command[0].includes('CustomTextField'));
  assert.ok(c.services.postiz.healthcheck.test[3].includes('3000/auth/can-register'));
  assert.ok(c.services.postiz.healthcheck.test[3].includes('3002/health/status'));
  for(const [name,s] of Object.entries(c.services)){
    if(!['ingress','waha','wireguard'].includes(name))assert.equal(s.ports,undefined,`${name} nao publica portas`);
    if(name.endsWith('-db')&&s.environment?.POSTGRES_DB)assert.deepEqual(s.networks,[name]);
    assert.ok(s.image.includes(':'));
    for(const dep of Object.keys(s.depends_on??{}))assert.ok(c.services[dep],`${name}: dependencia ${dep}`);
    for(const net of s.networks)assert.ok(c.networks[net]);
  }
  const another=createTenant(id+'b',`${id}b.localhost`,12053);
  const otherSecrets=JSON.parse(fs.readFileSync(path.join(tenantPath(another.id),'secrets.json')));
  assert.notEqual(t.project,another.project);assert.notEqual(secrets.auth,otherSecrets.auth);
  assert.throws(()=>createTenant(id));
  assert.throws(()=>tenantPath('../escape'));
  assert.throws(()=>tenantPath('Bad Id'));
  assert.throws(()=>createTenant('bad-domain','host;danger',8555));
});
