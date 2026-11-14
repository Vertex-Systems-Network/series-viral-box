import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { syncCatalog } from './sync.mjs';

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before running catalog sync');
const schema = await readFile(new URL('../../db/catalog.sql', import.meta.url), 'utf8');
const catalog = JSON.parse(await readFile(new URL('./fixture.json', import.meta.url), 'utf8'));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query(schema);
  console.log(await syncCatalog(client, catalog));
} finally {
  await client.end();
}
