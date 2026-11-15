import { createViewerRoutes } from './viewer-routes.mjs';
import { createServer } from 'node:http';
import { resolveFixtureGrant } from './fixture-grants.mjs';
import { serveFixtureWatch } from './fixture-watch-routes.mjs';
import { catalogResponse } from './catalog-api.mjs';
import { adminAccountsResponse } from './admin-accounts.mjs';
import { oauthSettingsResponse } from './oauth-settings.mjs';
import pg from 'pg';
import { handleMediaSettings } from './media-settings.mjs';

const { DATABASE_URL, MEDIA_ADMIN_TOKEN, MEDIA_ADMIN_PORT = '3101' } = process.env;
if (!DATABASE_URL || !MEDIA_ADMIN_TOKEN) throw new Error('Set DATABASE_URL and MEDIA_ADMIN_TOKEN');
const db = new pg.Pool({ connectionString: DATABASE_URL });
const { handleViewer, local } = createViewerRoutes(db, {
  localOrigin: () => 'http://127.0.0.1:' + server.address().port,
});
const port = Number(MEDIA_ADMIN_PORT);
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, 'http://localhost');
    if (['/admin/users', '/admin/user-audit'].includes(url.pathname)) {
      const request = new Request(url, { method: incoming.method, headers: incoming.headers });
      const response = await adminAccountsResponse(db, request, MEDIA_ADMIN_TOKEN, process.env.MEDIA_ADMIN_ACTOR);
      return outgoing.writeHead(response.status, Object.fromEntries(response.headers)).end(await response.text());
    }
    if (await handleViewer(incoming, outgoing, url)) return;
    const catalog = await catalogResponse(db, url, incoming.method);
    if (catalog) {
      outgoing.writeHead(catalog.status, Object.fromEntries(catalog.headers));
      return outgoing.end(Buffer.from(await catalog.arrayBuffer()));
    }
    if (await serveFixtureWatch(incoming, outgoing, url.pathname, Boolean(local))) return;
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
