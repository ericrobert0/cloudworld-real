import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile,spawnSync} from 'node:child_process';
import {promisify} from 'node:util';
import {dockerStatusArgs,projectContainers} from '../docker-events.mjs';

test('CLI real consulta status sem calcular tamanho nem transportar labels privados',async t=>{
  const version=spawnSync('docker',['--version'],{windowsHide:true,encoding:'utf8'});
  if(version.status!==0||/podman/i.test(version.stdout||'')){t.skip('Requer Docker CLI nativo: o daemon simulado nao implementa a API Libpod.');return;}
  const requests=[];
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');requests.push(url);
    res.setHeader('API-Version','1.44');res.setHeader('OSType','linux');
    if(url.pathname==='/_ping'){res.end('OK');return;}
    if(url.pathname.endsWith('/containers/json')){
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify([{
        Id:'a'.repeat(64),Names:['/vw-alpha-chat-1'],Image:'chatwoot/chatwoot:tested',ImageID:'sha256:'+'b'.repeat(64),
        Command:'private-command',Created:1700000000,State:'running',Status:'Up 1 minute',Ports:[],Mounts:[],
        Labels:{'com.docker.compose.project':'vw-alpha',password:'SECRET_NOT_FOR_PANEL'}
      }]));return;
    }
    res.writeHead(404);res.end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const config=fs.mkdtempSync(path.join(os.tmpdir(),'cw-cli-status-'));
  try{
    const env={...process.env,DOCKER_CONFIG:config};
    for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH','DOCKER_API_VERSION'])delete env[key];
    // Reproduce the previous template against this tiny fake daemon only.
    // Never benchmark a costly filesystem scan against customer containers.
    await promisify(execFile)('docker',['--host','tcp://127.0.0.1:'+server.address().port,'ps','-a','--format','{{json .}}'],{env,timeout:15000,windowsHide:true,maxBuffer:65536});
    const legacy=requests.find(url=>url.pathname.endsWith('/containers/json'));
    requests.length=0;
    const {stdout}=await promisify(execFile)('docker',['--host','tcp://127.0.0.1:'+server.address().port,...dockerStatusArgs()],{env,timeout:15000,windowsHide:true,maxBuffer:65536});
    const query=requests.find(url=>url.pathname.endsWith('/containers/json'));
    assert.ok(query);assert.notEqual(query.searchParams.get('size'),'1');assert.notEqual(query.searchParams.get('size'),'true');
    assert.equal(query.searchParams.get('all'),'1');assert.match(query.searchParams.get('filters'),/com\.docker\.compose\.project/);
    assert.ok(!stdout.includes('SECRET_NOT_FOR_PANEL'));assert.ok(!stdout.includes('private-command'));
    const rows=projectContainers(stdout.trim().split('\n').map(line=>JSON.parse(line)));
    assert.equal(rows.length,1);assert.equal(rows[0].Project,'vw-alpha');assert.equal(rows[0].State,'running');
    t.diagnostic('JSON integral solicitou tamanho: '+(['1','true'].includes(legacy?.searchParams.get('size'))?'sim':'nao nesta versao')+'; consulta CloudWorld: nao.');
  }finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    assert.equal(path.dirname(path.resolve(config)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(config).startsWith('cw-cli-status-'));
    assert.equal(fs.lstatSync(config).isSymbolicLink(),false);
    fs.rmSync(config,{recursive:true,force:true});
  }
});
