import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createCatalogApp } from '../api/catalog-app.mjs';
import { migrateCatalog } from './migrate-catalog.mjs';
import { syncCatalog } from './sync.mjs';

test('Nest serves the fixture viewer lifecycle and scoped media, with admin routes isolated', async () => {
  const db = new PGlite();
  const root = await mkdtemp(join(tmpdir(), 'svb-nest-media-'));
  const messages = [];
  let app;
  try {
    await migrateCatalog(db);
    await syncCatalog(db, JSON.parse(await readFile(new URL('./fixture.json', import.meta.url), 'utf8')));
    const checksum = 'a'.repeat(64);
    const prefix = 'fixtures/' + checksum + '/00000000-0000-4000-8000-000000000001';
    await mkdir(join(root, prefix), { recursive: true });
    await writeFile(join(root, prefix, 'index.m3u8'), '#EXTM3U\n');
    await writeFile(join(root, prefix, 'episode.mp4'), 'fixture-bytes');
    await db.query(`INSERT INTO fixture_media_asset
      (source, title_id, locale, episode_id, checksum, storage_bucket, storage_prefix, available_at)
      VALUES ('fixture', 'demo-series', 'en', 'demo-1', $1, $2, $3, now())`, [checksum, 'local:' + root, prefix]);
    app = await createCatalogApp(db, {
      env: { ENABLE_FIXTURE_DEMO: '1', MEDIA_SIGNING_KEY: 'fixture-signing-key-'.repeat(3), FIXTURE_MEDIA_DIR: root },
      deliver: (...message) => { messages.push(message); },
    });
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    let cookie;
    const call = (path, { method = 'GET', body, site = origin, headers = {} } = {}) => fetch(origin + path, {
      method, headers: { Origin: site, ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const episode = 'titleId=demo-series&locale=en&episodeId=demo-1';
    const grant = kind => call('/v1/fixture-playback?' + episode + '&kind=' + kind, { method: 'POST' });
    assert.equal((await call('/admin/accounts')).status, 404);
    assert.equal((await call('/admin/users')).status, 404);
    assert.equal((await call('/fixture-watch')).status, 200);
    assert.equal((await grant('playback')).status, 401);
    assert.deepEqual(await (await call('/v1/oauth/providers')).json(), { providers: [] });

    const body = { email: 'viewer@example.test', password: 'fixture-password' };
    assert.equal((await call('/v1/account/register', { method: 'POST', body, site: 'https://other.example.test' })).status, 403);
    assert.equal((await call('/v1/account/register', { method: 'POST', body: { ...body, padding: 'x'.repeat(5000) } })).status, 413);
    const registered = await call('/v1/account/register', { method: 'POST', body });
    assert.equal(registered.status, 200);
    cookie = registered.headers.get('set-cookie').split(';')[0];
    assert.equal((await (await call('/v1/account/session')).json()).user.email, body.email);

    assert.equal((await call('/v1/account/request-verification', { method: 'POST' })).status, 202);
    const [, link, purpose] = messages[0];
    assert.equal(purpose, 'verify');
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get('verify');
    assert.equal((await call('/v1/account/verify-email', { method: 'POST', body: { token } })).status, 200);

    const progress = '/v1/me/progress?source=fixture&' + episode;
    assert.equal((await call(progress + '&position=5', { method: 'PUT', site: 'https://other.example.test' })).status, 403);
    assert.equal((await call(progress + '&position=5', { method: 'PUT' })).status, 200);
    assert.deepEqual(await (await call(progress)).json(), { positionSeconds: 5 });
    const playlist = await (await grant('playback')).json();
    assert.equal(await (await call(playlist.url)).text(), '#EXTM3U\n');
    const download = await (await grant('download')).json();
    const range = await call(download.url, { headers: { Range: 'bytes=0-6' } });
    assert.equal(range.status, 206);
    assert.equal(await range.text(), 'fixture');
    assert.equal((await call(playlist.url.replace('index.m3u8', 'episode.mp4'))).status, 403);
    assert.equal((await call('/v1/account/logout', { method: 'POST' })).status, 200);
    assert.equal((await grant('download')).status, 401);
  } finally {
    await app?.close();
    await db.close();
    await rm(root, { recursive: true, force: true });
  }
});
