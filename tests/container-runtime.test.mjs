import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.VW_RUNTIME_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'cw-podman-'));
process.env.CW_CONTAINER_ENGINE='podman';
process.env.CW_COMPOSE_BIN='/project/compose';
process.env.DOCKER_HOST='unix:///run/user/1000/podman/podman.sock';
const {normalizeEngineInfo,containerCommand}=await import('../container-runtime.mjs');
test('Podman preserves storage identity and resource checks',()=>{
 const info=normalizeEngineInfo({host:{os:'linux',hostname:'host',memTotal:8000000000,cpus:4,distribution:{distribution:'fedora'}},store:{graphRoot:'/data/podman',graphDriverName:'overlay'}});
 assert.equal(info.OSType,'linux');assert.equal(info.DockerRootDir,'/data/podman');assert.equal(info.ID,'podman:host:/data/podman');assert.equal(info.NCPU,4);
 assert.throws(()=>normalizeEngineInfo({}));
});
test('Compose uses the Podman socket and preserves arguments',()=>{
 const cli=containerCommand(['compose','--project-directory','/project','up','-d']);
 assert.equal(cli.command,'/project/compose');assert.equal(cli.env.DOCKER_HOST,process.env.DOCKER_HOST);assert.deepEqual(cli.args,['--project-directory','/project','up','-d']);
 assert.equal(containerCommand(['info']).command,'podman');
});

test('Podman Compose qualifies registries and labels bind mounts without changing volumes or credentials',async()=>{
 const {prepareCompose}=await import('../container-runtime.mjs');
 const original={services:{db:{image:'postgres:16-alpine',environment:{PASSWORD:'keep'},volumes:['db:/data']},app:{image:'vendor/app:1',volumes:['./config:/config:ro','/shared:/shared:ro,z',{type:'bind',source:'./file',target:'/file',read_only:true}]},remote:{image:'localhost:5000/custom:1'},digest:{image:'ghcr.io/vendor/app@sha256:abc'}},volumes:{db:{}}};
 const result=prepareCompose(original);
 assert.equal(result.services.db.image,'docker.io/library/postgres:16-alpine');assert.equal(result.services.app.image,'docker.io/vendor/app:1');
 assert.deepEqual(result.services.db.volumes,['db:/data']);assert.equal(result.services.db.environment.PASSWORD,'keep');
 assert.equal(result.services.app.volumes[0],'./config:/config:ro,Z');assert.equal(result.services.app.volumes[1],'/shared:/shared:ro,z');
 assert.equal(result.services.app.volumes[2].bind.selinux,'Z');assert.equal(result.services.app.volumes[2].read_only,true);
 assert.equal(result.services.remote.image,'localhost:5000/custom:1');assert.equal(result.services.digest.image,original.services.digest.image);
 assert.deepEqual(prepareCompose(result),result);assert.equal(original.services.db.image,'postgres:16-alpine');assert.equal(prepareCompose(original,'docker'),original);
});

test('Compose rejects network sockets and respects the supplied environment',()=>{
 assert.throws(()=>containerCommand(['compose','up'],{DOCKER_HOST:'tcp://example.com:2375'}),/Unix/);
 const cli=containerCommand(['compose','version'],{CW_COMPOSE_BIN:'/custom/compose',DOCKER_HOST:'unix:///tmp/podman.sock',COMPOSE_PARALLEL_LIMIT:'1'});
 assert.equal(cli.command,'/custom/compose');assert.equal(cli.env.COMPOSE_PARALLEL_LIMIT,'1');assert.equal(cli.env.DOCKER_HOST,'unix:///tmp/podman.sock');
});
