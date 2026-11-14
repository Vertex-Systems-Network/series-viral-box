import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { oauthResponse } from './oauth-flow.mjs';

test('OAuth start uses configured origin and callbacks consume browser-bound state once', async () => {
  const db = new PGlite();
  const env = { AUTH_PUBLIC_ORIGIN: 'https://watch.example.test', GOOGLE_CLIENT_SECRET: 'fixture' };
  const call = (path, cookie = '') => oauthResponse(db, new URL(path, env.AUTH_PUBLIC_ORIGIN),
    'GET', { headers: { cookie } }, env);
  try {
    await db.exec(await readFile(new URL('../../db/catalog.sql', import.meta.url), 'utf8'));
    assert.equal((await call('/v1/oauth/google/start')).status, 404);
    await db.query("INSERT INTO oauth_provider_settings (provider, enabled, client_id) VALUES ('google', true, 'fixture')");
    assert.deepEqual(await (await call('/v1/oauth/providers')).json(), { providers: ['google'] });
    const before = await call('/v1/oauth/google/start');
    assert.equal(before.status, 302);
    const target = new URL(before.headers.get('location'));
    assert.equal(target.origin, 'https://accounts.google.com');
    assert.equal(target.searchParams.get('redirect_uri'), env.AUTH_PUBLIC_ORIGIN + '/v1/oauth/google/callback');
    assert.match(target.searchParams.get('nonce'), /^[a-f0-9]{64}$/);
    const cookie = before.headers.get('set-cookie').split(';')[0];
    const callback = '/v1/oauth/google/callback?error=access_denied&state=' + target.searchParams.get('state');
    assert.equal((await call(callback)).status, 400);
    assert.equal((await call(callback, cookie.replace(/=.*/, '=' + '0'.repeat(64)))).status, 400);
    const canceled = await call(callback, cookie);
    assert.equal(canceled.status, 303);
    assert.equal(canceled.headers.get('location'), '/catalog?oauth=failed');
    assert.equal((await call(callback, cookie)).status, 400);
  } finally {
    await db.close();
  }
});
