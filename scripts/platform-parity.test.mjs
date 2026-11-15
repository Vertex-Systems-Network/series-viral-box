import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import next from 'next';
import { createCatalogApp } from '../apps/api/catalog-app.mjs';
import { catalogResponse } from '../apps/worker/catalog-api.mjs';
import { syncCatalog } from '../apps/worker/sync.mjs';

test('Nest preserves fixture API responses and Next renders the catalog journey', { timeout: 60000 }, async () => {
  const db = new PGlite();
  let api;
  let web;
  let server;
  try {
    await db.exec(await readFile(new URL('../db/catalog.sql', import.meta.url), 'utf8'));
    const fixture = JSON.parse(await readFile(new URL('../apps/worker/fixture.json', import.meta.url), 'utf8'));
    await syncCatalog(db, fixture);
    await syncCatalog(db, { ...fixture, titles: fixture.titles.map(title => ({ ...title, id: 'second', name: 'Second Series' })) });

    api = await createCatalogApp(db);
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
  } finally {
    delete process.env.CATALOG_API_URL;
    if (server) await new Promise(resolve => server.close(resolve));
    await web?.close();
    await api?.close();
    await db.close();
  }
});
