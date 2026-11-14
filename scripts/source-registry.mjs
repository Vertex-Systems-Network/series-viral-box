import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const statuses = new Set(['discovered', 'verified', 'qualified', 'blocked']);
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const identity = ({ source, key }) => `${source}/${key}`;

export function validate(registry) {
  if (registry?.version !== 1 || !Array.isArray(registry.records)) {
    throw new Error('Expected version 1 registry and a records array');
  }

  const identities = new Set();
  for (const row of registry.records) {
    if (!row || typeof row.source !== 'string' || typeof row.key !== 'string' ||
      !slug.test(row.source) || !slug.test(row.key) ||
      typeof row.label !== 'string' || !row.label.trim() || !statuses.has(row.status)) {
      throw new Error('Invalid source record');
    }
    const url = new URL(row.url);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error(`Expected a public HTTPS URL for ${identity(row)}`);
    }
    if (identities.has(identity(row))) throw new Error(`Duplicate source record: ${identity(row)}`);
    identities.add(identity(row));
  }
  return registry;
}

export function mergeDiscovery(registry, candidates) {
  validate(registry);
  if (!Array.isArray(candidates)) throw new Error('Expected an array of discovery records');

  const known = new Map(registry.records.map(row => [identity(row), row]));
  for (const { source, key, label, url } of candidates) {
    const pending = { source, key, label, url, status: 'discovered' };
    validate({ version: 1, records: [pending] });
    if (!known.has(identity(pending))) known.set(identity(pending), pending);
  }
  return { version: 1, records: [...known.values()] };
}

async function main() {
  const [command, path, candidatesPath] = process.argv.slice(2);
  if (!path || !['check', 'merge'].includes(command) || (command === 'merge' && !candidatesPath)) {
    throw new Error('Usage: node scripts/source-registry.mjs check REGISTRY or merge REGISTRY CANDIDATES');
  }

  const registry = validate(JSON.parse(await readFile(path, 'utf8')));
  if (command === 'check') {
    console.log(`Validated ${registry.records.length} source records`);
    return;
  }

  const next = mergeDiscovery(registry, JSON.parse(await readFile(candidatesPath, 'utf8')));
  const added = next.records.length - registry.records.length;
  if (added) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', { flag: 'wx' });
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  console.log(`Added ${added} discovery records`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
