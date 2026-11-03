import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {distributionFiles} from '../distribution.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('distribution includes all root modules and every relative module dependency',()=>{
  const files=distributionFiles(root),included=new Set(files);
  for(const file of fs.readdirSync(root).filter(name=>name.endsWith('.mjs')))assert.ok(included.has(file),'Missing module: '+file);
  for(const file of files.filter(name=>name.endsWith('.mjs'))){
    const code=fs.readFileSync(path.join(root,file),'utf8');
    for(const match of code.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)){
      const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1]));
      assert.ok(included.has(target),file+' imports missing '+target);
    }
  }
  for(const required of ['public/panel-login.html','scripts/Configure-Podman.mjs','.github/workflows/ci.yml'])assert.ok(included.has(required));
});

test('distribution excludes private data and rejects path traversal and symlinks',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cw-distribution-'));
  const manifest=entries=>fs.writeFileSync(path.join(temp,'source-manifest.json'),JSON.stringify({entries}));
  try{
    fs.mkdirSync(path.join(temp,'public'));
    for(const name of ['index.html','users.private.json','.env','server.log'])fs.writeFileSync(path.join(temp,'public',name),'test');
    fs.mkdirSync(path.join(temp,'public','runtime'));fs.writeFileSync(path.join(temp,'public','runtime','secret.txt'),'secret');
    manifest(['public']);assert.deepEqual(distributionFiles(temp),['public/index.html']);
    manifest(['../outside']);assert.throws(()=>distributionFiles(temp),/proibido/);
    manifest(['runtime']);assert.throws(()=>distributionFiles(temp),/proibido/);
    if(process.platform!=='win32'){
      fs.symlinkSync(path.join(temp,'public','index.html'),path.join(temp,'public','link.html'));
      manifest(['public']);assert.throws(()=>distributionFiles(temp),/simbolicos/);
    }
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
