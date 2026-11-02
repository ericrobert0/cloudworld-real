import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ROOT,RUNTIME} from '../infra.mjs';
import {codespacesIdentity} from '../codespaces.mjs';
export const portalUid=61001,portalGid=61001;
export const portalRoot=path.join(ROOT,'.portal-service');
const sudo=(...args)=>execFileSync('sudo',['-n',...args],{encoding:'utf8',timeout:10000});
function hardenSourceTree(dir=ROOT){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(dir===ROOT&&['runtime','.portal-service','.git'].includes(entry.name))continue;
    const file=path.join(dir,entry.name),stat=fs.lstatSync(file);if(stat.isSymbolicLink())continue;
    if(file===path.join(ROOT,'reports','private')||dir===ROOT&&entry.name==='releases'){
      fs.chmodSync(file,0o700);continue;
    }
    fs.chmodSync(file,stat.mode&0o7777&~0o022);
    if(stat.isDirectory())hardenSourceTree(file);
    else if(/\.(env|gz|zip|tar)$/.test(entry.name))fs.chmodSync(file,0o600);
  }
}
export function preparePortalIdentity(){
  codespacesIdentity();if(process.platform!=='linux'||process.getuid()===0)throw Error('Identidade requer Codespaces Linux com operador sem root.');
  if(fs.existsSync(portalRoot)&&fs.lstatSync(portalRoot).isSymbolicLink())throw Error('Diretorio do portal nao pode ser link.');
  // Reserve a numeric service UID that does not belong to an existing account.
  const passwd=fs.readFileSync('/etc/passwd','utf8');if(passwd.split('\n').some(l=>l.split(':')[2]===String(portalUid)))throw Error('UID reservado ja pertence a uma conta.');
  fs.chmodSync(ROOT,0o755);hardenSourceTree();
  const parent=path.dirname(ROOT),parentMode=fs.statSync(parent).mode;
  if(parentMode&0o002&&!(parentMode&0o1000))sudo('chmod','+t',parent);
  for(const d of [portalRoot,path.join(portalRoot,'config'),path.join(portalRoot,'sessions')]){
    fs.mkdirSync(d,{recursive:true,mode:0o750});sudo('chown',process.getuid()+':'+portalGid,d);sudo('chmod','2750',d);
  }
  // Keep operator credentials and home (including GitHub/editor tokens) private.
  fs.chmodSync(RUNTIME,0o700);fs.chmodSync(process.env.HOME,0o700);
  const git=path.join(ROOT,'.git');if(fs.existsSync(git)&&fs.lstatSync(git).isDirectory())fs.chmodSync(git,0o700);
  return portalRoot;
}
export function prepareSessionDirectory(id,accounts){
  const dir=path.join(portalRoot,'sessions',id);
  if(fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink())throw Error('Diretorio de sessoes invalido.');
  if(!fs.existsSync(dir)){
    fs.mkdirSync(dir,{mode:0o700});
    // Preserve existing sessions once; never reimport a session after logout.
    const previous=accounts.file(id,'portal-sessions.private.json');
    if(fs.existsSync(previous))fs.copyFileSync(previous,path.join(dir,'portal-sessions.private.json'));
    sudo('chown','-R',portalUid+':'+portalGid,dir);
    // Backups retain accounts, but never an obsolete copy of an active session.
    fs.writeFileSync(previous,'[]\n',{mode:0o600});
  }
}
export function publishProjection(id,value){
  const dest=path.join(portalRoot,'config',id+'.json'),tmp=dest+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value),{mode:0o640});fs.chmodSync(tmp,0o640);fs.renameSync(tmp,dest);
}
export function portalNamespaceArgs(origin,proxyHost,command=[process.execPath,'--max-old-space-size=128',path.join(ROOT,'scripts','Serve-IsolatedPortal.mjs')]){
  return ['--mount','--pid','--fork','--mount-proc','--','setpriv','--reuid='+portalUid,'--regid='+portalGid,'--clear-groups','--inh-caps=-all','--bounding-set=-all','--no-new-privs',
    'env','-i','PATH=/usr/local/bin:/usr/bin:/bin','HOME=/nonexistent','NODE_ENV=production',
    'CW_ISOLATED_PORTAL_ROOT='+portalRoot,'CW_PORTAL_ORIGIN='+origin,'CW_PORTAL_PROXY_HOST='+proxyHost,
    ...command];
}
export function portalCommand(origin,proxyHost){
  return ['-n',process.execPath,path.join(ROOT,'scripts','Launch-PortalNamespace.mjs'),origin,proxyHost];
}
