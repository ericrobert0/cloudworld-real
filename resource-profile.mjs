// Concurrency controls only. Quotas are ceilings, not reserved memory.
export const economySettings={
  auth:{AUTHENTIK_WEB__WORKERS:'1',AUTHENTIK_WEB__THREADS:'4'},
  chat:{WEB_CONCURRENCY:'0',RAILS_MIN_THREADS:'1',RAILS_MAX_THREADS:'3'},
  'chat-worker':{SIDEKIQ_CONCURRENCY:'3',SIDEKIQ_ALIVE_CONCURRENCY:'2',RAILS_MAX_THREADS:'3'},
  'chat-init':{RAILS_MAX_THREADS:'3'}
};
export function economyProfile(compose){const result=structuredClone(compose);for(const [name,env] of Object.entries(economySettings)){if(!result.services[name])throw Error('Servico ausente no perfil: '+name);result.services[name].environment={...result.services[name].environment,...env};}return result;}
export function expectedWorkerTotal(){return Number(economySettings['chat-worker'].SIDEKIQ_CONCURRENCY)+Number(economySettings['chat-worker'].SIDEKIQ_ALIVE_CONCURRENCY);}
export function memoryBytes(text){const match=String(text).trim().match(/^([\d.]+)\s*(B|KiB|MiB|GiB|TiB)$/);if(!match)throw Error('Medida de memoria invalida');return Number(match[1])*1024**['B','KiB','MiB','GiB','TiB'].indexOf(match[2]);}
export function median(values){if(!values.length)return null;const v=[...values].sort((a,b)=>a-b),i=Math.floor(v.length/2);return v.length%2?v[i]:(v[i-1]+v[i])/2;}
