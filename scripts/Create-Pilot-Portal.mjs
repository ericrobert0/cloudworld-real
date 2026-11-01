import fs from 'node:fs';
import path from 'node:path';
import {RUNTIME,tenantPath} from '../infra.mjs';
import {atomicJSON} from '../integration.mjs';
const id=process.argv[2]||'piloto',file=path.join(tenantPath(id),'portal-initial.private.json');
if(fs.existsSync(file)){console.log('Credencial inicial ja existe; nenhuma senha foi alterada.');process.exit(0);}
const auth='Basic '+Buffer.from('admin:'+fs.readFileSync(path.join(RUNTIME,'panel-password.txt'),'utf8').trim()).toString('base64');
const r=await fetch('http://127.0.0.1:8099/api/v1/tenants/'+id+'/portal/users',{method:'POST',headers:{Authorization:auth,Origin:'http://127.0.0.1:8099','Content-Type':'application/json'},body:JSON.stringify({username:'responsavel',name:'Responsavel da empresa',apps:['chat','erp','cloud','postiz']})});
const u=await r.json();if(!r.ok)throw Error(u.error||'Conta nao criada');atomicJSON(file,{company:id,username:u.username,password:u.initialPassword,url:'http://127.0.0.1:8100/',userId:u.id});console.log('Acesso inicial criado; credencial em arquivo privado na pasta do cliente.');
