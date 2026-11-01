import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {ROOT,tenantPath,writeJSON} from '../infra.mjs';
export async function configureMixpostAdmin(id){
const dir=tenantPath(id),t=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json'))),s=JSON.parse(fs.readFileSync(path.join(dir,'secrets.json')));
if(!s.mixpostAdmin)throw Error('Senha privada do Mixpost nao encontrada.');
const credentials={email:'admin@example.com',password:s.mixpostAdmin,url:t.urls.mixpost+'/mixpost/login'};
const php=`<?php
require 'vendor/autoload.php';
$app=require 'bootstrap/app.php';
$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap();
$u=App\\Models\\User::where('email','admin@example.com')->firstOrFail();
$u->password=Illuminate\\Support\\Facades\\Hash::make(${JSON.stringify(credentials.password)});
$u->save();
echo "Senha padrao substituida.\\n";
`;
const child=spawn('docker',['compose','--project-directory',dir,'-f',path.join(dir,'compose.json'),'exec','-T','mixpost','php'],{windowsHide:true,stdio:['pipe','inherit','inherit']});
child.stdin.end(php);
await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error('Falha ao configurar administrador')));});
writeJSON(path.join(dir,'mixpost-admin.private.json'),credentials);
console.log('Credenciais salvas em arquivo privado do cliente.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.join(ROOT,'scripts','mixpost-admin.mjs'))await configureMixpostAdmin(process.argv[2]||'piloto');
