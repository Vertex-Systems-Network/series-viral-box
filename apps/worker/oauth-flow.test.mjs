import assert from 'node:assert/strict';
import { migrateCatalog } from './migrate-catalog.mjs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from 'jose';
import { createAccountSession } from './accounts.mjs';
import { oauthResponse } from './oauth-flow.mjs';

test('OAuth start uses configured origin and callbacks consume browser-bound state once', async () => {
  const db = new PGlite();
  const env = { AUTH_PUBLIC_ORIGIN: 'https://watch.example.test', GOOGLE_CLIENT_SECRET: 'fixture' };
  const call = (path, cookie = '') => oauthResponse(db, new URL(path, env.AUTH_PUBLIC_ORIGIN),
    'GET', { headers: { cookie } }, env);
  try {
    await migrateCatalog(db);
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

test('exchanges signed provider fixtures and links only with an active initiating session', async () => {
  const db = new PGlite();
  const signing = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(signing.publicKey), kid: 'fixture-key' };
  const apple = await generateKeyPair('ES256', { extractable: true });
  const env = {
    AUTH_PUBLIC_ORIGIN: 'https://watch.example.test',
    GOOGLE_CLIENT_SECRET: 'fixture',
    APPLE_PRIVATE_KEY: await exportPKCS8(apple.privateKey),
  };
  const issuer = { google: 'https://accounts.google.com', apple: 'https://appleid.apple.com' };
  const viewers = {
    one: { id: '00000000-0000-4000-8000-000000000001', email: 'one@example.test' },
    two: { id: '00000000-0000-4000-8000-000000000002', email: 'two@example.test' },
  };
  let tokenResponse;
  let exchangeCount = 0;
  const transport = async (url, options) => {
    if (String(url).endsWith('/certs') || String(url).endsWith('/keys')) return Response.json({ keys: [jwk] });
    exchangeCount++;
    assert.equal(options.method, 'POST');
    assert.equal(options.body.get('grant_type'), 'authorization_code');
    assert.equal(options.body.get('code'), 'fixture-code');
    return tokenResponse;
  };
  const call = (path, method = 'GET', headers = {}, body = '') =>
    oauthResponse(db, new URL(path, env.AUTH_PUBLIC_ORIGIN), method, {
      headers,
      async *[Symbol.asyncIterator]() { yield Buffer.from(body); },
    }, env, transport);
  const cookieFrom = response => response.headers.get('set-cookie').split(';')[0];

  async function begin(provider, session) {
    const response = session
      ? await call('/v1/oauth/' + provider + '/link', 'POST', { cookie: session, origin: env.AUTH_PUBLIC_ORIGIN })
      : await call('/v1/oauth/' + provider + '/start');
    assert.equal(response.status, 302);
    const params = new URL(response.headers.get('location')).searchParams;
    return { params, cookie: cookieFrom(response) };
  }

  async function finish(provider, attempt, subject, email, options = {}) {
    const path = '/v1/oauth/' + provider + '/callback';
    const params = new URLSearchParams({ code: 'fixture-code', state: attempt.params.get('state') });
    tokenResponse = options.rejectExchange ? new Response(null, { status: 401 }) :
      Response.json({ id_token: await new SignJWT({
        email, email_verified: true,
        nonce: options.nonce ?? attempt.params.get('nonce'),
      }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
        .setIssuer(issuer[provider]).setAudience('fixture-client')
        .setSubject(subject).setExpirationTime('5m').sign(signing.privateKey) });
    const cookie = options.session ? attempt.cookie + '; ' + options.session : attempt.cookie;
    return provider === 'apple' ? call(path, 'POST', { cookie }, params.toString())
      : call(path + '?' + params, 'GET', { cookie });
  }

  try {
    await migrateCatalog(db);
    await db.query(`INSERT INTO oauth_provider_settings (provider, enabled, client_id, team_id, key_id)
      VALUES ('google', true, 'fixture-client', null, null), ('apple', true, 'fixture-client', 'team', 'test-key')`);
    for (const viewer of Object.values(viewers)) {
      await db.query('INSERT INTO app_user (id, email) VALUES ($1,$2)', [viewer.id, viewer.email]);
    }
    const one = cookieFrom(await createAccountSession(db, viewers.one, true));
    const two = cookieFrom(await createAccountSession(db, viewers.two, true));

    const linkPath = '/v1/oauth/google/link';
    assert.equal((await call(linkPath)).status, 405);
    assert.equal((await call(linkPath, 'POST', { cookie: one, origin: 'https://other.example.test' })).status, 403);
    assert.equal((await call(linkPath, 'POST', { origin: env.AUTH_PUBLIC_ORIGIN })).status, 401);

    const failed = await finish('google', await begin('google'), 'unlinked', 'new@example.test', { rejectExchange: true });
    assert.equal(failed.headers.get('location'), '/catalog?oauth=failed');
    const badNonce = await finish('google', await begin('google'), 'unlinked', 'new@example.test', { nonce: 'wrong' });
    assert.equal(badNonce.headers.get('location'), '/catalog?oauth=failed');
    assert.deepEqual((await db.query('SELECT * FROM oauth_identity')).rows, []);

    const emailMatch = await finish('google', await begin('google'), 'unlinked', viewers.one.email);
    assert.equal(emailMatch.headers.get('location'), '/catalog?oauth=failed');
    const newViewer = await finish('google', await begin('google'), 'new-viewer', 'new@example.test');
    assert.equal(newViewer.headers.get('location'), '/catalog?oauth=ok');
    assert.ok(newViewer.headers.getSetCookie().some(cookie => cookie.startsWith('svb_session=')));

    const googleAttempt = await begin('google', one);
    const linked = await finish('google', googleAttempt, 'linked-google', 'other@example.test', { session: one });
    assert.equal(linked.headers.get('location'), '/catalog?oauth=linked');
    assert.ok(linked.headers.getSetCookie().every(cookie => !cookie.startsWith('svb_session=')));
    assert.equal((await finish('google', googleAttempt, 'replay', 'other@example.test')).status, 400);
    const collision = await finish('google', await begin('google', two), 'linked-google', 'other@example.test');
    assert.equal(collision.headers.get('location'), '/catalog?oauth=link-failed');

    const appleAttempt = await begin('apple', one);
    assert.equal(appleAttempt.params.get('response_mode'), 'form_post');
    const appleLinked = await finish('apple', appleAttempt, 'linked-apple', 'relay@example.test');
    assert.equal(appleLinked.headers.get('location'), '/catalog?oauth=linked');

    const revoked = await begin('google', two);
    await db.query('DELETE FROM app_session WHERE user_id = $1', [viewers.two.id]);
    const before = exchangeCount;
    assert.equal((await finish('google', revoked, 'revoked', 'other@example.test')).status, 400);
    assert.equal(exchangeCount, before);

    const { rows } = await db.query(
      "SELECT provider, subject, user_id FROM oauth_identity WHERE subject LIKE 'linked-%' ORDER BY provider");
    assert.deepEqual(rows, [
      { provider: 'apple', subject: 'linked-apple', user_id: viewers.one.id },
      { provider: 'google', subject: 'linked-google', user_id: viewers.one.id },
    ]);
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM app_user')).rows[0].count, 3);
  } finally {
    await db.close();
  }
});
