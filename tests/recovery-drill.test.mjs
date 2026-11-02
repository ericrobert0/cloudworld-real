import {test} from 'node:test';
import assert from 'node:assert/strict';
import {databaseDrillPlan} from '../recovery-drill.mjs';
const image='postgres:17@sha256:'+'a'.repeat(64),project='vw-restore-12345678';
test('ensaio recusa imagem mutavel, projeto do cliente e identificadores SQL arbitrarios',()=>{
  const s={image,environment:{POSTGRES_USER:'app',POSTGRES_DB:'app',POSTGRES_PASSWORD:'original'}};
  assert.throws(()=>databaseDrillPlan(s,{project:'vw-apresentacao'}));assert.throws(()=>databaseDrillPlan({...s,image:'postgres:17'},{project}));
  assert.throws(()=>databaseDrillPlan({...s,environment:{...s.environment,POSTGRES_DB:'app;DROP DATABASE other'}},{project}));
});
test('copias nao herdam montagens, portas, redes, comandos ou privilegios do original',()=>{
  const s={image,environment:{POSTGRES_USER:'app',POSTGRES_DB:'app',POSTGRES_PASSWORD:'original'},privileged:true,ports:['5432:5432'],volumes:['/var/run/docker.sock:/var/run/docker.sock'],networks:['production'],command:['danger']};
  const before=structuredClone(s),plan=databaseDrillPlan(s,{project});assert.deepEqual(s,before);
  const [a,b]=Object.values(plan.compose.services);for(const x of [a,b]){assert.equal(x.privileged,undefined);assert.equal(x.ports,undefined);assert.equal(x.command,undefined);assert.ok(x.volumes.every(v=>v.startsWith('data-')));assert.equal(x.mem_limit,'512m');}
  assert.notEqual(a.environment.POSTGRES_PASSWORD,b.environment.POSTGRES_PASSWORD);assert.notEqual(b.environment.POSTGRES_PASSWORD,s.environment.POSTGRES_PASSWORD);assert.notDeepEqual(a.networks,b.networks);assert.ok(Object.values(plan.compose.networks).every(n=>n.internal));
});
