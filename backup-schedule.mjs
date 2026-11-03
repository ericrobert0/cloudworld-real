import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT,RUNTIME,writeJSON} from './infra.mjs';

const execute=promisify(execFile),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}};
const identity=(root,runtime,platform,hostname)=>({rootId:hash(path.resolve(root)),runtimeId:hash(path.resolve(runtime)),platform,hostname});
const properties=text=>Object.fromEntries(text.split('\n').filter(line=>line.includes('=')).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
export function schedulerTime(value){
  const unix=String(value||'').match(/^@(\d+(?:\.\d+)?)$/);
  if(unix){const date=Number(unix[1])*1000;return Number.isFinite(date)&&Math.abs(date)<=8640000000000000?new Date(date).toISOString():null;}
  const time=String(value||'').replace(/^[A-Za-z]{3} /,'').replace(/(\.\d{3})\d+/,'$1').replace(' UTC','Z').replace(' ','T');
  const date=Date.parse(time);return Number.isFinite(date)?new Date(date).toISOString():null;
}
const future=(value,now)=>Number.isFinite(Date.parse(value))&&Date.parse(value)>now&&Date.parse(value)-now<=36*3600000;

export async function inspectBackupSchedule({root=ROOT,runtime=RUNTIME,platform=process.platform,hostname=os.hostname(),username=os.userInfo().username,scope='system',engine='docker',clock=Date.now,run=execute}={}){
  const now=clock(),base={...identity(root,runtime,platform,hostname),engine,at:new Date(now).toISOString(),verified:false,nextAt:null,scope};
  try{
    if(platform==='linux'){
      if(!['system','user'].includes(scope))return {...base,detail:'Escopo systemd invalido'};
      const prefix=[...(scope==='user'?['--user']:[]),'--timestamp=unix','show','--no-pager'];
      const [timerResult,serviceResult]=await Promise.all([
        run('systemctl',[...prefix,'cloudworld-backup.timer','-p','LoadState','-p','ActiveState','-p','UnitFileState','-p','NextElapseUSecRealtime','-p','Triggers','-p','TimersCalendar'],{timeout:5000,maxBuffer:32768}),
        run('systemctl',[...prefix,'cloudworld-backup.service','-p','LoadState','-p','ExecStart','-p','WorkingDirectory','-p','Environment','-p','EnvironmentFiles','-p','User'],{timeout:5000,maxBuffer:32768})
      ]);
      const timer=properties(timerResult.stdout),service=properties(serviceResult.stdout),nextAt=schedulerTime(timer.NextElapseUSecRealtime);
      const argv=service.ExecStart?.match(/argv\[\]=([^;]+)\s*;/)?.[1].trim().split(/\s+/)||[];
      const env=Object.fromEntries((service.Environment||'').split(/\s+/).filter(value=>value.includes('=')).map(value=>{const i=value.indexOf('=');return [value.slice(0,i),value.slice(i+1)];}));
      const environmentValid=!/[\"'\\]/.test(service.Environment||'');
      const configuredRuntime=env.VW_RUNTIME_DIR?path.resolve(root,env.VW_RUNTIME_DIR):path.join(root,'runtime');
      const targetMatches=service.LoadState==='loaded'&&service.WorkingDirectory===root
        &&argv.length===2&&/^node(?:\.exe)?$/.test(path.basename(argv[0]))&&argv[1]===path.join(root,'scripts','Run-Backups.mjs')
        &&(!service.User&&scope==='user'||service.User===username)
        &&environmentValid&&path.resolve(configuredRuntime)===path.resolve(runtime)&&!service.EnvironmentFiles
        &&(!env.CW_CONTAINER_ENGINE||env.CW_CONTAINER_ENGINE===engine);
      const enabled=timer.UnitFileState==='enabled',active=timer.ActiveState==='active',daily=/OnCalendar=\*-\*-\*\s+\d{2}:\d{2}:\d{2}(?:\s+[A-Za-z_]+(?:\/[A-Za-z_]+)*)?\s*;/.test(timer.TimersCalendar||'');
      const verified=timer.LoadState==='loaded'&&enabled&&active&&daily&&targetMatches&&timer.Triggers?.split(' ').includes('cloudworld-backup.service')&&future(nextAt,now);
      return {...base,scheduler:'systemd',enabled,active,daily,targetMatches,nextAt,verified,detail:verified?'Timer ativo, habilitado e vinculado a esta instalacao':!targetMatches?'Servico de backup ausente ou nao corresponde a esta instalacao':'Timer ausente, desabilitado ou sem proxima execucao diaria valida'};
    }
    if(platform==='win32'){
      const script="$t=Get-ScheduledTask -TaskName 'CloudWorld-Backup' -ErrorAction Stop; $i=Get-ScheduledTaskInfo -TaskName 'CloudWorld-Backup'; if(@($t.Actions).Count -ne 1){throw 'Acoes inesperadas'}; [pscustomobject]@{state=[string]$t.State; enabled=($t.Settings.Enabled -ne $false); execute=$t.Actions[0].Execute; arguments=$t.Actions[0].Arguments; workingDirectory=$t.Actions[0].WorkingDirectory; daily=(@($t.Triggers | Where-Object {$_.CimClass.CimClassName -eq 'MSFT_TaskDailyTrigger' -and $_.DaysInterval -eq 1 -and $_.Enabled}).Count -gt 0); nextAt=$i.NextRunTime.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress";
      const result=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{timeout:5000,maxBuffer:32768,windowsHide:true});
      const task=JSON.parse(result.stdout.replace(/^\uFEFF/,'')),args=task.arguments||'';
      const match=args.match(/^(?:\s*-(?:NoProfile|NonInteractive)|\s*-WindowStyle\s+Hidden|\s*-ExecutionPolicy\s+Bypass)*\s+-File\s+"([^"]+)"\s*$/i);
      const normalize=value=>path.win32.normalize(value||'').toLowerCase();
      const targetMatches=/^(powershell|pwsh)(\.exe)?$/i.test(path.win32.basename(task.execute||''))&&!!match
        &&normalize(match[1])===normalize(path.win32.join(root,'scripts','Run-BackupTask.ps1'))&&normalize(task.workingDirectory)===normalize(root)
        &&normalize(runtime)===normalize(path.win32.join(root,'runtime'));
      const active=['Ready','Running'].includes(task.state),enabled=task.enabled===true,nextAt=schedulerTime(task.nextAt),verified=enabled&&active&&task.daily===true&&targetMatches&&future(nextAt,now);
      return {...base,scheduler:'windows-task',enabled,active,daily:task.daily===true,targetMatches,nextAt,verified,detail:verified?'Tarefa ativa e vinculada a esta instalacao':'Tarefa ausente, desabilitada ou vinculada a outra instalacao'};
    }
    return {...base,detail:'Agendador nao suportado nesta plataforma'};
  }catch{return {...base,detail:'Nao foi possivel verificar o agendador do sistema'};}
}

export function backupScheduleReadiness(policy,{root=ROOT,runtime=RUNTIME,platform=process.platform,hostname=os.hostname(),now=Date.now(),codespaces=false,status=read(path.join(runtime,'backup-schedule-status.json'),null)}={}){
  if(codespaces)return {ok:false,detail:'Codespaces pode suspender; requer servidor permanente e agendamento validado'};
  if(policy.enabled!==true)return {ok:false,detail:'Politica automatica de backup desativada'};
  const settings=read(path.join(runtime,'container-engine.json'),{}),expected={...identity(root,runtime,platform,hostname),engine:process.env.CW_CONTAINER_ENGINE||settings.engine||'docker'},age=now-Date.parse(status?.at),fresh=Number.isFinite(age)&&age>=-5000&&age<300000;
  const same=!!status&&Object.entries(expected).every(([key,value])=>status[key]===value);
  const scope=process.env.CW_BACKUP_SYSTEMD_SCOPE||policy.systemdScope||'system';
  const ok=same&&fresh&&status.verified===true&&future(status.nextAt,now)&&(platform!=='linux'||status.scope===scope);
  return {ok,checkedAt:same?status.at:null,nextAt:same?status.nextAt:null,detail:ok?'Agendador confirmado; proxima execucao em '+status.nextAt:!same||!fresh?'Verificacao do agendador ausente ou desatualizada':status.detail||'Agendamento nao confirmado'};
}

export class BackupScheduleMonitor{
  constructor({root=ROOT,runtime=RUNTIME,clock=Date.now,inspect=inspectBackupSchedule}={}){this.root=root;this.runtime=runtime;this.clock=clock;this.inspect=inspect;this.busy=false;this.lastAt=null;}
  async refresh({force=false}={}){
    if(this.busy||!force&&this.lastAt!==null&&this.clock()-this.lastAt<60000)return;
    this.busy=true;
    try{
      const policy=read(path.join(this.runtime,'backup-policy.private.json'),{}),settings=read(path.join(this.runtime,'container-engine.json'),{});
      const status=await this.inspect({root:this.root,runtime:this.runtime,clock:this.clock,scope:process.env.CW_BACKUP_SYSTEMD_SCOPE||policy.systemdScope||'system',engine:process.env.CW_CONTAINER_ENGINE||settings.engine||'docker'});
      writeJSON(path.join(this.runtime,'backup-schedule-status.json'),status);this.lastAt=this.clock();return status;
    }finally{this.busy=false;}
  }
}
