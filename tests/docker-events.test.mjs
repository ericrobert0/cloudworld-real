import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {ContainerEvents,DockerEventStream,projectContainers} from '../docker-events.mjs';
import {containerPhase,runtimeMonitoring} from '../monitoring.mjs';
const event=(action,project='vw-alpha',extra={})=>({Type:'container',Action:action,Actor:{Attributes:{name:project+'-chat-1','com.docker.compose.project':project,...extra}}});
const row={Names:'vw-alpha-chat-1',State:'running',Status:'Up',Project:'vw-alpha'};

test('evento de encerramento mostra parando, confirma parada e expira sem inventar estado permanente',()=>{
  let now=1000;const tracker=new ContainerEvents({clock:()=>now,transitionMs:100});
  tracker.ingest(event('kill','vw-alpha',{signal:'HUP'}));assert.equal(containerPhase(tracker.decorate([row])[0]),'running');
  tracker.ingest(event('kill','vw-alpha',{signal:'15'}));const pending=tracker.decorate([row]);
  assert.equal(containerPhase(pending[0]),'stopping');
  now+=101;assert.equal(containerPhase(tracker.decorate(pending)[0]),'running');
  tracker.ingest(event('kill','vw-alpha',{signal:'SIGTERM'}));tracker.ingest(event('die'));
  assert.equal(containerPhase(tracker.decorate([{...row,State:'exited',Status:'Exited (0)'}])[0]),'stopped');
  tracker.ingest(event('kill','vw-alpha',{signal:'15'}));tracker.disconnect();
  assert.equal(containerPhase(tracker.decorate(pending)[0]),'running');
});

test('historico e containers usam projeto Compose exato, separam prefixos parecidos e omitem labels secretos',()=>{
  const tracker=new ContainerEvents({limit:2});
  tracker.ingest(event('start','vw-alpha',{password:'SECRET'}));
  tracker.ingest(event('kill','vw-alpha-other',{signal:'15',token:'SECRET'}));
  tracker.ingest(event('die','vw-alpha-other'));assert.equal(tracker.recent.length,2);
  assert.equal(tracker.ingest({...event('start'),Type:'image'}),false);
  assert.equal(tracker.ingest(event('start','unmanaged')),false);
  const containers=projectContainers([{...row,Labels:'com.docker.compose.project=vw-alpha,password=SECRET'},{...row,Names:'vw-alpha-other-chat-1',Labels:'com.docker.compose.project=vw-alpha-other'},{...row,Labels:''}]);
  assert.equal(containers.length,2);assert.ok(!JSON.stringify(containers).includes('SECRET'));
  const result=runtimeMonitoring({project:'vw-alpha'},{containers,events:tracker.status()});
  assert.equal(result.containers.length,1);assert.equal(result.events.length,0);
  assert.ok(!JSON.stringify(tracker.status()).includes('SECRET'));
});

test('coleta aceita JSON dividido, mantem um leitor e fecha sem reconectar apos encerramento',()=>{
  const children=[];
  const launch=()=>{
    const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
    child.kill=()=>{child.emit('close',0);return true;};children.push(child);return child;
  };
  const watcher=new DockerEventStream({launch});watcher.start();watcher.start();assert.equal(children.length,1);
  const json=JSON.stringify(event('kill','vw-alpha',{signal:'15'}));
  children[0].stdout.write(json.slice(0,20));assert.equal(watcher.tracker.recent.length,0);
  children[0].stdout.write(json.slice(20)+'\n');assert.equal(watcher.tracker.recent.length,1);
  watcher.close();assert.equal(watcher.child,null);assert.equal(watcher.timer,null);
});

test('linha excessiva e falha do leitor nao vazam dados nem criam reconexoes duplicadas',()=>{
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{child.emit('close',0);return true;};
  const watcher=new DockerEventStream({launch:()=>child});watcher.start();
  child.stderr.write('SECRET upstream');child.stdout.write('x'.repeat(65537));
  const retry=watcher.timer;assert.ok(retry);child.emit('error',Error('SECRET'));assert.equal(watcher.timer,retry);
  assert.ok(!JSON.stringify(watcher.tracker.status()).includes('SECRET'));watcher.close();
});
