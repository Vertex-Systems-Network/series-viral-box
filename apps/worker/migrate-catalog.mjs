import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

const directory = new URL('../../db/migrations/', import.meta.url);

async function readMigrations() {
  const names = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  return Promise.all(names.map(async (name, index) => {
    const expected = String(index + 1).padStart(3, '0');
    if (!/^\d{3}-[a-z][a-z0-9-]*\.sql$/.test(name) || !name.startsWith(expected + '-')) {
      throw new Error('Invalid catalog migration sequence at ' + name);
    }
    const sql = await readFile(new URL(name, directory), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    return { version: index + 1, name, checksum, sql };
  }));
}

// Use a dedicated connection. The transaction lock also serializes the first ledger creation.
export async function migrateCatalog(db) {
  const migrations = await readMigrations();
  await db.query('BEGIN');
  try {
    await db.query('SELECT pg_advisory_xact_lock(84132, 0)');
    await db.query(`CREATE TABLE IF NOT EXISTS catalog_schema_migration (
      version integer PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await db.query('SELECT version, name, checksum FROM catalog_schema_migration ORDER BY version');
    for (const [index, row] of rows.entries()) {
      const expected = migrations[index];
      if (!expected || row.version !== expected.version || row.name !== expected.name ||
          row.checksum !== expected.checksum) {
        throw new Error('Catalog migration history mismatch at version ' + row.version);
      }
    }

    const pending = migrations.slice(rows.length);
    for (const migration of pending) {
      if (typeof db.exec === 'function') await db.exec(migration.sql);
      else await db.query(migration.sql);
      await db.query('INSERT INTO catalog_schema_migration (version, name, checksum) VALUES ($1, $2, $3)',
        [migration.version, migration.name, migration.checksum]);
    }
    await db.query('COMMIT');
    return pending.map(migration => migration.version);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
