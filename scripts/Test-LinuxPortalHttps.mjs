import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {inspectHttpsTarget} from '../https-check.mjs';
if(process.platform!=='linux'||process.getuid()!==0||process.cwd()!=='/opt/cloudworld')throw Error('Run through Test-LinuxPortalSystemd.sh in the disposable environment.');
const origin='https://localhost:28443',checks=[];
async function check(name,fn){await fn();checks.push({name,ok:true});console.log(name+' | OK');}
for(let i=0;i<30;i++){
  try{if((await fetch(origin)).status===200)break;}catch{}
  await delay(500);
}
await check('HTTPS portal and protected anonymous session',async()=>{
  assert.equal((await inspectHttpsTarget(['portal',origin,[200]])).ok,true);
  assert.equal((await inspectHttpsTarget(['session',origin+'/api/me',[401]])).ok,true);
});
await check('Untrusted certificate is refused',()=>{
  execFileSync(process.execPath,['--input-type=module','-e',`try {await fetch('${origin}');process.exit(1);} catch(error) {if(!['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN'].includes(error.cause?.code))throw error;}`],
    {env:{PATH:process.env.PATH},stdio:'pipe',timeout:10000});
});
await check('Private administrative routes and cross-origin login are refused',async()=>{
  assert.equal((await inspectHttpsTarget(['admin',origin+'/api/v1/tenants/lab/status',[404]])).ok,true);
  const response=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:'https://external.invalid','Content-Type':'application/json'},body:'{}'});
  assert.equal(response.status,403);
});
await check('Portal identity reaches broker and unknown account is refused',()=>{
  execFileSync('runuser',['-u','cloudworld-portal','--',process.execPath,'--input-type=module','-e',
    "import http from 'node:http'; const req=http.request({socketPath:'/var/lib/cloudworld-portal/identity.sock',path:'/verify',method:'POST',headers:{'content-type':'application/json'}},res=>{res.resume();res.on('end',()=>{if(res.statusCode!==403)process.exitCode=1;});});req.on('error',()=>{process.exitCode=1;});req.setTimeout(3000,()=>req.destroy());req.end(JSON.stringify({tenant:'lab',userId:'unknown',version:1}));"],{timeout:10000,stdio:'pipe'});
});
const user=JSON.parse(fs.readFileSync('runtime/lab-login.private.json'));
const login=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({tenant:'lab',username:user.username,password:user.initialPassword})});
assert.equal(login.status,200);
const cookie=login.headers.get('set-cookie');
await check('Secure login and session across portal restart',async()=>{
  for(const flag of ['Secure','HttpOnly','SameSite=Strict'])assert.ok(cookie.includes(flag));
  execFileSync('systemctl',['restart','cloudworld-portal.service'],{timeout:15000});
  await delay(1500);
  const response=await fetch(origin+'/api/me',{headers:{Cookie:cookie.split(';')[0]}});
  assert.equal(response.status,200);assert.equal((await response.json()).company,'lab');
});
await check('Expired projection refuses access and projector recovers',async()=>{
  execFileSync('systemctl',['kill','--signal=SIGSTOP','cloudworld-portal-projector.service'],{timeout:15000});
  try{
    await delay(16000);
    const blocked=await fetch(origin+'/api/me',{headers:{Cookie:cookie.split(';')[0]}});
    assert.notEqual(blocked.status,200);
  }finally{
    execFileSync('systemctl',['kill','--signal=SIGCONT','cloudworld-portal-projector.service'],{timeout:15000});
  }
  execFileSync('systemctl',['restart','cloudworld-portal-projector.service'],{timeout:15000});
  await delay(2000);
  assert.equal((await fetch(origin+'/api/me',{headers:{Cookie:cookie.split(';')[0]}})).status,200);
});
await check('Suspended user loses existing session',async()=>{
  execFileSync('runuser',['-u','cloudworld','--',process.execPath,'--input-type=module','-e',
    "import {PortalAccounts} from 'file:///opt/cloudworld/portal.mjs'; const accounts=new PortalAccounts(); await accounts.save('lab',{id:accounts.users('lab')[0].id,enabled:false});"],{timeout:15000,stdio:'pipe'});
  await delay(2500);
  assert.equal((await fetch(origin+'/api/me',{headers:{Cookie:cookie.split(';')[0]}})).status,401);
});
fs.writeFileSync('runtime/linux-portal-lab.json',JSON.stringify({at:new Date().toISOString(),ok:true,checks},null,2));
