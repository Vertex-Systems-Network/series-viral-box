import { createServer } from 'node:http';
import pg from 'pg';
import { handleMediaSettings } from './media-settings.mjs';

const { DATABASE_URL, MEDIA_ADMIN_TOKEN, MEDIA_ADMIN_PORT = '3101' } = process.env;
if (!DATABASE_URL || !MEDIA_ADMIN_TOKEN) throw new Error('Set DATABASE_URL and MEDIA_ADMIN_TOKEN');
const db = new pg.Pool({ connectionString: DATABASE_URL });

const server = createServer(async (incoming, outgoing) => {
  try {
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
