import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {exportBackup,importBackup,verifyExport} from '../backup-store.mjs';
test('restauracao recusa troca de empresa/data, duplicatas e corrupcao sem publicar dados parciais',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cw-backup-binding-')),source=path.join(root,'source'),encrypted=path.join(root,'encrypted'),key=crypto.randomBytes(32);
  fs.mkdirSync(source);const data='registro da empresa alpha';fs.writeFileSync(path.join(source,'data.sql'),data);
  fs.writeFileSync(path.join(source,'manifest.json'),JSON.stringify({client:'alpha',createdAt:new Date().toISOString(),hashes:{'data.sql':crypto.createHash('sha256').update(data).digest('hex')}}));
  await exportBackup(source,encrypted,key);const original=JSON.parse(fs.readFileSync(path.join(encrypted,'index.json')));
  let n=0;for(const alter of [x=>x.client='bravo',x=>x.createdAt='wrong',x=>x.files.push({...x.files[0]})]){
    const index=structuredClone(original);alter(index);fs.writeFileSync(path.join(encrypted,'index.json'),JSON.stringify(index));const dest=path.join(root,'reject-'+n++);
    await assert.rejects(()=>importBackup(encrypted,dest,key));assert.equal(fs.existsSync(dest),false);await assert.rejects(()=>verifyExport(encrypted,key));
  }
  fs.writeFileSync(path.join(encrypted,'index.json'),JSON.stringify(original));
  const file=path.join(encrypted,original.files.at(-1).encrypted),bytes=fs.readFileSync(file);bytes[20]^=1;fs.writeFileSync(file,bytes);
  const dest=path.join(root,'corrupt');await assert.rejects(()=>importBackup(encrypted,dest,key));assert.equal(fs.existsSync(dest),false);assert.ok(!fs.readdirSync(root).some(n=>n.startsWith('.cw-restore-')));
});
