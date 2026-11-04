import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectHttpsTarget } from '../https-check.mjs';

test('HTTPS rejects failed certificates and external login redirects without forwarding credentials', async () => {
  const target = ['portal', 'https://portal.example.test', [200, 302]];
  const redirect = await inspectHttpsTarget(target, async (_, options) => {
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers, undefined);
    return new Response(null, { status: 302, headers: { location: 'https://github.com/login' } });
  });
  assert.equal(redirect.ok, false);
  const certificate = await inspectHttpsTarget(target, async () => {
    throw Object.assign(Error('private diagnostic'), { cause: { code: 'CERT_HAS_EXPIRED' } });
  });
  assert.equal(certificate.ok, false);
  assert.equal(certificate.error, 'CERT_HAS_EXPIRED');
  assert.ok(!JSON.stringify(certificate).includes('private diagnostic'));
});

test('HTTPS accepts same-origin login and requires refusal on private routes', async () => {
  const transport = async () => new Response(null, { status: 302, headers: { location: '/login' } });
  assert.equal((await inspectHttpsTarget(['login', 'https://example.test', [200, 302]], transport)).ok, true);
  assert.equal((await inspectHttpsTarget(['private', 'https://example.test/api', [401, 403]], transport)).ok, false);
  assert.equal((await inspectHttpsTarget(['private', 'https://example.test/api', [401, 403]], async () => new Response(null, { status: 401 }))).ok, true);
  let called = false;
  assert.equal((await inspectHttpsTarget(['invalid', 'http://example.test', [200]], async () => { called = true; })).ok, false);
  assert.equal(called, false);
});
