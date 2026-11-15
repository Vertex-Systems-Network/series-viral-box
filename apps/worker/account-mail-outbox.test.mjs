import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { recoveryResponse } from './recovery.mjs';
import { verificationResponse } from './email-verification.mjs';
import { accountResponse } from './accounts.mjs';
import { createMailOutbox } from './account-mail-outbox.mjs';
import { migrateCatalog } from './migrate-catalog.mjs';

test('account mail persists atomically, retries and skips replaced or expired links', async () => {
  const db = new PGlite();
  const key = '77'.repeat(32);
  const outbox = createMailOutbox(key);
  const origin = 'https://watch.example.test';
  const email = 'viewer@example.test';
  const request = (path, body, cookie) => new Request(origin + '/v1/account/' + path, {
    method: 'POST', headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  const forgot = address => recoveryResponse(db, request('forgot-password', { email: address }), null, outbox);
  const messages = [];
  const deliver = (...message) => { messages.push(message); };
  const queue = 'SELECT token_hash, purpose, encrypted_payload, attempts FROM account_mail_outbox';
  try {
    await migrateCatalog(db);
    const registered = await accountResponse(db, request('register', { email, password: 'fixture-password' }));
    assert.equal(registered.status, 200);
    const cookie = registered.headers.get('set-cookie').split(';')[0];

    assert.deepEqual(await (await forgot('absent@example.test')).json(), { accepted: true });
    assert.deepEqual((await db.query(queue)).rows, []);
    await db.exec('ALTER TABLE account_mail_outbox ADD CONSTRAINT reject_all CHECK (false)');
    await assert.rejects(forgot(email), /reject_all/);
    assert.equal((await db.query('SELECT * FROM password_reset')).rows.length, 0);
    await db.exec('ALTER TABLE account_mail_outbox DROP CONSTRAINT reject_all');

    assert.equal((await forgot(email)).status, 202);
    assert.equal((await forgot(email)).status, 202);
    const jobs = (await db.query(queue)).rows;
    assert.equal(jobs.length, 2);
    assert.ok(jobs.every(job => job.purpose === 'reset' && !job.encrypted_payload.includes(email)));
    assert.equal(await createMailOutbox(key).dispatch(db, () => { throw new Error('Transient fixture failure'); }), 'retry');
    const pending = (await db.query(queue)).rows;
    assert.equal(pending.length, 1, 'The replaced link should be discarded');
    assert.equal(pending[0].attempts, 1);
    assert.equal(await outbox.dispatch(db, deliver), 'idle');
    await db.exec('UPDATE account_mail_outbox SET next_attempt_at = now()');
    assert.equal(await outbox.dispatch(db, deliver), 'delivered');

    const [deliveredEmail, resetLink, purpose] = messages[0];
    assert.equal(deliveredEmail, email);
    assert.equal(purpose, 'reset');
    const token = new URLSearchParams(new URL(resetLink).hash.slice(1)).get('reset');
    assert.ok(pending.every(job => !job.encrypted_payload.includes(token)));
    const verification = await verificationResponse(db, request('request-verification', {}, cookie), null, outbox);
    assert.equal(verification.status, 202);
    assert.equal(await outbox.dispatch(db, deliver), 'delivered');
    const verifyToken = new URLSearchParams(new URL(messages[1][1]).hash.slice(1)).get('verify');
    assert.equal(messages[1][2], 'verify');
    assert.equal((await verificationResponse(db, request('verify-email', { token: verifyToken }), null, outbox)).status, 200);

    const reset = await recoveryResponse(db, request('reset-password', {
      token, password: 'replacement-password',
    }), null, outbox);
    assert.equal(reset.status, 200);
    assert.equal((await forgot(email)).status, 202);
    await db.exec("UPDATE account_mail_outbox SET expires_at = now() - interval '1 second'");
    assert.equal(await outbox.dispatch(db, deliver), 'idle');
    assert.equal(messages.length, 2);
    assert.deepEqual((await db.query(queue)).rows, []);
  } finally {
    await db.close();
  }
});
