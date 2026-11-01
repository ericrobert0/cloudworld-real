// Run on the target server. No packages, images, services or firewall rules are changed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {RUNTIME,writeJSON} from '../infra.mjs';
if(process.platform!=='linux')throw Error('Execute este comando no servidor Linux de destino.');
if(process.argv.slice(2).some(a=>a!=='--confirm-storage'))throw Error('Uso: node scripts/Check-LinuxHost.mjs [--confirm-storage]');
const info=JSON.parse(execFileSync('docker',['info','--format','{{json .}}'],{encoding:'utf8',timeout:20000}));
execFileSync('docker',['compose','version'],{stdio:'ignore',timeout:10000});
if(info.OSType!=='linux'||/docker desktop/i.test(info.OperatingSystem||''))throw Error('Necessario Docker Engine em Linux nativo.');
if(typeof info.ID!=='string'||!info.ID||typeof info.DockerRootDir!=='string'||!info.DockerRootDir.startsWith('/')||info.DockerRootDir==='/')throw Error('Identidade ou diretorio Docker invalido.');
const disk=fs.statfsSync(info.DockerRootDir,{bigint:true}),freeGiB=Number(disk.bavail*disk.bsize)/1024**3,memoryGiB=Number(info.MemTotal)/1024**3;
const checks={node:Number(process.versions.node.split('.')[0])>=22,memory:memoryGiB>=7,cpu:info.NCPU>=2,disk:freeGiB>=40};
const result={at:new Date().toISOString(),platform:os.platform(),checks,resources:{memoryGiB:Number(memoryGiB.toFixed(1)),cpu:info.NCPU,freeDockerDiskGiB:Number(freeGiB.toFixed(1))},readyForPilot:Object.values(checks).every(Boolean),scope:'Prerequisites only. Does not approve production, network security, integrations or capacity under load.'};
if(process.argv.includes('--confirm-storage')){
  if(!result.readyForPilot)throw Error('Requisitos minimos nao atendidos: '+JSON.stringify(result));
  writeJSON(path.join(RUNTIME,'linux-storage-confirmed.json'),{platform:'linux',serverId:info.ID,dockerRootDir:info.DockerRootDir,checkedAt:result.at});
  result.storageConfirmed=true;
}
console.log(JSON.stringify(result,null,2));
if(!result.readyForPilot)process.exitCode=1;
