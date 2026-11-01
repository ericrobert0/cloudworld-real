export function percentile(values,p){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return Math.round(sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]*100)/100;}
export class Measurements{
  constructor(){this.rows=[];}
  add(endpoint,ms,{ok,status}={}){if(!Number.isFinite(ms)||ms<0)throw Error('Duracao invalida');this.rows.push({endpoint,ms,ok:ok===true,status:status??null});}
  summary(){const endpoints=[...new Set(this.rows.map(r=>r.endpoint))];return endpoints.map(endpoint=>{const rows=this.rows.filter(r=>r.endpoint===endpoint),values=rows.map(r=>r.ms);return {endpoint,requests:rows.length,errors:rows.filter(r=>!r.ok).length,p50Ms:percentile(values,.5),p95Ms:percentile(values,.95),maxMs:Math.round(Math.max(...values)*100)/100,statuses:Object.fromEntries([...new Set(rows.map(r=>String(r.status)))].map(s=>[s,rows.filter(r=>String(r.status)===s).length]))};});}
}
export async function burstRound({count,run}){if(!Number.isInteger(count)||count<1||count>10)throw Error('Rajada fora dos limites');let active=0,maxInFlight=0;const results=await Promise.allSettled(Array.from({length:count},async(_,i)=>{active++;maxInFlight=Math.max(maxInFlight,active);try{return await run(i);}finally{active--;}}));return {requests:results.length,errors:results.filter(r=>r.status==='rejected').length,maxInFlight};}
export async function pacedStage({concurrency,rate,durationMs,run,shouldStop=()=>false,clock=()=>performance.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>10||rate<=0||rate>3||durationMs<=0||durationMs>120000)throw Error('Carga fora dos limites locais');
  const start=clock(),deadline=start+durationMs;let next=start,tickets=0;
  await Promise.all(Array.from({length:concurrency},async()=>{while(!shouldStop()&&clock()<deadline){const at=Math.max(next,clock());next=at+1000/rate;if(at>=deadline)return;await sleep(Math.max(0,at-clock()));if(shouldStop()||clock()>=deadline)return;await run(tickets++);}}));
  return {cycles:tickets,elapsedMs:Math.round(clock()-start)};
}
