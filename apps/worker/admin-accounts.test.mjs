import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { adminAccountsResponse } from './admin-accounts.mjs';
import { createAccountSession, sessionUser } from './accounts.mjs';
import { migrateCatalog } from './migrate-catalog.mjs';

test('admin suspends and restores viewers with atomic audit and session revocation', async () => {
  const db = new PGlite();
  const token = 'fixture-admin-token';
  const viewer = { id: '00000000-0000-4000-8000-000000000001', email: 'viewer@example.test' };
  const call = (path, method = 'GET', supplied = token) => adminAccountsResponse(db,
    new Request('http://localhost' + path, { method, headers: { Authorization: 'Bearer ' + supplied } }),
    token, 'fixture-operator');
  try {
    await migrateCatalog(db);
    await db.query('INSERT INTO app_user (id, email) VALUES ($1,$2)', [viewer.id, viewer.email]);
    const session = await createAccountSession(db, viewer, false);
    const cookie = session.headers.get('set-cookie').split(';')[0];
    const patch = '/admin/users?id=' + viewer.id + '&disabled=';
    const audit = '/admin/user-audit?id=' + viewer.id;

    assert.equal((await call(audit, 'GET', 'invalid')).status, 401);
    assert.equal((await call(patch + 'true', 'PATCH', 'invalid')).status, 401);
    assert.equal((await call('/admin/users?after=bad')).status, 400);
    assert.equal((await call('/admin/user-audit?id=unknown')).status, 400);
    const search = await (await call('/admin/users?email=VIEWER%40EXAMPLE.TEST')).json();
    assert.equal(search.users[0].id, viewer.id);
    assert.ok(await sessionUser(db, cookie));

    await db.exec('ALTER TABLE account_support_event ADD CONSTRAINT reject_all CHECK (false)');
    await assert.rejects(call(patch + 'true', 'PATCH'), /reject_all/);
    assert.ok(await sessionUser(db, cookie));
    await db.exec('ALTER TABLE account_support_event DROP CONSTRAINT reject_all');

    assert.equal((await (await call(patch + 'true', 'PATCH')).json()).users[0].disabled, true);
    assert.equal(await sessionUser(db, cookie), null);
    assert.equal((await (await call(patch + 'false', 'PATCH')).json()).users[0].disabled, false);
    assert.equal(await sessionUser(db, cookie), null);
    const { events } = await (await call(audit)).json();
    assert.deepEqual(events.map(({ actor, action }) => [actor, action]),
      [['fixture-operator', 'restore'], ['fixture-operator', 'suspend']]);
    assert.equal(events.some(event => JSON.stringify(event).includes(token)), false);
  } finally {
    await db.close();
  }
});
