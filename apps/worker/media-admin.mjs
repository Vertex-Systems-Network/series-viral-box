import { createServer } from 'node:http';
import { createLocalMedia } from './local-media.mjs';
import { resolveFixtureGrant } from './fixture-grants.mjs';
import { serveFixtureWatch } from './fixture-watch-routes.mjs';
import { catalogResponse } from './catalog-api.mjs';
import pg from 'pg';
import { handleMediaSettings } from './media-settings.mjs';

const { DATABASE_URL, MEDIA_ADMIN_TOKEN, MEDIA_ADMIN_PORT = '3101' } = process.env;
if (!DATABASE_URL || !MEDIA_ADMIN_TOKEN) throw new Error('Set DATABASE_URL and MEDIA_ADMIN_TOKEN');
const local = process.env.MEDIA_SIGNING_KEY
  ? createLocalMedia(process.env.FIXTURE_MEDIA_DIR ?? './var/media', process.env.MEDIA_SIGNING_KEY)
  : null;
const db = new pg.Pool({ connectionString: DATABASE_URL });

const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, 'http://localhost');
    const catalog = await catalogResponse(db, url, incoming.method);
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
    if (incoming.url !== '/admin/media-settings') {
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
    const request = new Request('http://localhost/admin/media-settings', {
      method: incoming.method,
      headers: incoming.headers,
      ...(body.length && !['GET', 'HEAD'].includes(incoming.method) ? { body } : {}),
    });
    const response = await handleMediaSettings(request, db, MEDIA_ADMIN_TOKEN);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500).end();
  }
});
server.listen(Number(MEDIA_ADMIN_PORT), '127.0.0.1');
