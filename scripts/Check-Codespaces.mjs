// Read-only inspection inside the actual remote development environment.
import fs from 'node:fs';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
if(process.env.CODESPACES!=='true'||!process.env.CODESPACE_NAME)throw Error('Execute dentro do Codespace remoto. Nenhum recurso foi criado.');
const result={at:new Date().toISOString(),platform:process.platform,node:process.versions.node,architecture:process.arch,workspaceFreeGiB:null,docker:null,scope:'Read-only prerequisite inspection; does not install, expose ports or approve production.'};
const disk=fs.statfsSync(process.cwd(),{bigint:true});result.workspaceFreeGiB=Number((Number(disk.bavail*disk.bsize)/1024**3).toFixed(1));
try{const d=JSON.parse(execFileSync('docker',['info','--format','{{json .}}'],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}));result.docker={os:d.OSType,architecture:d.Architecture,cpus:d.NCPU,memoryGiB:Number((Number(d.MemTotal)/1024**3).toFixed(1))};execFileSync('docker',['compose','version'],{stdio:'ignore',timeout:10000});result.compose=true;}catch{result.dockerError='Docker Engine ou Compose indisponivel. Nao iniciar o pacote.';}
result.hostMemoryGiB=Number((os.totalmem()/1024**3).toFixed(1));
result.checks={linux:process.platform==='linux',node:Number(process.versions.node.split('.')[0])>=22,amd64:process.arch==='x64',docker:result.docker?.os==='linux'&&result.compose===true,memory:(result.docker?.memoryGiB||0)>=7,disk:result.workspaceFreeGiB>=20};
result.canEvaluate=Object.values(result.checks).every(Boolean);
result.note='Quota gratuita, limites da conta e tamanho das imagens/volumes ainda precisam ser conferidos antes do download. Memoria de 16 GiB e recomendada para o ensaio completo.';
console.log(JSON.stringify(result,null,2));if(!result.canEvaluate)process.exitCode=1;
