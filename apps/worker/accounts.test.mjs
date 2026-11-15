import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { accountResponse, sessionUser } from './accounts.mjs';

test('registration, session, logout, and disabled login', async () => {
  const db = new PGlite();
  const site = 'https://example.test';
  const body = JSON.stringify({ email: 'Test@example.test', password: 'fixture-password' });
  const action = (name, cookie = '', origin = site) => accountResponse(db, new Request(
    site + '/v1/account/' + name, { method: 'POST', headers: { origin, cookie }, body },
  ));
  try {
    await db.exec(await readFile(new URL('../../db/catalog.sql', import.meta.url), 'utf8'));
    assert.equal((await action('register', '', 'https://other.test')).status, 403);
    const created = await action('register');
    assert.equal(created.status, 200);
    const header = created.headers.get('set-cookie');
    assert.match(header, /HttpOnly.*Secure/);
    const cookie = header.split(';')[0];
    assert.equal((await sessionUser(db, cookie)).email, 'test@example.test');
    assert.equal((await action('register')).status, 409);
    assert.equal((await action('logout', cookie)).status, 200);
    assert.equal(await sessionUser(db, cookie), null);
    assert.equal((await action('login')).status, 200);
    await db.query('UPDATE app_user SET disabled = true');
    assert.equal((await action('login')).status, 401);
  } finally {
    await db.close();
  }
});

test('signed-in controls revoke sibling sessions and change only the current account password', async () => {
  const db = new PGlite();
  const origin = 'https://watch.example.test';
  const email = 'settings@example.test';
  const password = 'original-password';
  const call = (action, body, cookie, source = origin) => accountResponse(db,
    new Request(origin + '/v1/account/' + action, {
      method: action === 'session' ? 'GET' : 'POST',
      headers: { Origin: source, ...(cookie ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
  const cookieFrom = response => response.headers.get('set-cookie').split(';')[0];
  const userFor = async cookie => (await (await call('session', null, cookie)).json()).user;
  try {
    await db.exec(await readFile(new URL('../../db/catalog.sql', import.meta.url), 'utf8'));
    const active = cookieFrom(await call('register', { email, password }));
    const sibling = cookieFrom(await call('login', { email, password }));
    const other = cookieFrom(await call('register', { email: 'other@example.test', password }));
    assert.equal((await call('revoke-other-sessions', null)).status, 401);
    assert.equal((await call('revoke-other-sessions', null, active, 'https://different.example.test')).status, 403);
    assert.deepEqual(await (await call('revoke-other-sessions', null, active)).json(), { revoked: 1 });
    assert.equal(await userFor(sibling), null);
    assert.ok(await userFor(other));

    const later = cookieFrom(await call('login', { email, password }));
    await db.query(`INSERT INTO password_reset (user_id, token_hash, expires_at)
      SELECT id, 'fixture-reset-hash', now() + interval '1 minute' FROM app_user WHERE email = $1`, [email]);
    const changed = { currentPassword: password, password: 'changed-password' };
    assert.equal((await call('change-password', { ...changed, currentPassword: 'invalid-password' }, active)).status, 400);
    assert.ok(await userFor(later));
    assert.deepEqual(await (await call('change-password', changed, active)).json(), { changed: true });
    assert.equal(await userFor(later), null);
    assert.equal((await userFor(active)).email, email);
    assert.ok(await userFor(other));
    assert.equal((await db.query('SELECT * FROM password_reset')).rows.length, 0);
    assert.equal((await call('login', { email, password })).status, 401);
    assert.equal((await call('login', { email, password: changed.password })).status, 200);
  } finally {
    await db.close();
  }
});
