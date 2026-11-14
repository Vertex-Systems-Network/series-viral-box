import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { runSync } from './run-sync.mjs';
import { loadFixtureAdapter } from './adapter.mjs';

import { loadInventoryAdapter } from './inventory-adapter.mjs';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--inventory' || !args[1])) {
  throw new Error('Usage: node apps/worker/run.mjs [--inventory FILE]');
}
const adapter = args.length ? await loadInventoryAdapter(args[1]) : await loadFixtureAdapter();
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before running catalog sync');
const schema = await readFile(new URL('../../db/catalog.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query(schema);
  console.log(await runSync(client, adapter));
} finally {
  await client.end();
}
