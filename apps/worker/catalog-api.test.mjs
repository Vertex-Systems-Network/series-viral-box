import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { catalogResponse } from './catalog-api.mjs';
import { syncCatalog } from './sync.mjs';

test('catalog reads, filters and paginates imported records', async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL('../../db/catalog.sql', import.meta.url), 'utf8'));
    const fixture = JSON.parse(await readFile(new URL('./fixture.json', import.meta.url)));
    await syncCatalog(db, fixture);
    const [title] = fixture.titles;
    await syncCatalog(db, { source: 'second', titles: [{ ...title, locale: 'es' }] });
    const get = (path, method = 'GET') => catalogResponse(db, new URL(path, 'http://localhost'), method);
    const first = await (await get('/v1/titles?limit=1')).json();
    assert.equal(first.titles[0].source, 'fixture');
    assert.ok(first.nextCursor);
    const second = await (await get('/v1/titles?limit=1&cursor=' + first.nextCursor)).json();
    assert.equal(second.titles[0].source, 'second');
    assert.equal(second.nextCursor, null);
    assert.equal((await (await get('/v1/titles?source=fixture&locale=es')).json()).titles.length, 0);
    const detail = await (await get('/v1/title?source=fixture&locale=en&id=demo-series')).json();
    assert.equal(detail.episodes[0].id, 'demo-1');
    assert.equal((await get('/v1/title?source=fixture&locale=en&id=missing')).status, 404);
    assert.equal((await get('/v1/titles?cursor=bad')).status, 400);
    assert.equal((await get('/v1/providers', 'POST')).status, 405);
  } finally {
    await db.close();
  }
});
