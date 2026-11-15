import { randomBytes } from 'node:crypto';
import { hashToken, passwordAccount, sessionUserByHash, validPassword } from './accounts.mjs';
import { fixtureDemoResponse } from './fixture-demo.mjs';
import { viewerLibraryResponse } from './viewer-library.mjs';

const reply = (data, status = 200, headers = {}) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const nativeHash = token => hashToken('native-fixture:' + token);
const loopbackHost = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/;
const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function createNativeFixtureRoutes(db, env, local) {
  let minute;
  let attempts = 0;
  return async (request, url) => {
    if (!url.pathname.startsWith('/v1/native/')) return null;
    if (env.ENABLE_NATIVE_FIXTURE !== '1' || env.ENABLE_FIXTURE_DEMO !== '1') return reply({ error: 'unavailable' }, 404);
    if (!loopback.has(request.socket.remoteAddress) ||
        !loopbackHost.test(request.headers.host ?? '') ||
        (env.AUTH_PUBLIC_ORIGIN && !loopbackHost.test(new URL(env.AUTH_PUBLIC_ORIGIN).host)) ||
        request.headers.forwarded || request.headers['x-forwarded-for'] ||
        request.headers.origin || request.headers.cookie || request.headers['sec-fetch-site']) {
      return reply({ error: 'fixture_transport_required' }, 403);
    }

    const { method } = request;
    const path = url.pathname.slice('/v1/native'.length);
    if (path === '/login') {
      if (method !== 'POST') return reply({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
      const now = Math.floor(Date.now() / 60000);
      if (now !== minute) { minute = now; attempts = 0; }
      if (++attempts > 10) return reply({ error: 'rate_limited' }, 429);
      const chunks = [];
      let byteLength = 0;
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        byteLength += chunk.length;
        if (byteLength > 4096) return reply({ error: 'body_too_large' }, 413, { Connection: 'close' });
        chunks.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks)); }
      catch { return reply({ error: 'invalid_credentials' }, 400); }
      const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
      if (!email || email.length > 254 || !validPassword(input?.password)) return reply({ error: 'invalid_credentials' }, 400);
      const account = await passwordAccount(db, email, input.password);
      if (!account) return reply({ error: 'invalid_credentials' }, 401);
      const token = randomBytes(32).toString('hex');
      const { rows: [session] } = await db.query(`WITH eligible AS (
          SELECT id FROM app_user WHERE id = $1 AND password_hash = $2 AND NOT disabled FOR UPDATE
        ) INSERT INTO app_session (token_hash, user_id, expires_at)
        SELECT $3, id, now() + interval '1 hour' FROM eligible RETURNING expires_at`,
      [account.id, account.password_hash, nativeHash(token)]);
      if (!session) return reply({ error: 'invalid_credentials' }, 401);
      return reply({ token, expiresAt: new Date(session.expires_at).toISOString(), user: { id: account.id, email: account.email } });
    }

    if (!['/session', '/logout', '/me/progress', '/me/bookmarks', '/fixture-playback'].includes(path)) {
      return reply({ error: 'not_found' }, 404);
    }
    const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.authorization ?? '')?.[1];
    const hash = token ? nativeHash(token) : null;
    const user = await sessionUserByHash(db, hash);
    if (!user) return reply({ error: 'login_required' }, 401);
    if (path === '/session') return method === 'GET' ? reply({ user }) : reply({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
    if (path === '/logout') {
      if (method !== 'POST') return reply({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
      await db.query('DELETE FROM app_session WHERE token_hash = $1', [hash]);
      return reply({ user: null });
    }
    const viewerUrl = new URL('/v1' + path + url.search, url.origin);
    if (path === '/fixture-playback') return fixtureDemoResponse(db, local, true, viewerUrl, method);
    return viewerLibraryResponse(db, request, undefined, { url: viewerUrl, user });
  };
}
