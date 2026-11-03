import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const runtime=process.env.VW_RUNTIME_DIR?path.resolve(process.env.VW_RUNTIME_DIR):path.join(root,'runtime');
const file=path.join(runtime,'container-engine.json');
const settings=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
export const containerEngine=process.env.CW_CONTAINER_ENGINE||settings.engine||'docker';
if(!['docker','podman'].includes(containerEngine))throw Error('Motor de containers invalido');

export function normalizeEngineInfo(info){
  if(containerEngine!=='podman')return info;
  if(info.host?.os!=='linux'||!info.host.hostname||!info.store?.graphRoot)throw Error('Resposta Podman invalida');
  return {
    ...info,OSType:info.host.os,OperatingSystem:info.host.distribution?.distribution,
    ID:'podman:'+info.host.hostname+':'+info.store.graphRoot,
    DockerRootDir:info.store.graphRoot,Driver:info.store.graphDriverName,
    MemTotal:info.host.memTotal,NCPU:info.host.cpus
  };
}

export function containerCommand(args,env=process.env){
  if(containerEngine==='podman'&&args[0]==='compose'){
    const command=env.CW_COMPOSE_BIN||settings.composeBin||'docker-compose';
    const socket=env.DOCKER_HOST||settings.socket;
    if(!socket?.startsWith('unix:///'))throw Error('Configure um socket Unix local do Podman');
    return {command,args:args.slice(1),env:{...env,DOCKER_HOST:socket,COMPOSE_PARALLEL_LIMIT:env.COMPOSE_PARALLEL_LIMIT||'2'}};
  }
  return {command:containerEngine,args,env};
}

export function prepareCompose(compose,engine=containerEngine){
  if(engine!=='podman')return compose;
  const result=structuredClone(compose);
  for(const service of Object.values(result.services)){
    const image=service.image,registry=image.split('/')[0];
    if(!image.includes('/')||(!registry.includes('.')&&!registry.includes(':')&&registry!=='localhost')){
      service.image='docker.io/'+(image.includes('/')?'':'library/')+image;
    }
    service.volumes=service.volumes?.map(volume=>{
      if(typeof volume==='object'){
        if(volume.type!=='bind'||volume.bind?.selinux)return volume;
        return {...volume,bind:{...volume.bind,selinux:'Z'}};
      }
      if(!volume.startsWith('./')&&!volume.startsWith('../')&&!volume.startsWith('/'))return volume;
      const parts=volume.split(':'),options=parts[2]?.split(',')||[];
      if(!options.some(value=>value==='z'||value==='Z'))options.push('Z');
      return parts.slice(0,2).join(':')+':'+options.join(',');
    });
    if(!service.volumes)delete service.volumes;
  }
  return result;
}
