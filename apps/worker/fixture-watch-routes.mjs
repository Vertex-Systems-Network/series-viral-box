import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const routes = new Map([
  ['/fixture-watch', [new URL('../web/fixture-watch.html', import.meta.url), 'text/html']],
  ['/fixture-watch/player.mjs', [new URL('../web/fixture-watch.mjs', import.meta.url), 'text/javascript']],
  ['/fixture-watch/blob-playback.mjs', [new URL('../web/blob-playback.mjs', import.meta.url), 'text/javascript']],
  ['/fixture-watch/hls.js', [null, 'text/javascript']],
]);

export async function serveFixtureWatch(request, response, pathname) {
  const route = routes.get(pathname);
  if (!route) return false;
  if (request.method !== 'GET') {
    response.writeHead(405, { Allow: 'GET' }).end();
    return true;
  }
  const [path, type] = route;
  const body = await readFile(path ?? require.resolve('hls.js/dist/hls.min.js'));
  response.writeHead(200, {
    'Content-Type': type + '; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  }).end(body);
  return true;
}
