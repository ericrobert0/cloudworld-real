import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ROOT,RUNTIME,tenantPath,writeJSON} from '../infra.mjs';
import {codespacesIdentity} from '../codespaces.mjs';
import {requestApp} from '../integration.mjs';
const remote=codespacesIdentity(),origin=remote.url(8100),dir=tenantPath('apresentacao');
const credentials=JSON.parse(fs.readFileSync(path.join(dir,'portal-initial.private.json')));
const request=(route,options={})=>requestApp('http://127.0.0.1:8100'+route,{...options,headers:{Host:new URL(origin).host,...options.headers}});
const checks={};let cookie;
const daemon=()=>execFileSync('pgrep',['-x','dockerd'],{encoding:'utf8'}).trim();
const daemonBefore=daemon(),usersBefore=fs.readFileSync(path.join(dir,'portal-users.private.json'),'utf8');
try{
  const login=await request('/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:{tenant:'apresentacao',username:credentials.username,password:credentials.password}});
  if(login.status!==200)throw Error('Login previo ao reinicio falhou.');
  cookie=login.headers['set-cookie']?.[0]?.split(';')[0];if(!cookie)throw Error('Sessao previa ausente.');
  const pid=JSON.parse(fs.readFileSync(path.join(RUNTIME,'codespaces-panels.pid.json'))).pid;
  const args=fs.readFileSync('/proc/'+pid+'/cmdline','utf8').split('\0');
  if(args[1]!==path.join(ROOT,'scripts','Serve-Codespaces.mjs'))throw Error('Supervisor nao confirmado; nenhum processo encerrado.');
  process.kill(pid,'SIGTERM');await new Promise(r=>setTimeout(r,1500));
  execFileSync(process.execPath,[path.join(ROOT,'scripts','Start-CodespacesPanels.mjs')],{cwd:ROOT,timeout:30000,stdio:['ignore','pipe','pipe']});
  checks.sessionPreserved=(await request('/api/me',{headers:{Cookie:cookie}})).status===200;
  checks.accountsUnchanged=fs.readFileSync(path.join(dir,'portal-users.private.json'),'utf8')===usersBefore;
  checks.dockerNotRestarted=daemon()===daemonBefore;
  checks.operatorStillRequiresLogin=(await requestApp('http://127.0.0.1:8099/')).status===401;
}finally{
  if(cookie){
    const logout=await request('/api/logout',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:{}});
    checks.logoutRevokesPreservedSession=logout.status===200&&(await request('/api/me',{headers:{Cookie:cookie}})).status===401;
  }
}
const report={at:new Date().toISOString(),checks,passed:Object.values(checks).filter(Boolean).length,total:Object.keys(checks).length};
writeJSON(path.join(RUNTIME,'reports','portal-restart.json'),report);console.log(JSON.stringify(report,null,2));
if(report.total!==5||report.passed!==report.total)process.exitCode=1;
