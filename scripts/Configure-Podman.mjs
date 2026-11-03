import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {RUNTIME,writeJSON} from '../infra.mjs';

if(process.platform!=='linux')throw Error('O suporte Podman atual exige Linux nativo.');
const args=process.argv.slice(2);
if(args.length!==0&&(args.length!==2||args[0]!=='--compose-bin'))throw Error('Uso: node scripts/Configure-Podman.mjs [--compose-bin CAMINHO]');
const file=path.join(RUNTIME,'container-engine.json');
const previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
const composeBin=args[1]||process.env.CW_COMPOSE_BIN||previous.composeBin||'docker-compose';
const info=JSON.parse(execFileSync('podman',['info','--format','{{json .}}'],{encoding:'utf8',timeout:20000}));
if(info.host?.os!=='linux'||!info.store?.graphRoot)throw Error('Resposta Podman invalida');
const socket=process.env.DOCKER_HOST||'unix://'+info.host.remoteSocket?.path;
if(!socket.startsWith('unix:///')||!fs.existsSync(socket.slice(7)))throw Error('Ative o socket local: systemctl --user start podman.socket');
const version=execFileSync(composeBin,['version','--short'],{encoding:'utf8',timeout:10000}).trim();
if(!/^v?[2-9]\./.test(version))throw Error('Use Docker Compose v2 conectado ao Podman, nao podman-compose.');
await new Promise((resolve,reject)=>{
  const req=http.get({socketPath:socket.slice(7),path:'/_ping',timeout:5000},res=>{
    res.resume();res.on('end',()=>res.statusCode===200?resolve():reject(Error('Socket Podman nao respondeu')));
  });
  req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Socket Podman excedeu o tempo limite')));
});
writeJSON(file,{engine:'podman',composeBin,socket});
console.log('Podman configurado. Execute node scripts/Check-LinuxHost.mjs --confirm-storage antes de iniciar os ambientes.');
