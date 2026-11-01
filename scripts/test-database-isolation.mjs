import path from 'node:path';
import fs from 'node:fs';
import {RUNTIME,tenantPath} from '../infra.mjs';
import {atomicJSON} from '../integration.mjs';
import {checkDatabasePair} from '../database-isolation.mjs';
const [a,b]=process.argv.slice(2);tenantPath(a);tenantPath(b);const c=JSON.parse(fs.readFileSync(path.join(tenantPath(b),'compose.json'))),checks=[];
for(const name of Object.keys(c.services).filter(n=>n.endsWith('-db'))){try{await checkDatabasePair(a,b,name);checks.push({name:name+': senha de outra empresa recusada nos dois sentidos',ok:true});console.log(name+': TCP com senha propria e rejeicao estrangeira OK');}catch(e){checks.push({name:name+': senha de outra empresa recusada nos dois sentidos',ok:false,error:e.message});console.log(name+': FALHOU');process.exitCode=1;}}
atomicJSON(path.join(RUNTIME,'isolation-lab','database-checks.json'),{at:new Date().toISOString(),tenants:[a,b],checks,scope:'Conexao TCP ao IP da interface Docker do banco; nao utiliza regra de trust de loopback'});
