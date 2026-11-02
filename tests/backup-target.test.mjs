import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backupTargetEvidence} from '../backup-target.mjs';
test('pasta local, outro disco ou compartilhamento do proprio host nao comprovam backup externo',()=>{
  const opts={platform:'win32',hostname:'server'};
  for(const d of ['D:\\backup','C:\\other','\\\\localhost\\backup','\\\\server\\backup','\\\\127.0.0.1\\backup'])assert.equal(backupTargetEvidence(d,opts).offHost,false);
  assert.equal(backupTargetEvidence('\\\\nas\\backup',opts).offHost,true);
  assert.equal(backupTargetEvidence('/tmp',{platform:'linux',statfs:()=>({type:0xef53})}).offHost,false);
});
