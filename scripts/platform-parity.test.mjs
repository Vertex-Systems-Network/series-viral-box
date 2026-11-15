import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createRequire } from 'node:module';
import { createCatalogApp } from '../apps/api/catalog-app.mjs';
import { migrateCatalog } from '../apps/worker/migrate-catalog.mjs';
import { catalogResponse } from '../apps/worker/catalog-api.mjs';
import { syncCatalog } from '../apps/worker/sync.mjs';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const next = requireWeb('next');

test('Nest preserves fixture API responses and Next renders the catalog journey', { timeout: 60000 }, async () => {
  const db = new PGlite();
  const root = await mkdtemp(join(tmpdir(), 'svb-next-media-'));
  let api;
  let web;
  let server;
  try {
    await migrateCatalog(db);
    const fixture = JSON.parse(await readFile(new URL('../apps/worker/fixture.json', import.meta.url), 'utf8'));
    await syncCatalog(db, fixture);
    await syncCatalog(db, { ...fixture, titles: fixture.titles.map(title => ({ ...title, id: 'second', name: 'Second Series' })) });

    const env = { ENABLE_FIXTURE_DEMO: '1', MEDIA_SIGNING_KEY: 'fixture-signing-key-'.repeat(3), FIXTURE_MEDIA_DIR: root };
    api = await createCatalogApp(db, { env });
    await api.listen(0, '127.0.0.1');
    const origin = await api.getUrl();
    const first = await (await fetch(origin + '/v1/titles?limit=1')).json();
    assert.ok(first.nextCursor);
    const title = '/v1/title?source=fixture&locale=en&id=demo-series';
    const cases = [
      ['GET', '/v1/providers'], ['GET', '/v1/titles?source=fixture&locale=en&limit=1'],
      ['GET', '/v1/titles?limit=1&cursor=' + first.nextCursor], ['GET', '/v1/titles?cursor=invalid'],
      ['GET', title], ['GET', '/v1/title?id=demo-series'],
      ['GET', '/v1/title?source=fixture&locale=en&id=missing'], ['POST', '/v1/providers'],
    ];
    for (const [method, path] of cases) {
      const expected = await catalogResponse(db, new URL(path, origin), method);
      const actual = await fetch(origin + path, { method });
      assert.equal(actual.status, expected.status, path);
      assert.equal(actual.headers.get('allow'), expected.headers.get('allow'), path);
      assert.equal(await actual.text(), await expected.text(), path);
    }

    process.env.CATALOG_API_URL = origin;
    web = next({ dir: fileURLToPath(new URL('../apps/web', import.meta.url)), dev: false, quiet: true });
    await web.prepare();
    server = createServer(web.getRequestHandler());
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const site = 'http://127.0.0.1:' + server.address().port;
    process.env.VIEWER_PUBLIC_ORIGIN = site;
    env.AUTH_PUBLIC_ORIGIN = site;
    const catalog = await fetch(site + '/?source=fixture&locale=en');
    assert.equal(catalog.status, 200);
    const catalogHtml = await catalog.text();
    assert.match(catalogHtml, /Series catalog/);
    assert.match(catalogHtml, /Second Series/);
    assert.match(catalogHtml, /\/title\?source=fixture&amp;id=demo-series&amp;locale=en/);
    const details = await fetch(site + title.slice(3));
    assert.equal(details.status, 200);
    assert.match(await details.text(), /First Cut/);
    assert.match(await (await fetch(site + '/?locale=unknown')).text(), /No series match/);
    assert.match(await (await fetch(site + '/?cursor=invalid')).text(), /Invalid page/);
    assert.equal((await fetch(site + '/title?source=fixture&locale=en&id=missing')).status, 404);
    assert.equal((await fetch(site + '/catalog')).status, 200);
    assert.equal((await fetch(site + '/catalog/page.mjs')).status, 200);
    assert.equal((await fetch(site + '/admin/accounts')).status, 404);
    assert.equal((await fetch(site + '/v1/me/bookmarks')).status, 401);
    const registration = { email: 'viewer@example.test', password: 'fixture-password' };
    const post = (path, originHeader, cookie) => fetch(site + path, {
      method: 'POST', headers: { Origin: originHeader, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: path.endsWith('/register') ? JSON.stringify(registration) : undefined,
    });
    assert.equal((await post('/v1/account/register', 'https://other.example.test')).status, 403);
    const registered = await post('/v1/account/register', site);
    assert.equal(registered.status, 200);
    const cookie = registered.headers.get('set-cookie').split(';')[0];
    const session = await fetch(site + '/v1/account/session', { headers: { Cookie: cookie } });
    assert.equal((await session.json()).user.email, registration.email);

    const checksum = 'a'.repeat(64);
    const prefix = 'fixtures/' + checksum + '/00000000-0000-4000-8000-000000000001';
    await mkdir(join(root, prefix), { recursive: true });
    await writeFile(join(root, prefix, 'episode.mp4'), 'fixture-bytes');
    await db.query(`INSERT INTO fixture_media_asset
      (source, title_id, locale, episode_id, checksum, storage_bucket, storage_prefix, available_at)
      VALUES ('fixture', 'demo-series', 'en', 'demo-1', $1, $2, $3, now())`, [checksum, 'local:' + root, prefix]);
    const allowed = await post('/v1/fixture-playback?titleId=demo-series&locale=en&episodeId=demo-1&kind=download', site, cookie);
    assert.equal(allowed.status, 200);
    const grant = await allowed.json();
    const media = await fetch(site + grant.url, { headers: { Range: 'bytes=0-6' } });
    assert.equal(media.status, 206);
    assert.equal(media.headers.get('content-range'), 'bytes 0-6/13');
    assert.equal(await media.text(), 'fixture');
    const head = await fetch(site + grant.url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal((await head.arrayBuffer()).byteLength, 0);

  } finally {
    delete process.env.CATALOG_API_URL;
    delete process.env.VIEWER_PUBLIC_ORIGIN;
    if (server) await new Promise(resolve => server.close(resolve));
    await web?.close();
    await api?.close();
    await db.close();
    await rm(root, { recursive: true, force: true });
  }
});
