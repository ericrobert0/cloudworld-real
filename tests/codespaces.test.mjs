import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.VW_RUNTIME_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'cloudworld-codespaces-'));
const {codespacesIdentity,createCodespacesTenant,appPorts,assertPresentationTenant,codespacesGateway}=await import('../codespaces.mjs');
const {tenantPath}=await import('../infra.mjs');
const env={CODESPACES:'true',CODESPACE_NAME:'example-cloudworld-123456'};
test('adaptador remoto rejeita ambiente incorreto, dominio arbitrario e colisao entre empresas',()=>{
  assert.throws(()=>codespacesIdentity({}),/Codespace/);
  assert.throws(()=>codespacesIdentity({...env,GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'attacker.invalid'}),/Dominio/);
  const t=createCodespacesTenant('apresentacao',env),c=JSON.parse(fs.readFileSync(path.join(tenantPath(t.id),'compose.json')));
  assert.equal(t.local,false);assert.equal(t.runtime,'codespaces');
  assert.equal(t.domain,`${env.CODESPACE_NAME}-8100.app.github.dev`);
  assert.doesNotThrow(()=>assertPresentationTenant(t,env));
  assert.throws(()=>assertPresentationTenant({...t,codespace:'outro-codespace'},env),/restrita/);
  assert.throws(()=>assertPresentationTenant({...t,runtime:'production'},env),/restrita/);
  for(const [app,port] of Object.entries(appPorts)){
    assert.equal(t.urls[app],`https://${env.CODESPACE_NAME}-${port}.app.github.dev`);
    assert.equal(t.apiUrls[app],`http://127.0.0.1:${port}`);
    assert.ok(c.services.ingress.ports.includes(`127.0.0.1:${port}:${port}`));
  }
  assert.deepEqual(c.services.waha.profiles,['whatsapp']);
  assert.equal(c.services.chat.environment.FRONTEND_URL,t.urls.chat);
  assert.equal(c.services.cloud.environment.OVERWRITEHOST,new URL(t.urls.cloud).host);
  assert.equal(c.services.postiz.environment.NEXT_PUBLIC_BACKEND_URL,t.urls.postiz+'/api');
  const gateway=codespacesGateway(t.urls);
  assert.ok(gateway.includes('header_down Set-Cookie'));
  assert.ok(gateway.includes('Domain='+new URL(t.urls.postiz).hostname));
  assert.throws(()=>codespacesGateway({...t.urls,chat:'https://attacker.invalid'}),/Endereco/);
  assert.ok(Object.entries(c.services).filter(([n])=>n.endsWith('-db')).every(([,s])=>!s.ports));
  assert.throws(()=>createCodespacesTenant('outraempresa',env),/somente uma empresa/);
});
