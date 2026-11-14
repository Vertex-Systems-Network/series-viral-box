import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { accountResponse, sessionUser } from './accounts.mjs';
import { recoveryResponse } from './recovery.mjs';

test('password recovery hides account existence, replaces links and revokes sessions', async () => {
  const db = new PGlite();
  const site = 'https://watch.example.test';
  const email = 'viewer@example.test';
  const request = (action, data) => new Request(site + '/v1/account/' + action, {
    method: 'POST', headers: { Origin: site }, body: JSON.stringify(data),
  });
  const sent = [];
  const deliver = (recipient, link) => { sent.push({ recipient, token: new URLSearchParams(new URL(link).hash.slice(1)).get('reset') }); };
  const recover = (action, data) => recoveryResponse(db, request(action, data), deliver);
  try {
    await db.exec(await readFile(new URL('../../db/catalog.sql', import.meta.url), 'utf8'));
    const old = 'old-password-long';
    const created = await accountResponse(db, request('register', { email, password: old }));
    const cookie = created.headers.get('set-cookie').split(';')[0];
    const unknown = await recover('forgot-password', { email: 'unknown@example.test' });
    const first = await recover('forgot-password', { email });
    assert.equal(unknown.status, 202);
    assert.equal(await unknown.text(), await first.text());
    await recover('forgot-password', { email });
    assert.equal(sent.length, 2);
    const reset = token => recover('reset-password', { token, password: 'new-password-long' });
    assert.equal((await reset(sent[0].token)).status, 400);
    assert.equal((await reset(sent[1].token)).status, 200);
    assert.equal((await reset(sent[1].token)).status, 400);
    assert.equal(await sessionUser(db, cookie), null);
    assert.equal((await accountResponse(db, request('login', { email, password: old }))).status, 401);
    assert.equal((await accountResponse(db, request('login', { email, password: 'new-password-long' }))).status, 200);
    await recover('forgot-password', { email });
    await db.query("UPDATE password_reset SET expires_at = now() - interval '1 second'");
    assert.equal((await reset(sent.at(-1).token)).status, 400);
  } finally {
    await db.close();
  }
});
