import fs from 'node:fs';
import os from 'node:os';
// A second folder/drive on this host is not evidence of an off-host backup.
export function backupTargetEvidence(directory,{platform=process.platform,hostname=os.hostname(),statfs=fs.statfsSync,mounts=()=>fs.readFileSync('/proc/mounts','utf8')}={}){
  if(!directory)return {offHost:false,reason:'Destino externo nao configurado'};
  if(platform==='win32'){
    const host=directory.match(/^\\\\([^\\]+)\\[^\\]+/i)?.[1]?.toLowerCase();
    return {offHost:!!host&&!['localhost','127.0.0.1','::1',hostname.toLowerCase()].includes(host),reason:host?'Compartilhamento UNC; disponibilidade e recuperacao ainda devem ser verificadas':'Pasta local ou unidade mapeada sem origem externa comprovada'};
  }
  if(platform!=='linux')return {offHost:false,reason:'Origem externa nao comprovada nesta plataforma'};
  try{
    const type=Number(statfs(directory).type)>>>0;
    if(![0x6969,0xff534d42,0x517b].includes(type))return {offHost:false,reason:'O destino esta em um sistema de arquivos local'};
    const rows=mounts().trim().split('\n').map(l=>l.split(' ')).map(([source,target,kind])=>({source,target:target?.replace(/\\040/g,' '),kind}));
    const resolved=fs.realpathSync(directory),row=rows.filter(r=>resolved===r.target||resolved.startsWith(r.target+'/')).sort((a,b)=>b.target.length-a.target.length)[0];
    const host=row?.source.startsWith('//')?row.source.slice(2).split('/')[0]:row?.source.split(':')[0];
    const offHost=!!host&&['nfs','nfs4','cifs','smb3'].includes(row.kind)&&!['localhost','127.0.0.1','::1',hostname].includes(host.toLowerCase());
    return {offHost,reason:offHost?'Montagem de rede em outro host; exportacao e recuperacao precisam estar verificadas':'Servidor de origem da montagem nao confirmado'};
  }catch{return {offHost:false,reason:'Destino externo indisponivel ou sem origem verificavel'};}
}
