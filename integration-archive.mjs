import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const filename=key=>crypto.createHash('sha256').update(key).digest('hex')+'.json';
const validName=name=>/^[a-f0-9]{64}\.json$/.test(name);
export const archiveDirectory=dir=>path.join(dir,'integration-archive.private');
const validate=record=>{
  const e=record?.event;
  if(record?.version!==1||!Number.isFinite(Date.parse(record.archivedAt))||typeof e?.key!=='string'||!e.key||e.key.length>160||typeof e.id!=='string'||!/^[a-f0-9]{64}$/.test(e.fingerprint||'')||!Array.isArray(e.deliveries)||!e.deliveries.length||!e.deliveries.every(d=>d.state==='delivered'))throw Error('Registro de arquivo invalido');
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify({type:e.type,payload:e.payload})).digest('hex');
  if(fingerprint!==e.fingerprint)throw Error('Conteudo do arquivo divergente');
  return record;
};
export class EventArchive{
  constructor(directory){this.directory=directory;}
  names(){
    if(!fs.existsSync(this.directory))return [];
    if(!fs.lstatSync(this.directory).isDirectory()||fs.lstatSync(this.directory).isSymbolicLink())throw Error('Diretorio de arquivo invalido');
    return fs.readdirSync(this.directory).filter(validName).sort();
  }
  readFile(name){
    if(!validName(name))throw Error('Nome de arquivo invalido');
    const file=path.join(this.directory,name),stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1048576)throw Error('Registro de arquivo invalido');
    const record=validate(JSON.parse(fs.readFileSync(file,'utf8')));
    if(filename(record.event.key)!==name)throw Error('Chave do arquivo divergente');
    return record;
  }
  find(key){
    if(fs.existsSync(this.directory)&&fs.lstatSync(this.directory).isSymbolicLink())throw Error('Diretorio de arquivo invalido');
    const name=filename(key);return fs.existsSync(path.join(this.directory,name))?this.readFile(name):null;
  }
  store(event,archivedAt){
    const record=validate({version:1,event,archivedAt}),existing=this.find(event.key);
    if(existing){if(existing.event.id!==event.id||existing.event.fingerprint!==event.fingerprint)throw Error('Conflito no arquivo de eventos');return existing;}
    fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
    if(fs.lstatSync(this.directory).isSymbolicLink())throw Error('Diretorio de arquivo invalido');
    const target=path.join(this.directory,filename(event.key)),temp=path.join(this.directory,crypto.randomUUID()+'.tmp');
    try{
      const fd=fs.openSync(temp,'wx',0o600);
      try{fs.writeFileSync(fd,JSON.stringify(record)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
      // Publish once. Never overwrite an archived idempotency record.
      try{fs.linkSync(temp,target);}catch(e){
        if(e.code!=='EEXIST')throw e;
        const current=this.find(event.key);
        if(current.event.id!==event.id||current.event.fingerprint!==event.fingerprint)throw Error('Conflito no arquivo de eventos');
      }
      if(process.platform!=='win32'){const fd=fs.openSync(this.directory,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
    }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
    return record;
  }
}

export async function writeArchiveBundle(tenantDir,destination){
  const archive=new EventArchive(archiveDirectory(tenantDir)),names=archive.names();
  if(!names.length)return 0;
  const tenant=JSON.parse(fs.readFileSync(path.join(tenantDir,'tenant.json'),'utf8')).id;
  async function* records(){
    yield JSON.stringify({version:1,kind:'cloudworld-event-archive',tenant})+'\n';
    for(const name of names)yield JSON.stringify(archive.readFile(name))+'\n';
  }
  await pipeline(Readable.from(records()),fs.createWriteStream(destination,{flags:'wx',mode:0o600}));
  return names.length;
}

export async function restoreArchiveBundle(source,tenantDir){
  const destination=archiveDirectory(tenantDir);
  if(fs.existsSync(destination))throw Error('O arquivo de destino ja existe');
  const tenant=JSON.parse(fs.readFileSync(path.join(tenantDir,'tenant.json'),'utf8')).id;
  const staging=fs.mkdtempSync(path.join(tenantDir,'.archive-restore-'));
  const archive=new EventArchive(staging),seen=new Set();let count=0,header=false;
  try{
    const input=fs.createReadStream(source,{encoding:'utf8'});let buffer='';
    const consume=line=>{
      if(Buffer.byteLength(line)>1048576)throw Error('Registro excedeu limite');
      const value=JSON.parse(line);
      if(!header){
        if(value.version!==1||value.kind!=='cloudworld-event-archive'||value.tenant!==tenant)throw Error('Arquivo pertence a outra empresa ou formato invalido');
        header=true;return;
      }
      const record=validate(value);if(seen.has(record.event.key))throw Error('Chave duplicada no arquivo');seen.add(record.event.key);
      archive.store(record.event,record.archivedAt);count++;
    };
    try{
      for await(const chunk of input){
        buffer+=chunk;let end;
        while((end=buffer.indexOf('\n'))!==-1){consume(buffer.slice(0,end));buffer=buffer.slice(end+1);}
        if(Buffer.byteLength(buffer)>1048576)throw Error('Registro excedeu limite');
      }
      if(buffer)consume(buffer);
    }finally{input.destroy();}
    if(!header)throw Error('Cabecalho do arquivo ausente');
    fs.renameSync(staging,destination);return count;
  }finally{if(fs.existsSync(staging))fs.rmSync(staging,{recursive:true});}
}
