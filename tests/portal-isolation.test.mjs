import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
process.env.VW_RUNTIME_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'cw-isolated-'));
const {createTenant}=await import('../infra.mjs');
const {PortalAccounts}=await import('../portal.mjs');
const {portalProjection,IsolatedPortalAccounts,createIdentityBroker}=await import('../portal-isolation.mjs');
createTenant('alpha');
const owner=new PortalAccounts(),user=await owner.save('alpha',{username:'cliente',name:'Cliente'});
const root=path.join(process.env.VW_RUNTIME_DIR,'isolated');
fs.mkdirSync(path.join(root,'config'),{recursive:true});fs.mkdirSync(path.join(root,'sessions','alpha'),{recursive:true});
const publish=()=>fs.writeFileSync(path.join(root,'config','alpha.json'),JSON.stringify(portalProjection('alpha',owner)));
publish();const isolated=new IsolatedPortalAccounts(root);
test('projecao contem apenas acesso do portal e nunca credenciais administrativas ou de conectores',()=>{
  const p=portalProjection('alpha',owner);assert.deepEqual(Object.keys(p).sort(),['at','maintenance','oidc','tenant','users']);
  assert.deepEqual(Object.keys(p.tenant).sort(),['id','urls']);assert.equal(p.users[0].hash,owner.users('alpha')[0].hash);
  for(const name of ['tenant.json','integrations.private.json','secrets.json','../panel-password.txt'])assert.throws(()=>isolated.file('alpha',name),{status:403});
  for(const id of ['../alpha','alpha/../bravo','',null])assert.throws(()=>isolated.users(id),{status:404});
});
test('mesma senha e hash funcionam com sessoes separadas; logout nao restaura sessao antiga',async()=>{
  const token=await isolated.login('alpha',user.username,user.initialPassword);assert.equal(isolated.authenticate(token).tenant,'alpha');
  assert.equal(owner.sessions('alpha').length,0);isolated.logout(token);assert.throws(()=>isolated.authenticate(token),{status:401});
  await assert.rejects(()=>isolated.save('alpha',{id:user.id,enabled:true}),{status:403});
});
test('suspensao administrativa invalida sessao assim que a projecao e atualizada',async()=>{
  const token=await isolated.login('alpha',user.username,user.initialPassword);
  await owner.save('alpha',{id:user.id,enabled:false});publish();assert.throws(()=>isolated.authenticate(token),{status:401});
});
test('projecao expirada ou ausente bloqueia acesso sem recorrer aos arquivos do operador',()=>{
  const p=portalProjection('alpha',owner);p.at=Date.now()-16000;fs.writeFileSync(path.join(root,'config','alpha.json'),JSON.stringify(p));
  assert.throws(()=>isolated.users('alpha'),{status:503});fs.unlinkSync(path.join(root,'config','alpha.json'));assert.throws(()=>isolated.users('alpha'));publish();
});
test('broker recusa caminhos arbitrarios, usuario suspenso e identidade nao vinculada sem devolver dados',async()=>{
  const broker=createIdentityBroker(owner);await new Promise(r=>broker.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+broker.address().port;
  try{
    assert.equal((await fetch(url+'/secrets')).status,404);
    for(const body of [{tenant:'../alpha'},{tenant:'alpha',userId:user.id,version:2},{tenant:'alpha',userId:'unknown'}]){
      const r=await fetch(url+'/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.ok([403,503].includes(r.status));assert.equal(await r.text(),'');
    }
  }finally{await new Promise(r=>broker.close(r));}
});
