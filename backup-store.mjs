import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable,Writable} from 'node:stream';
import {atomicJSON} from './integration.mjs';
const hash=async file=>{const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');};
const safeName=file=>typeof file==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(file);
function validateIndex(index,key){
  if(index.version!==1||!Array.isArray(index.files)||!index.files.length||index.files.length>1000)throw Error('Indice invalido');
  const names=new Set();
  for(const e of index.files){if(!safeName(e.file)||e.encrypted!==e.file+'.enc'||!/^[a-f0-9]{64}$/.test(e.sha256||'')||names.has(e.file))throw Error('Arquivo duplicado ou invalido no indice');names.add(e.file);}
  if(!names.has('manifest.json'))throw Error('Manifesto ausente no indice');
  if(index.keyId!==crypto.createHash('sha256').update(key).digest('hex').slice(0,16))throw Error('Chave nao corresponde a esta copia');
}
function matchManifest(index,manifest){
  if(manifest.client!==index.client||manifest.createdAt!==index.createdAt)throw Error('Identificacao do backup divergente');
  const expected=new Set([...Object.keys(manifest.hashes),'manifest.json']);
  if(expected.size!==index.files.length||index.files.some(e=>!expected.has(e.file)))throw Error('Arquivos do indice divergem do manifesto');
}
export function loadBackupKey(file){
  if(!fs.existsSync(file)){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,crypto.randomBytes(32).toString('base64')+'\n',{mode:0o600,flag:'wx'});}
  const key=Buffer.from(fs.readFileSync(file,'utf8').trim(),'base64');if(key.length!==32)throw Error('Chave de backup inválida');return key;
}
export async function verifyBackup(source){
  const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
  if(!manifest.client||!manifest.hashes||!Object.keys(manifest.hashes).length)throw Error('Manifesto incompleto');
  for(const [file,expected] of Object.entries(manifest.hashes)){
    if(!safeName(file)||!fs.lstatSync(path.join(source,file)).isFile())throw Error('Arquivo inválido no backup');
    if(await hash(path.join(source,file))!==expected)throw Error('Integridade inválida: '+file);
  }return manifest;
}
export async function exportBackup(source,destination,key){
  const manifest=await verifyBackup(source),dest=path.resolve(destination),resolved=path.resolve(source);
  if(dest===resolved||dest.startsWith(resolved+path.sep))throw Error('Destino deve ficar fora do backup de origem');
  if(fs.existsSync(dest))throw Error('Destino já existe; não será sobrescrito');
  fs.mkdirSync(dest,{recursive:true});
  const entries=[];
  for(const file of [...Object.keys(manifest.hashes),'manifest.json']){
    const input=path.join(source,file),name=file+'.enc',output=path.join(dest,name),partial=output+'.partial',iv=crypto.randomBytes(12);
    const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(file));
    fs.writeFileSync(partial,Buffer.concat([Buffer.from('CWB1'),iv]),{mode:0o600,flag:'wx'});
    await pipeline(fs.createReadStream(input),cipher,fs.createWriteStream(partial,{flags:'a'}));fs.appendFileSync(partial,cipher.getAuthTag());fs.renameSync(partial,output);
    entries.push({file,encrypted:name,sha256:await hash(output)});
  }
  atomicJSON(path.join(dest,'index.json'),{version:1,client:manifest.client,createdAt:manifest.createdAt,keyId:crypto.createHash('sha256').update(key).digest('hex').slice(0,16),files:entries});
  return {ok:true,client:manifest.client,at:new Date().toISOString(),files:entries.length,keyId:crypto.createHash('sha256').update(key).digest('hex').slice(0,16)};
}
export async function importBackup(source,destination,key){
  const index=JSON.parse(fs.readFileSync(path.join(source,'index.json'),'utf8'));
  validateIndex(index,key);
  destination=path.resolve(destination);if(fs.existsSync(destination))throw Error('Destino já existe; não será sobrescrito');
  const parent=path.dirname(destination);fs.mkdirSync(parent,{recursive:true,mode:0o700});
  const staging=fs.mkdtempSync(path.join(parent,'.cw-restore-'));fs.chmodSync(staging,0o700);
  try{
  for(const e of index.files){
    if(!safeName(e.file)||e.encrypted!==e.file+'.enc')throw Error('Nome de arquivo inválido');
    const input=path.join(source,e.encrypted),stat=fs.lstatSync(input),size=stat.size;if(!stat.isFile()||size<32||await hash(input)!==e.sha256)throw Error('Cópia criptografada corrompida');
    const fd=fs.openSync(input,'r'),header=Buffer.alloc(16),tag=Buffer.alloc(16);try{fs.readSync(fd,header,0,16,0);fs.readSync(fd,tag,0,16,size-16);}finally{fs.closeSync(fd);}
    if(header.subarray(0,4).toString()!=='CWB1')throw Error('Formato inválido');
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,header.subarray(4));decipher.setAAD(Buffer.from(e.file));decipher.setAuthTag(tag);
    const partial=path.join(staging,e.file+'.partial');
    // The final filename is published only after GCM verifies authenticity.
    await pipeline(size===32?Readable.from([]):fs.createReadStream(input,{start:16,end:size-17}),decipher,fs.createWriteStream(partial,{flags:'wx',mode:0o600}));fs.renameSync(partial,path.join(staging,e.file));
  }
  const manifest=await verifyBackup(staging);matchManifest(index,manifest);
  if(fs.existsSync(destination))throw Error('Destino ja existe; nao sera sobrescrito');
  fs.renameSync(staging,destination);return {ok:true,client:manifest.client};
  }finally{
    // This private staging directory was created above, never supplied by a caller.
    if(path.dirname(staging)!==parent||!path.basename(staging).startsWith('.cw-restore-'))throw Error('Diretorio temporario inesperado');
    if(fs.existsSync(staging)){if(fs.lstatSync(staging).isSymbolicLink())throw Error('Diretorio temporario substituido');fs.rmSync(staging,{recursive:true});}
  }
}
export async function verifyExport(source,key){
  const index=JSON.parse(fs.readFileSync(path.join(source,'index.json'),'utf8'));
  validateIndex(index,key);
  const actual={},manifestChunks=[];let manifestBytes=0;
  for(const e of index.files){
    if(!safeName(e.file)||e.encrypted!==e.file+'.enc'||Object.hasOwn(actual,e.file))throw Error('Nome de arquivo inválido');
    const input=path.join(source,e.encrypted),stat=fs.lstatSync(input),size=stat.size;if(!stat.isFile()||size<32||await hash(input)!==e.sha256)throw Error('Cópia criptografada corrompida');
    const fd=fs.openSync(input,'r'),header=Buffer.alloc(16),tag=Buffer.alloc(16);try{fs.readSync(fd,header,0,16,0);fs.readSync(fd,tag,0,16,size-16);}finally{fs.closeSync(fd);}
    if(header.subarray(0,4).toString()!=='CWB1')throw Error('Formato inválido');
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,header.subarray(4));decipher.setAAD(Buffer.from(e.file));decipher.setAuthTag(tag);const sum=crypto.createHash('sha256');
    const sink=new Writable({write(chunk,_encoding,done){sum.update(chunk);if(e.file==='manifest.json'){manifestBytes+=chunk.length;if(manifestBytes>1048576){done(Error('Manifesto excedeu limite'));return;}manifestChunks.push(chunk);}done();}});
    await pipeline(size===32?Readable.from([]):fs.createReadStream(input,{start:16,end:size-17}),decipher,sink);actual[e.file]=sum.digest('hex');
  }
  const manifest=JSON.parse(Buffer.concat(manifestChunks).toString());matchManifest(index,manifest);
  for(const [name,expected] of Object.entries(manifest.hashes))if(actual[name]!==expected)throw Error('Integridade interna divergente');
  return {ok:true,client:index.client,at:new Date().toISOString(),files:index.files.length,keyId:crypto.createHash('sha256').update(key).digest('hex').slice(0,16)};
}
