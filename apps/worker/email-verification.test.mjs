import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { accountResponse, sessionUser } from './accounts.mjs';
import { verificationResponse } from './email-verification.mjs';

test('verification uses expiring single-use links scoped to the requesting account', async () => {
  const db = new PGlite();
  const site = 'https://watch.example.test';
  const req = (action, body, cookie = '', origin = site) => new Request(site + '/v1/account/' + action, {
    method: 'POST', headers: { cookie, origin },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const links = [];
  const send = (email, link, purpose) => {
    assert.equal(email, 'viewer@example.test');
    assert.equal(purpose, 'verify');
    links.push(new URLSearchParams(new URL(link).hash.slice(1)).get('verify'));
  };
  const start = (cookie, mail = send) => verificationResponse(db, req('request-verification', null, cookie), mail);
  const verify = token => verificationResponse(db, req('verify-email', { token }), send);
  try {
    await db.exec(await readFile(new URL('../../db/catalog.sql', import.meta.url), 'utf8'));
    const account = await accountResponse(db, req('register', {
      email: 'viewer@example.test', password: 'fixture-password',
    }));
    const cookie = account.headers.get('set-cookie').split(';')[0];
    assert.equal((await start()).status, 401);
    assert.equal((await verificationResponse(db, req('request-verification', null, cookie, 'https://other.test'), send)).status, 403);
    assert.equal((await start(cookie, () => { throw new Error('Delivery failed'); })).status, 503);
    assert.equal((await start(cookie)).status, 202);
    await db.query("UPDATE email_verification SET expires_at = now() - interval '1 second'");
    assert.equal((await verify(links[0])).status, 400);
    assert.equal((await start(cookie)).status, 202);
    assert.equal((await start(cookie)).status, 202);
    assert.equal((await verify(links[1])).status, 400);
    assert.equal((await verify(links[2])).status, 200);
    assert.equal((await verify(links[2])).status, 400);
    assert.ok((await sessionUser(db, cookie)).email_verified_at);
    assert.equal((await start(cookie)).status, 200);
    assert.equal(links.length, 3);
  } finally {
    await db.close();
  }
});
