import {spawn} from 'node:child_process';

// Full {{json .}} invokes Size during CLI template preprocessing. Explicitly
// disable that costly filesystem scan and collect only fields used by CloudWorld.
export function dockerStatusArgs(){
  const format='{"ID":{{json .ID}},"Names":{{json .Names}},"State":{{json .State}},"Status":{{json .Status}},"Image":{{json .Image}},"Labels":{"com.docker.compose.project":{{json (.Label "com.docker.compose.project")}}}}';
  return ['ps','-a','--size=false','--filter','label=com.docker.compose.project','--format',format];
}

const actions=new Set(['create','start','restart','kill','die','stop','pause','unpause','destroy','oom','health_status: healthy','health_status: unhealthy']);
const terminationSignals=new Set(['2','9','15','INT','KILL','TERM','SIGINT','SIGKILL','SIGTERM']);
const validProject=p=>typeof p==='string'&&/^vw-[a-z][a-z0-9-]{1,30}$/.test(p);
export function projectContainers(rows){
  return rows.flatMap(row=>{
    const project=typeof row.Labels==='string'?row.Labels.split(',').find(label=>label.startsWith('com.docker.compose.project='))?.slice('com.docker.compose.project='.length):row.Labels?.['com.docker.compose.project'];
    if(!validProject(project)||typeof row.Names!=='string'||!row.Names.startsWith(project+'-'))return [];
    // Whitelist fields: arbitrary labels can contain credentials.
    return [{ID:row.ID,Names:row.Names,State:row.State,Status:row.Status,Image:row.Image,Project:project}];
  });
}
export class ContainerEvents {
  constructor({clock=Date.now,limit=100,transitionMs=120000}={}){
    this.clock=clock;this.limit=Math.max(1,Math.min(limit,100));this.transitionMs=transitionMs;
    this.recent=[];this.stopping=new Map();this.connected=false;this.error=null;this.lastEventAt=null;
  }
  ingest(event){
    const name=event.Actor?.Attributes?.name,project=event.Actor?.Attributes?.['com.docker.compose.project'],action=event.Action||event.status;
    if(event.Type!=='container'||!validProject(project)||typeof name!=='string'||!name.startsWith(project+'-')||!/^vw-[a-z0-9][a-z0-9_.-]{1,200}$/.test(name)||!actions.has(action))return false;
    const at=new Date(this.clock()).toISOString(),signal=String(event.Actor?.Attributes?.signal||'').toUpperCase();
    const entry={at,name,project,action};
    if(action==='kill'&&terminationSignals.has(signal)){
      entry.signal=signal;this.stopping.delete(name);this.stopping.set(name,{at,until:this.clock()+this.transitionMs});
      if(this.stopping.size>500)this.stopping.delete(this.stopping.keys().next().value);
    }
    if(['start','restart','die','stop','destroy'].includes(action))this.stopping.delete(name);
    this.recent.push(entry);if(this.recent.length>this.limit)this.recent.shift();
    this.connected=true;this.error=null;this.lastEventAt=at;return true;
  }
  disconnect(error='Coleta de eventos Docker indisponivel'){
    this.connected=false;this.error=error;this.stopping.clear();
  }
  decorate(rows){
    const now=this.clock();for(const [name,event] of this.stopping)if(event.until<=now)this.stopping.delete(name);
    return rows.map(row=>{
      const {Phase,PhaseObservedAt,...base}=row;
      const event=this.stopping.get(row.Names);
      if(row.State!=='running'){this.stopping.delete(row.Names);return base;}
      return event?{...base,Phase:'stopping',PhaseObservedAt:event.at}:base;
    });
  }
  status(){return {connected:this.connected,error:this.error,lastEventAt:this.lastEventAt,recent:this.recent.slice()};}
}

// One streaming CLI process, bounded input/history and reconnect backoff. Never starts Docker.
export class DockerEventStream {
  constructor({tracker=new ContainerEvents(),launch=spawn,onUpdate=()=>{}}={}){
    this.tracker=tracker;this.launch=launch;this.onUpdate=onUpdate;this.closed=false;this.child=null;this.timer=null;this.delay=1000;
  }
  start(){
    if(this.closed||this.child)return;
    const child=this.launch('docker',['events','--filter','type=container','--format','{{json .}}'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    this.child=child;let buffer='',finished=false;
    const finish=()=>{
      if(finished)return;finished=true;if(this.child===child)this.child=null;
      this.tracker.disconnect();this.onUpdate();
      if(!this.closed){this.timer=setTimeout(()=>{this.timer=null;this.start();},this.delay);this.timer.unref?.();this.delay=Math.min(this.delay*2,15000);}
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',chunk=>{
      buffer+=chunk;
      if(buffer.length>65536){buffer='';this.tracker.disconnect();this.onUpdate();child.kill();return;}
      let end;
      while((end=buffer.indexOf('\n'))!==-1){
        const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
        try{if(this.tracker.ingest(JSON.parse(line))){this.delay=1000;this.onUpdate();}}catch{}
      }
    });
    child.stderr.on('data',()=>{}); // Never retain arbitrary daemon/label output.
    child.on('error',finish);child.on('close',finish);
  }
  close(){this.closed=true;clearTimeout(this.timer);this.timer=null;this.child?.kill();}
}
