import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { syncCatalog } from './sync.mjs';

test('sync imports, replays, updates and preserves existing episodes', async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL('../../db/catalog.sql', import.meta.url), 'utf8'));
    const catalog = JSON.parse(await readFile(new URL('./fixture.json', import.meta.url), 'utf8'));
    assert.deepEqual(await syncCatalog(db, catalog), { titles: 1, episodes: 1 });
    await syncCatalog(db, catalog);
    assert.equal((await db.query('SELECT * FROM catalog_episode')).rows.length, 1);
    catalog.titles[0].episodes = [{ id: 'demo-2', number: 2, name: 'Second Cut' }];
    await syncCatalog(db, catalog);
    catalog.titles[0].episodes[0].name = 'Revised Cut';
    await syncCatalog(db, catalog);
    const query = 'SELECT upstream_id, name FROM catalog_episode ORDER BY episode_number';
    const expected = [
      { upstream_id: 'demo-1', name: 'First Cut' },
      { upstream_id: 'demo-2', name: 'Revised Cut' },
    ];
    assert.deepEqual((await db.query(query)).rows, expected);
    catalog.titles[0].episodes[0].number = 0;
    await assert.rejects(syncCatalog(db, catalog), /Invalid episode/);
    assert.deepEqual((await db.query(query)).rows, expected);

    catalog.titles[0].name = 'Uncommitted revision';
    catalog.titles[0].episodes[0].number = 2;
    const failingConnection = {
      query(sql, params) {
        if (sql.includes('INSERT INTO catalog_episode')) throw new Error('Simulated write failure');
        return db.query(sql, params);
      },
    };
    await assert.rejects(syncCatalog(failingConnection, catalog), /Simulated write failure/);
    assert.equal((await db.query('SELECT name FROM catalog_title')).rows[0].name, 'The Missing Reel');
  } finally {
    await db.close();
  }
});
