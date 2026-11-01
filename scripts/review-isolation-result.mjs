import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {RUNTIME} from '../infra.mjs';
import {atomicJSON} from '../integration.mjs';
// Preserve the first run: only replace its known loopback checks with actual TCP retests.
const dir=path.join(RUNTIME,'isolation-lab'),raw=JSON.parse(fs.readFileSync(path.join(dir,'result.json'))),tcp=JSON.parse(fs.readFileSync(path.join(dir,'database-checks.json')));
assert.equal(raw.phase,'complete');assert.equal(raw.originalResumed,true);assert.ok(raw.archived&&!raw.failure&&!raw.cleanupError);
assert.deepEqual(tcp.tenants,['piloto','validacao-b']);assert.equal(tcp.checks.length,7);assert.ok(tcp.checks.every(c=>c.ok));
assert.ok(Date.parse(tcp.at)>=Date.parse(raw.at)&&Date.parse(tcp.at)<=Date.parse(raw.finishedAt));
const replaced=[];
const checks=raw.checks.map(c=>{if(!c.ok){assert.match(c.name,/^(auth|chat|n8n|postiz|temporal|cloud)-db: senha de outra empresa recusada nos dois sentidos$/);assert.equal(c.error,'Expected "actual" to be strictly unequal to: 0');const corrected=tcp.checks.find(t=>t.name===c.name);assert.ok(corrected?.ok);replaced.push(c.name);return {...corrected,evidence:'database-checks.json'};}return {...c,evidence:'result.json'};});
assert.equal(replaced.length,6);assert.ok(checks.every(c=>c.ok));
const result={at:new Date().toISOString(),ok:true,checks,originalResumed:true,archived:raw.archived,scope:raw.scope,review:{original:'result.json',retest:'database-checks.json',superseded:replaced,reason:'A primeira tentativa usou loopback no container PostgreSQL, sujeito a trust. A repeticao autenticou pelo IP de rede Docker, com SCRAM, confirmando senha propria e rejeicao da estrangeira.'}};
atomicJSON(path.join(dir,'result.reviewed.json'),result);console.log(checks.length+' verificacoes aprovadas; tentativa inicial e repeticao TCP preservadas.');
