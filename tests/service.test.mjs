import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
process.env.VW_RUNTIME_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'vlan-world-test-'));
const {tenantPath,RUNTIME}=await import('../infra.mjs');
const {onboard,gatewayConfig,allocatePort}=await import('../service.mjs');
test('empresas recebem pacote igual, credenciais isoladas e entrada HTTPS sem conflito',()=>{
  const a=onboard('empresa-a','example.com'),b=onboard('empresa-b','example.com');
  const load=(id,f)=>JSON.parse(fs.readFileSync(path.join(tenantPath(id),f)));
  const ca=load(a.id,'compose.json'),cb=load(b.id,'compose.json');
  assert.equal(a.plan,b.plan);assert.equal(a.serviceVersion,b.serviceVersion);assert.notEqual(a.port,b.port);
  assert.deepEqual(Object.keys(ca.services),Object.keys(cb.services));
  assert.equal(a.urls.erp,'https://erp.empresa-a.example.com');
  assert.notEqual(load(a.id,'secrets.json').cloud,load(b.id,'secrets.json').cloud);
  for(const name of Object.keys(ca.services)){
    assert.equal(ca.services[name].cpus,cb.services[name].cpus);
    assert.equal(ca.services[name].mem_limit,cb.services[name].mem_limit);
    assert.equal(ca.services[name].image,cb.services[name].image);
  }
  assert.deepEqual(ca.services.auth.networks.proxy.aliases,['empresa-a-auth']);
  assert.ok(ca.services.ingress.ports.every(p=>p.startsWith('127.0.0.1:')));
  const gateway=gatewayConfig([a,b]);
  assert.equal(Object.keys(gateway.compose.networks).length,2);
  assert.ok(Object.values(gateway.compose.networks).every(n=>n.external&&n.name.endsWith('_proxy')));
  assert.match(gateway.caddyfile,/reverse_proxy empresa-a-erp:8080/);
  assert.match(gateway.caddyfile,/reverse_proxy empresa-b-erp:8080/);
  assert.ok(!gateway.caddyfile.includes('5432'));
  const original=load(a.id,'secrets.json');assert.throws(()=>onboard(a.id,'example.com'));assert.deepEqual(load(a.id,'secrets.json'),original);
  assert.throws(()=>onboard('bad-domain','bad;command.com'));
  assert.throws(()=>onboard('../bad','example.com'));
  assert.equal(allocatePort([{port:8453},{port:8463}]),8473);
  for(const dir of [tenantPath(a.id),tenantPath(b.id),path.join(RUNTIME,'edge')]){
    const result=spawnSync('docker',['compose','--project-directory',dir,'-f',path.join(dir,'compose.json'),'config','--quiet'],{encoding:'utf8',windowsHide:true});
    assert.equal(result.status,0,result.stderr||result.error?.message);
  }
});
