import fs from 'node:fs';
import path from 'node:path';

const privateEntry=name=>/\.private\.|^\.env(?:\.|$)|\.env$|\.(?:log|tmp)$/i.test(name)||['runtime','node_modules','.git','releases','private'].includes(name);
export function distributionFiles(root){
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'source-manifest.json'),'utf8'));
  if(!Array.isArray(manifest.entries)||!manifest.entries.length)throw Error('Manifesto de fontes invalido');
  const files=new Set();
  function walk(relative){
    if(typeof relative!=='string'||relative.startsWith('/')||relative.includes('\\')||relative.split('/').some(p=>!p||p==='.'||p==='..'||privateEntry(p)))throw Error('Caminho proibido no pacote');
    const full=path.join(root,relative),stat=fs.lstatSync(full);
    if(stat.isSymbolicLink())throw Error('Links simbolicos nao sao permitidos no pacote: '+relative);
    if(stat.isDirectory()){
      for(const name of fs.readdirSync(full).sort())if(!privateEntry(name))walk(relative+'/'+name);
    }else if(stat.isFile())files.add(relative);
    else throw Error('Entrada especial nao permitida: '+relative);
  }
  for(const entry of manifest.entries)walk(entry);
  return [...files].sort();
}
