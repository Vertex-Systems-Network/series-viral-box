import { createServer } from 'node:http';
import { createLocalMedia } from './local-media.mjs';
import { resolveFixtureGrant } from './fixture-grants.mjs';
import { serveFixtureWatch } from './fixture-watch-routes.mjs';
import { catalogResponse } from './catalog-api.mjs';
import { fixtureDemoResponse } from './fixture-demo.mjs';
import { accountResponse, sessionUser } from './accounts.mjs';
import { oauthSettingsResponse } from './oauth-settings.mjs';
import { oauthResponse } from './oauth-flow.mjs';
import pg from 'pg';
import { handleMediaSettings } from './media-settings.mjs';

const { DATABASE_URL, MEDIA_ADMIN_TOKEN, MEDIA_ADMIN_PORT = '3101' } = process.env;
if (!DATABASE_URL || !MEDIA_ADMIN_TOKEN) throw new Error('Set DATABASE_URL and MEDIA_ADMIN_TOKEN');
const local = process.env.MEDIA_SIGNING_KEY
  ? createLocalMedia(process.env.FIXTURE_MEDIA_DIR ?? './var/media', process.env.MEDIA_SIGNING_KEY)
  : null;
const db = new pg.Pool({ connectionString: DATABASE_URL });

const attempts = new Map();
const port = Number(MEDIA_ADMIN_PORT);
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, 'http://localhost');
    if (process.env.AUTH_PUBLIC_ORIGIN && url.pathname.startsWith('/v1/oauth/') &&
        incoming.headers.host !== new URL(process.env.AUTH_PUBLIC_ORIGIN).host) {
      return outgoing.writeHead(403).end();
    }
    const oauth = await oauthResponse(db, url, incoming.method, incoming);
    if (oauth) {
      const headers = Object.fromEntries(oauth.headers);
      if (oauth.headers.has('set-cookie')) headers['set-cookie'] = oauth.headers.getSetCookie();
      return outgoing.writeHead(oauth.status, headers).end(await oauth.text());
    }
    if (url.pathname === '/admin/users') {
      const probe = new Request('http://localhost/admin/media-settings', {
        method: 'OPTIONS', headers: incoming.headers,
      });
      if ((await handleMediaSettings(probe, db, MEDIA_ADMIN_TOKEN)).status === 401) {
        return outgoing.writeHead(401).end();
      }
      let rows;
      if (incoming.method === 'GET') {
        const cursor = url.searchParams.get('after');
        if (cursor && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(cursor)) {
          return outgoing.writeHead(400).end();
        }
        ({ rows } = await db.query(
          'SELECT id, email, disabled, created_at FROM app_user WHERE ($1::uuid IS NULL OR id > $1) ORDER BY id LIMIT 101',
          [cursor],
        ));
      } else if (incoming.method === 'PATCH') {
        const id = url.searchParams.get('id');
        const disabled = url.searchParams.get('disabled');
        if (!id || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) ||
            !['true', 'false'].includes(disabled)) return outgoing.writeHead(400).end();
        ({ rows } = await db.query(
          `WITH updated AS (
             UPDATE app_user SET disabled = $2 WHERE id = $1 RETURNING id, email, disabled
           ), revoked AS (
             DELETE FROM app_session WHERE user_id IN (SELECT id FROM updated)
           ) SELECT * FROM updated`, [id, disabled === 'true'],
        ));
        if (!rows.length) return outgoing.writeHead(404).end();
      } else {
        return outgoing.writeHead(405, { Allow: 'GET, PATCH' }).end();
      }
      return outgoing.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify({ users: rows.slice(0, 100), nextCursor: rows.length > 100 ? rows[99].id : null }));
    }
    if (['/v1/account/session', '/v1/account/login', '/v1/account/register', '/v1/account/logout'].includes(url.pathname)) {
      const site = new URL(process.env.AUTH_PUBLIC_ORIGIN ?? 'http://127.0.0.1:' + server.address().port);
      if (incoming.headers.host !== site.host) return outgoing.writeHead(403).end();
      if (incoming.method === 'POST' && /\/(login|register)$/.test(url.pathname)) {
        const minute = Math.floor(Date.now() / 60000);
        const address = incoming.socket.remoteAddress;
        for (const [key, value] of attempts) if (value.minute !== minute) attempts.delete(key);
        const attempt = attempts.get(address) ?? { minute, count: 0 };
        attempts.set(address, attempt);
        if (++attempt.count > 10) return outgoing.writeHead(429).end();
      }
      const chunks = [];
      let length = 0;
      for await (const chunk of incoming.iterator({ destroyOnReturn: false })) {
        length += chunk.length;
        if (length > 4096) return outgoing.writeHead(413, { Connection: 'close' }).end();
        chunks.push(chunk);
      }
      const request = new Request(new URL(url.pathname, site), {
        method: incoming.method,
        headers: incoming.headers,
        ...(length && incoming.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
      });
      const account = await accountResponse(db, request, site.protocol === 'https:');
      outgoing.writeHead(account.status, Object.fromEntries(account.headers));
      return outgoing.end(Buffer.from(await account.arrayBuffer()));
    }
    if (url.pathname === '/v1/fixture-playback' && local && process.env.ENABLE_FIXTURE_DEMO === '1') {
      const site = process.env.AUTH_PUBLIC_ORIGIN ?? 'http://127.0.0.1:' + server.address().port;
      if (incoming.headers.origin !== site) return outgoing.writeHead(403).end();
      if (!await sessionUser(db, incoming.headers.cookie)) {
        return outgoing.writeHead(401, { 'Cache-Control': 'no-store' }).end();
      }
    }
    const catalog = await catalogResponse(db, url, incoming.method) ??
      await fixtureDemoResponse(db, local, process.env.ENABLE_FIXTURE_DEMO === '1', url, incoming.method);
    if (catalog) {
      outgoing.writeHead(catalog.status, Object.fromEntries(catalog.headers));
      outgoing.end(Buffer.from(await catalog.arrayBuffer()));
      return;
    }
    if (await serveFixtureWatch(incoming, outgoing, url.pathname, Boolean(local))) return;
    if (local && url.pathname.startsWith('/fixture-media/')) {
      await local.serve(incoming, outgoing, url.pathname);
      return;
    }
    if (local && url.pathname === '/admin/fixture-grant') {
      const authProbe = new Request('http://localhost/admin/media-settings', {
        method: 'OPTIONS', headers: incoming.headers,
      });
      if ((await handleMediaSettings(authProbe, db, MEDIA_ADMIN_TOKEN)).status === 401) {
        return outgoing.writeHead(401).end();
      }
      if (incoming.method !== 'POST') return outgoing.writeHead(405, { Allow: 'POST' }).end();
      const { titleId, locale, episodeId, kind } = Object.fromEntries(url.searchParams);
      if (!titleId || !locale || !episodeId || !['playback', 'download'].includes(kind)) {
        return outgoing.writeHead(400).end();
      }
      const grant = await resolveFixtureGrant(db, local, { titleId, locale, episodeId, kind });
      return outgoing.writeHead(grant ? 200 : 404, {
        'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      }).end(JSON.stringify(grant));
    }
    const oauthSettings = incoming.url === '/admin/oauth-settings';
    if (!oauthSettings && incoming.url !== '/admin/media-settings') {
      outgoing.writeHead(404).end();
      return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of incoming.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > 4096) {
        outgoing.writeHead(413, { Connection: 'close' }).end();
        return;
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const request = new Request('http://localhost' + incoming.url, {
      method: incoming.method,
      headers: incoming.headers,
      ...(body.length && !['GET', 'HEAD'].includes(incoming.method) ? { body } : {}),
    });
    const response = oauthSettings
      ? await oauthSettingsResponse(db, request, MEDIA_ADMIN_TOKEN)
      : await handleMediaSettings(request, db, MEDIA_ADMIN_TOKEN);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500).end();
  }
});
server.listen(port, '127.0.0.1');
