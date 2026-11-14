import { readFile } from 'node:fs/promises';
import { validate } from './source-registry.mjs';

const read = async path => JSON.parse(await readFile(path, 'utf8'));
const root = path => new URL('../' + path, import.meta.url);
const key = row => row.source + '/' + row.key;

const { required } = await read(root('data/required-sources.json'));
const { records } = validate(await read(root('data/source-registry.json')));
const registered = new Set(records.map(key));
const missingSources = required.filter(id => !registered.has(id));

const [expectedPath, importedPath] = process.argv.slice(2);
if (Boolean(expectedPath) !== Boolean(importedPath)) {
  throw new Error('Provide both expected inventory JSON and imported inventory JSON or --db');
}

function index(rows, field, requiresCompleteness) {
  if (!Array.isArray(rows)) throw new Error('Expected an array of source inventories');
  const indexed = new Map();
  for (const row of rows) {
    if (!registered.has(row.source) || indexed.has(row.source) || !Array.isArray(row[field]) ||
        (requiresCompleteness && typeof row.complete !== 'boolean')) {
      throw new Error('Invalid, unknown or repeated inventory source: ' + row.source);
    }
    const ids = new Set();
    for (const episode of row[field]) {
      const parts = [episode?.titleId, episode?.locale, episode?.episodeId];
      if (!parts.every(part => typeof part === 'string' && part.trim())) {
        throw new Error('Invalid episode identity in ' + row.source);
      }
      const id = JSON.stringify(parts);
      if (ids.has(id)) throw new Error('Repeated episode identity in ' + row.source);
      ids.add(id);
    }
    indexed.set(row.source, { ids, complete: requiresCompleteness && row.complete });
  }
  return indexed;
}

const expected = index(expectedPath ? await read(expectedPath) : [], 'episodes', true);
const importedRows = importedPath === '--db'
  ? await (await import('../apps/worker/coverage-inventory.mjs')).readDatabaseInventory(process.env.DATABASE_URL)
  : importedPath ? await read(importedPath) : [];
const imported = index(importedRows, 'episodes', false);
const sources = records.map(row => {
  const source = key(row);
  const inventory = expected.get(source);
  const actual = imported.get(source);
  const missing = [...(inventory?.ids ?? [])].filter(id => !actual?.ids.has(id)).map(JSON.parse);
  const status = !inventory ? 'inventory-unknown' : !inventory.complete ? 'inventory-partial' :
    missing.length > 0 ? 'episodes-missing' : 'catalog-complete';
  return { source, status, expected: inventory?.ids.size ?? null,
    imported: actual?.ids.size ?? 0, missing };
});
console.log(JSON.stringify({ registered: records.length, missingSources, sources }, null, 2));
if (missingSources.length || (expectedPath && sources.some(row => row.status !== 'catalog-complete'))) {
  process.exitCode = 1;
}
