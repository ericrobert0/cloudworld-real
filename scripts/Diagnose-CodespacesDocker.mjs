// Bounded, read-only signal tracing. Does not restart Docker or change idle settings.
import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {RUNTIME} from '../infra.mjs';
import {codespacesIdentity} from '../codespaces.mjs';
codespacesIdentity();
const pids=execFileSync('pgrep',['-x','dockerd'],{encoding:'utf8'}).trim().split(/\s+/);
if(pids.length!==1||!/^\d+$/.test(pids[0]))throw Error('Um unico daemon deve estar ativo antes do diagnostico.');
fs.mkdirSync(RUNTIME,{recursive:true});
const dest=path.join(RUNTIME,'docker-signals.private.log');
const out=fs.openSync(dest,'a',0o600);
const known=new Map();
function snapshot(){
  // Deliberately exclude arguments and environment, which may contain credentials.
  const rows=execFileSync('ps',['-eo','pid=,ppid=,comm='],{encoding:'utf8',timeout:5000});
  for(const line of rows.trim().split('\n')){
    const m=line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if(m)known.set(m[1],{pid:Number(m[1]),parent:Number(m[2]),command:m[3]});
  }
}
snapshot();
const tracer=spawn('sudo',['-n','strace','-I','2','-f','-tt','-e','trace=none','-e','signal=SIGTERM,SIGINT','-p',pids[0]],{stdio:['ignore','ignore','pipe']});
tracer.stderr.on('data',chunk=>{
  fs.writeSync(out,chunk);
  for(const match of chunk.toString().matchAll(/si_pid=(\d+)/g)){
    const sender=known.get(match[1]);
    fs.writeSync(out,JSON.stringify({at:new Date().toISOString(),sender:sender||{pid:Number(match[1])},parent:sender?known.get(String(sender.parent)):undefined})+'\n');
  }
});
const interval=setInterval(()=>{try{snapshot();}catch{}},2000);
const deadline=setTimeout(()=>{
  // Signal only strace, never sudo's session/process group or the traced daemon.
  try{
    snapshot();
    const belongsToTracer=entry=>{let parent=entry.parent;for(let i=0;i<5;i++){if(parent===tracer.pid)return true;parent=known.get(String(parent))?.parent;if(!parent)return false;}return false;};
    const observer=[...known.values()].find(entry=>entry.command==='strace'&&belongsToTracer(entry));
    if(!observer)throw Error('Processo strace nao identificado; nenhum sinal enviado.');
    if(fs.readFileSync('/proc/'+observer.pid+'/comm','utf8').trim()!=='strace')throw Error('Observador mudou; nenhum sinal enviado.');
    execFileSync('sudo',['-n','kill','-INT',String(observer.pid)],{stdio:'ignore',timeout:5000});
  }catch(error){fs.writeSync(out,error.message+'\n');finish(1);}
},10*60*1000);
tracer.on('error',error=>{fs.writeSync(out,error.message+'\n');finish(1);});
tracer.on('exit',code=>finish(code||0));
let finished=false;
function finish(code){if(finished)return;finished=true;clearInterval(interval);clearTimeout(deadline);fs.closeSync(out);console.log('Diagnostico encerrado. Registro privado: '+dest);process.exitCode=code;}
console.log('Rastreando somente sinais por ate dez minutos; sem argumentos ou senhas.');
