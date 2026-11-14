import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { runSync } from './run-sync.mjs';
import { loadFixtureAdapter } from './adapter.mjs';

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before running catalog sync');
const schema = await readFile(new URL('../../db/catalog.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query(schema);
  console.log(await runSync(client, await loadFixtureAdapter()));
} finally {
  await client.end();
}
