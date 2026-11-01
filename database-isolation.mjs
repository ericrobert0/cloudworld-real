import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {tenantPath} from './infra.mjs';
const load=id=>JSON.parse(fs.readFileSync(path.join(tenantPath(id),'compose.json')));
function run(args,input=''){return new Promise((resolve,reject)=>{const p=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',code=>resolve({code,out,err}));p.stdin.end(input);});}
export async function checkDatabasePair(a,b,name){
  tenantPath(a);tenantPath(b);
  for(const [from,to] of [[a,b],[b,a]]){
    const src=load(from).services[name],dst=load(to).services[name],pg=!!dst.environment.POSTGRES_DB,field=pg?'POSTGRES_PASSWORD':'MARIADB_ROOT_PASSWORD';assert.notEqual(src.environment[field],dst.environment[field]);
    const container='vw-'+to+'-'+name+'-1',inspection=await run(['inspect',container]);assert.equal(inspection.code,0);
    const ip=Object.values(JSON.parse(inspection.out)[0].NetworkSettings.Networks)[0].IPAddress;assert.ok(ip&&!ip.startsWith('127.'));
    const command=pg?'IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql -h "$1" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -w -tAc "SELECT 1"':'IFS= read -r MYSQL_PWD; export MYSQL_PWD; exec mariadb -h "$1" -uroot -N -e "SELECT 1"';
    const args=['exec','-i',container,'sh','-c',command,'sh',ip];
    const good=await run(args,dst.environment[field]+'\n');assert.equal(good.code,0,'Senha propria nao autenticou');assert.equal(good.out.trim(),'1');
    const bad=await run(args,src.environment[field]+'\n');assert.notEqual(bad.code,0,'Senha estrangeira aceita por TCP');assert.match(bad.err,/password authentication failed|Access denied/i);
  }
}
