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
