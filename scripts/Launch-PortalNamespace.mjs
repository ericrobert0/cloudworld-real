import {spawn} from 'node:child_process';
import {portalNamespaceArgs} from './Prepare-PortalIdentity.mjs';
if(process.platform!=='linux'||process.getuid()!==0)throw Error('Inicializador restrito ao supervisor privilegiado.');
// A dedicated process group lets the supervisor terminate the namespace child
// even on util-linux versions where unshare does not forward SIGTERM.
const child=spawn('unshare',portalNamespaceArgs(process.argv[2],process.argv[3]),{detached:true,env:{PATH:'/usr/local/bin:/usr/bin:/bin'},stdio:'inherit'});
let closing=false,timer;
const signal=s=>{try{process.kill(-child.pid,s);}catch(e){if(e.code!=='ESRCH')process.exitCode=1;}};
for(const s of ['SIGTERM','SIGINT'])process.on(s,()=>{if(closing)return;closing=true;signal('SIGTERM');timer=setTimeout(()=>signal('SIGKILL'),5000);timer.unref();});
child.on('error',()=>{process.exitCode=1;});
child.on('exit',code=>{if(timer)clearTimeout(timer);process.exitCode=closing?0:code||1;});
