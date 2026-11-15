import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { createCatalogApp } from '../apps/api/catalog-app.mjs';
import { createNativeFixtureClient } from '../apps/mobile/native-fixture-client.mjs';
import { migrateCatalog } from '../apps/worker/migrate-catalog.mjs';
import { syncCatalog } from '../apps/worker/sync.mjs';
import { localFixtureStorage, publishFixtureMedia } from '../apps/worker/publish-fixture-media.mjs';
import { fixtureDemoResponse } from '../apps/worker/fixture-demo.mjs';
import { createFixtureCdnProxy, createPrivateFixtureOrigin } from '../apps/worker/fixture-cdn.mjs';
import { createLocalMedia } from '../apps/worker/local-media.mjs';

const run = promisify(execFile);

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const urlOf = server => 'http://127.0.0.1:' + server.address().port;
const close = server => server && new Promise(resolve => server.close(resolve));

async function verifyDelivery(useCdn, useNative = false) {
  const root = await mkdtemp(join(tmpdir(), 'svb-media-http-'));
  const signingKey = 'fixture-key-'.repeat(4);
  const media = createLocalMedia(root, signingKey);
  const token = 'private-fixture-origin-'.repeat(2);
  const privateOrigin = useCdn ? createServer(createPrivateFixtureOrigin(media, token)) : null;
  const seen = [];
  const edge = useCdn ? createServer((request, response) => {
    assert.ok(request.url.startsWith('/delivery/fixture-media/'));
    assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers.authorization, undefined);
    seen.push(request.url);
    const upstream = httpRequest(urlOf(privateOrigin) + request.url.slice('/delivery'.length), {
      method: request.method,
      headers: { ...request.headers, 'x-fixture-origin-token': token },
    }, result => {
      response.writeHead(result.statusCode, result.headers);
      result.pipe(response);
    });
    upstream.on('error', () => response.destroy());
    upstream.end();
  }) : null;
  const proxy = useCdn ? createFixtureCdnProxy('https://fixture-cdn.example.test/delivery/', (url, options) => {
    assert.equal(url.origin, 'https://fixture-cdn.example.test');
    return fetch(urlOf(edge) + url.pathname, options);
  }) : null;
  const server = useNative ? null : createServer((request, response) => {
    (proxy ?? media.serve)(request, response, new URL(request.url, 'http://localhost').pathname)
      .catch(() => response.destroy());
  });
  const db = new PGlite();
  let app;
  try {
    const input = join(root, 'input.mp4');
    await run('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
      'testsrc2=size=160x90:rate=12', '-t', '5', '-c:v', 'libx264', input]);
    const packager = fileURLToPath(new URL('./package-media.mjs', import.meta.url));
    const { stdout } = await run(process.execPath, [packager, input, root]);
    const packaged = JSON.parse(stdout);
    await migrateCatalog(db);
    const fixture = JSON.parse(await readFile(new URL('../apps/worker/fixture.json', import.meta.url), 'utf8'));
    await syncCatalog(db, fixture);
    await publishFixtureMedia(db, localFixtureStorage(root), packaged.directory, 'demo-series', 'en', 'demo-1');

    if (useCdn) {
      await listen(privateOrigin);
      await listen(edge);
    }
    if (useNative) {
      const env = { ENABLE_NATIVE_FIXTURE: '1', ENABLE_FIXTURE_DEMO: '1', MEDIA_SIGNING_KEY: signingKey,
        FIXTURE_MEDIA_DIR: root };
      app = await createCatalogApp(db, { env });
      await app.listen(0, '127.0.0.1');
    } else {
      await listen(server);
    }
    const origin = app ? await app.getUrl() : urlOf(server);
    const identity = { source: 'fixture', id: 'demo-series', locale: 'en', episodeId: 'demo-1' };
    const client = app ? createNativeFixtureClient(origin) : null;
    if (client) {
      const credentials = { email: 'native-media@example.test', password: 'fixture-password' };
      const registered = await fetch(origin + '/v1/account/register', {
        method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      assert.equal(registered.status, 200);
      await client.login(credentials.email, credentials.password);
    }
    const endpoint = new URL('/v1/fixture-playback?titleId=demo-series&locale=en&episodeId=demo-1', origin);
    endpoint.searchParams.set('kind', 'playback');
    assert.equal((await fixtureDemoResponse(db, media, false, endpoint, 'POST')).status, 404);
    assert.equal((await fixtureDemoResponse(db, media, true, endpoint, 'GET')).status, 405);
    const grant = async kind => {
      if (client) return (await client.fixtureGrant(identity, kind)).url;
      endpoint.searchParams.set('kind', kind);
      const result = await fixtureDemoResponse(db, media, true, endpoint, 'POST');
      assert.equal(result.status, 200);
      return origin + (await result.json()).url;
    };
    const playlist = await grant('playback');
    const mp4 = await grant('download');
    for (const [kind, url] of [['HLS', playlist], ['MP4', mp4]]) {
      try {
        await run('ffmpeg', ['-nostdin', '-v', 'error', '-xerror', '-i', url, '-f', 'null', '-'],
          { timeout: 15000 });
      } catch {
        assert.fail(kind + ' fixture could not be decoded over HTTP');
      }
    }
    if (client) {
      assert.deepEqual(await client.setProgress(identity, 2), { positionSeconds: 2 });
      assert.deepEqual(await client.progress(identity), { positionSeconds: 2 });
      await client.logout();
      await assert.rejects(client.fixtureGrant(identity, 'download'), error => error.status === 401);
    }
    const response = await fetch(mp4, { headers: { Range: 'bytes=0-31', Cookie: 'fixture=test',
      Authorization: 'Bearer fixture-test' } });
    assert.equal(response.status, 206);
    assert.equal((await response.arrayBuffer()).byteLength, 32);
    assert.equal((await fetch(new URL('episode.mp4', playlist))).status, 403);
    const head = await fetch(mp4, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.ok(head.headers.get('content-disposition')?.includes('attachment'));
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    const denied = await fetch(mp4, { headers: { Range: 'bytes=999999999-' } });
    assert.equal(denied.status, 416);
    assert.match(denied.headers.get('content-range'), /^bytes \*\/\d+$/);
    await denied.arrayBuffer();
    if (useCdn) {
      assert.equal((await fetch(urlOf(privateOrigin) + new URL(playlist).pathname)).status, 403);
      assert.ok(seen.some(url => url.endsWith('/index.m3u8')));
      assert.ok(seen.some(url => url.endsWith('/segment-00000.ts')));
      assert.ok(seen.some(url => url.endsWith('/episode.mp4')));
      const invalid = new URL(mp4);
      invalid.pathname = invalid.pathname.replace(/\/([a-f0-9]{64})\//, (_, mac) =>
        '/' + (mac[0] === '0' ? '1' : '0') + mac.slice(1) + '/');
      assert.equal((await fetch(invalid)).status, 403);
    }
  } finally {
    await app?.close();
    await close(server);
    await close(edge);
    await close(privateOrigin);
    await db.close();
    await rm(root, { recursive: true, force: true });
  }
}

test('signed local delivery serves decodable HLS and MP4', { timeout: 60000 }, () => verifyDelivery(false));
test('same-origin CDN proxy serves HLS and MP4 from a private fixture origin', { timeout: 60000 },
  () => verifyDelivery(true));

test('native viewer grants serve decodable HLS and MP4 over NestJS', { timeout: 60000 },
  () => verifyDelivery(false, true));
