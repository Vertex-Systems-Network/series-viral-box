import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { oauthSettingsResponse } from './oauth-settings.mjs';

test('OAuth admin keeps providers independent and excludes secrets from settings', async () => {
  const db = new PGlite();
  const env = { GOOGLE_CLIENT_SECRET: 'google-secret', APPLE_PRIVATE_KEY: 'apple-secret' };
  const call = (input, authorization = 'Bearer admin', credentials = env) => oauthSettingsResponse(db,
    new Request('http://localhost/admin/oauth-settings', {
      method: input ? 'PUT' : 'GET', headers: { authorization },
      ...(input ? { body: JSON.stringify(input) } : {}),
    }), 'admin', credentials);
  const google = { provider: 'google', enabled: true, clientId: 'google.example' };
  const apple = { provider: 'apple', enabled: true, clientId: 'apple.example', teamId: 'TEAM', keyId: 'KEY' };
  try {
    await db.exec(await readFile(new URL('../../db/catalog.sql', import.meta.url), 'utf8'));
    assert.equal((await call(google, 'Bearer bad')).status, 401);
    assert.equal((await call(google, 'Bearer admin', {})).status, 400);
    assert.equal((await call({ ...apple, keyId: null })).status, 400);
    assert.equal((await call({ ...google, secret: 'should-not-persist' })).status, 400);
    assert.equal((await call(google)).status, 200);
    assert.equal((await call(apple)).status, 200);
    assert.equal((await call({ ...google, enabled: false })).status, 200);
    const payload = await (await call()).text();
    assert.doesNotMatch(payload, /google-secret|apple-secret/);
    assert.deepEqual(JSON.parse(payload).providers.map(row => [row.provider, row.enabled]),
      [['google', false], ['apple', true]]);
  } finally {
    await db.close();
  }
});
