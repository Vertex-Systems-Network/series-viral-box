import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { migrateCatalog } from './migrate-catalog.mjs';

const versionQuery = 'SELECT version, name, checksum, applied_at FROM catalog_schema_migration ORDER BY version';

test('installs the catalog schema once and rejects divergent history', async () => {
  const db = new PGlite();
  try {
    assert.deepEqual(await migrateCatalog(db), [1, 2]);
    const { rows } = await db.query(versionQuery);
    assert.deepEqual(rows.map(row => row.version), [1, 2]);
    assert.ok(rows.every(row => /^[a-f0-9]{64}$/.test(row.checksum)));
    assert.deepEqual(await migrateCatalog(db), []);
    assert.deepEqual((await db.query(versionQuery)).rows, rows);
    await db.query("UPDATE catalog_schema_migration SET checksum = 'different' WHERE version = 1");
    await assert.rejects(migrateCatalog(db), /migration history mismatch at version 1/);
    assert.equal((await db.query(versionQuery)).rows[0].checksum, 'different');
  } finally {
    await db.close();
  }
});

test('adopts existing catalog, account and published asset rows', async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL('../../db/catalog.sql', import.meta.url), 'utf8'));
    await db.exec(`
      INSERT INTO catalog_title VALUES ('fixture', 'title', 'en', 'Title', 'Synopsis');
      INSERT INTO catalog_episode VALUES ('fixture', 'title', 'en', 'episode', 1, 'Episode');
      INSERT INTO app_user (id, email, password_hash, email_verified_at)
      VALUES ('00000000-0000-4000-8000-000000000001', 'viewer@example.test', 'fixture-hash', now());
      INSERT INTO fixture_media_asset
        (source, title_id, locale, episode_id, checksum, storage_bucket, storage_prefix, available_at)
      VALUES ('fixture', 'title', 'en', 'episode', repeat('a', 64), 'fixture-bucket', 'fixture-prefix', now());
    `);
    const queries = [
      'SELECT * FROM catalog_title', 'SELECT * FROM catalog_episode',
      'SELECT * FROM app_user', 'SELECT * FROM fixture_media_asset',
    ];
    const before = [];
    for (const query of queries) before.push((await db.query(query)).rows);
    assert.deepEqual(await migrateCatalog(db), [1, 2]);
    for (const [index, query] of queries.entries()) {
      assert.deepEqual((await db.query(query)).rows, before[index]);
    }
  } finally {
    await db.close();
  }
});

test('rolls back schema and ledger together on migration failure', async () => {
  const db = new PGlite();
  const client = {
    query: db.query.bind(db),
    async exec(sql) {
      await db.exec(sql);
      if (sql.includes('CREATE TABLE IF NOT EXISTS email_verification')) throw new Error('Injected migration failure');
    },
  };
  try {
    await assert.rejects(migrateCatalog(client), /Injected migration failure/);
    const { rows } = await db.query("SELECT to_regclass('catalog_title') AS catalog, to_regclass('catalog_schema_migration') AS ledger");
    assert.deepEqual(rows, [{ catalog: null, ledger: null }]);
    assert.deepEqual(await migrateCatalog(db), [1, 2]);
  } finally {
    await db.close();
  }
});
