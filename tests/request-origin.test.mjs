import test from 'node:test';
import assert from 'node:assert/strict';
import {requestOriginAllowed} from '../request-origin.mjs';
test('origem reescrita exige proxy local exato e fetch same-origin, sem aceitar cabeçalhos encaminhados',()=>{
  const config={origin:'https://example-8100.app.github.dev',proxyHost:'localhost:8100'};
  const req={headers:{host:config.proxyHost,origin:'https://localhost:8100','sec-fetch-site':'same-origin'},socket:{remoteAddress:'127.0.0.1'}};
  assert.equal(requestOriginAllowed(req,config),true);
  for(const change of [{origin:'https://attacker.invalid'},{origin:'http://localhost:8100'},{origin:'https://localhost:8099'},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'},{'sec-fetch-site':undefined},{host:'attacker.invalid'}])assert.equal(requestOriginAllowed({...req,headers:{...req.headers,...change}},config),false);
  assert.equal(requestOriginAllowed({...req,socket:{remoteAddress:'192.0.2.1'}},config),false);
  assert.equal(requestOriginAllowed(req,{origin:config.origin}),false);
  assert.equal(requestOriginAllowed(req,{...config,proxyHost:'localhost:99999'}),false);
  assert.equal(requestOriginAllowed(req,{...config,origin:'http://example-8100.app.github.dev'}),false);
  assert.equal(requestOriginAllowed({...req,headers:{origin:undefined}},{}),false);
  assert.equal(requestOriginAllowed({...req,headers:{host:'attacker.invalid',origin:'https://attacker.invalid','x-forwarded-host':new URL(config.origin).host,'x-forwarded-origin':config.origin}},config),false);
  assert.equal(requestOriginAllowed({...req,headers:{host:new URL(config.origin).host,origin:config.origin}},config),true);
});
