import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inspectBackupSchedule,backupScheduleReadiness,BackupScheduleMonitor,schedulerTime} from '../backup-schedule.mjs';
const now=Date.parse('2026-11-03T12:00:00Z'),root='/opt/cloudworld',runtime='/opt/cloudworld/runtime';
const timer={LoadState:'loaded',ActiveState:'active',UnitFileState:'enabled',NextElapseUSecRealtime:'@'+(now+12*3600000)/1000,Triggers:'cloudworld-backup.service',TimersCalendar:'{ OnCalendar=*-*-* 03:00:00 America/Sao_Paulo ; next_elapse=ignored ; }'};
const service={LoadState:'loaded',ExecStart:'{ path=/usr/bin/node ; argv[]=/usr/bin/node /opt/cloudworld/scripts/Run-Backups.mjs ; ignore_errors=no ; }',WorkingDirectory:root,Environment:'',EnvironmentFiles:'',User:'operator'};
const options={root,runtime,platform:'linux',hostname:'test-host',username:'operator',clock:()=>now};
const serialize=values=>Object.entries(values).map(([key,value])=>key+'='+value).join('\n');
const fake=(t=timer,s=service)=>async(command,args)=>{
 assert.equal(command,'systemctl');assert.ok(!args.some(v=>['start','enable','stop','restart'].includes(v)));
 return {stdout:serialize(args.includes('cloudworld-backup.timer')?t:s)};
};

test('Linux verifies an enabled active timer, exact target and future execution without mutations',async()=>{
 const status=await inspectBackupSchedule({...options,run:fake()});assert.equal(status.verified,true);assert.equal(status.nextAt,'2026-11-04T00:00:00.000Z');
 assert.equal(backupScheduleReadiness({enabled:true},{...options,now,status}).ok,true);
 const user=await inspectBackupSchedule({...options,scope:'user',run:async(command,args)=>{assert.ok(args.includes('--user'));return fake(timer,{...service,User:''})(command,args);}});assert.equal(user.verified,true);
});

test('Linux rejects disabled timers, stale dates, wrappers and other runtime or user identities',async()=>{
 for(const patch of [{ActiveState:'inactive'},{UnitFileState:'disabled'},{TimersCalendar:'{ OnCalendar=2026-11-04 03:00:00 ; }'},{NextElapseUSecRealtime:'@0'},{Triggers:'other.service'},{NextElapseUSecRealtime:'@'+(now+48*3600000)/1000}]){
  assert.equal((await inspectBackupSchedule({...options,run:fake({...timer,...patch})})).verified,false,JSON.stringify(patch));
 }
 for(const patch of [{WorkingDirectory:'/other'},{User:'other'},{Environment:'VW_RUNTIME_DIR=/other'},{Environment:'"VW_RUNTIME_DIR=/other path"'},{EnvironmentFiles:'/etc/private.env'},{Environment:'CW_CONTAINER_ENGINE=podman'},{ExecStart:'{ argv[]=/usr/bin/node /other/Run-Backups.mjs ; }'},{ExecStart:'{ argv[]=/usr/bin/node -e /opt/cloudworld/scripts/Run-Backups.mjs ; }'}]){
  assert.equal((await inspectBackupSchedule({...options,run:fake(timer,{...service,...patch})})).verified,false,JSON.stringify(patch));
 }
});

test('readiness requires current evidence for the same host, code, runtime and scheduler scope',async()=>{
 const status=await inspectBackupSchedule({...options,run:fake()});
 for(const change of [{hostname:'other'},{root:'/other'},{runtime:'/other'},{platform:'darwin'},{now:now+300001},{now:now-6000},{codespaces:true}]){
  assert.equal(backupScheduleReadiness({enabled:true},{...options,now,status,...change}).ok,false);
 }
 assert.equal(backupScheduleReadiness({enabled:false},{...options,now,status}).ok,false);
 assert.equal(backupScheduleReadiness({enabled:true,systemdScope:'user'},{...options,now,status}).ok,false);
 assert.equal(backupScheduleReadiness({enabled:true},{...options,now,status:{...status,engine:'podman'}}).ok,false);
 assert.equal(backupScheduleReadiness({enabled:true},{...options,now,status:null}).ok,false);
});

test('Windows inspects the existing task and rejects another installation or unsafe action',async()=>{
 const winRoot='D:\\CloudWorld',win={...options,root:winRoot,runtime:winRoot+'\\runtime',platform:'win32'};
 const task={state:'Ready',enabled:true,daily:true,execute:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',arguments:'-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "D:\\CloudWorld\\scripts\\Run-BackupTask.ps1"',workingDirectory:winRoot,nextAt:'2026-11-04T00:00:00.0000000Z'};
 const inspect=patch=>inspectBackupSchedule({...win,run:async(command,args)=>{assert.equal(command,'powershell.exe');assert.ok(args.at(-1).includes('Get-ScheduledTaskInfo'));assert.ok(!args.at(-1).includes('Register-ScheduledTask'));return {stdout:JSON.stringify({...task,...patch})};}});
 assert.equal((await inspect({})).verified,true);
 for(const patch of [{enabled:false},{daily:false},{state:'Disabled'},{workingDirectory:'D:\\Other'},{arguments:'-Command bad -File "D:\\CloudWorld\\scripts\\Run-BackupTask.ps1"'},{arguments:'-File "D:\\Other\\scripts\\Run-BackupTask.ps1"'},{nextAt:'invalid'}])assert.equal((await inspect(patch)).verified,false);
});

test('missing services and command errors remain pending without exposing private output',async()=>{
 const result=await inspectBackupSchedule({...options,run:async()=>{throw Error('SECRET environment contents');}});
 assert.equal(result.verified,false);assert.ok(!JSON.stringify(result).includes('SECRET'));
 assert.equal(schedulerTime('n/a'),null);assert.equal(schedulerTime('@999999999999999999999999999'),null);
 assert.equal(schedulerTime('Wed 2026-11-04 03:00:00.123456 UTC'),'2026-11-04T03:00:00.123Z');
});

test('background checks are bounded, prevent overlapping queries and persist fresh evidence',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cw-schedule-'));let time=now,calls=0,release;
 const blocked=new Promise(r=>release=r),monitor=new BackupScheduleMonitor({root,runtime:temp,clock:()=>time,inspect:async()=>{calls++;await blocked;return {verified:false,at:new Date(time).toISOString(),detail:'Not configured'};}});
 const first=monitor.refresh();await monitor.refresh();assert.equal(calls,1);release();await first;
 assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'backup-schedule-status.json'))).verified,false);
 await monitor.refresh();assert.equal(calls,1);time+=60001;await monitor.refresh();assert.equal(calls,2);
 if(process.platform!=='win32')assert.equal(fs.statSync(path.join(temp,'backup-schedule-status.json')).mode&0o777,0o600);
 fs.rmSync(temp,{recursive:true,force:true});
});
