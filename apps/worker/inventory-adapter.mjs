import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isProviderSource, validate } from '../../scripts/source-registry.mjs';

export async function loadInventoryAdapter(path) {
  const bytes = await readFile(path);
  const inventory = JSON.parse(bytes);
  const registry = validate(JSON.parse(await readFile(
    new URL('../../data/source-registry.json', import.meta.url), 'utf8',
  )));
  if (inventory?.version !== 1 || !Array.isArray(inventory.titles) ||
      !registry.records.some(row => isProviderSource(row) && row.source + '/' + row.key === inventory.source)) {
    throw new Error('Expected a version 1 inventory for a registered source');
  }

  const identities = new Set();
  for (const title of inventory.titles) {
    if (typeof title?.id !== 'string' || !title.id.trim() ||
        typeof title?.locale !== 'string' || !title.locale.trim()) {
      throw new Error('Invalid title identity');
    }
    const identity = JSON.stringify([title.id, title.locale]);
    if (identities.has(identity)) throw new Error('Duplicate title identity');
    identities.add(identity);
  }

  const digest = createHash('sha256').update(bytes).digest('hex');
  const pageSize = 100;
  return {
    source: inventory.source,
    async fetchPage(cursor) {
      let offset = 0;
      if (cursor !== null) {
        const match = /^([a-f0-9]{64}):([1-9][0-9]*)$/.exec(cursor);
        offset = Number(match?.[2]);
        if (match?.[1] !== digest || !Number.isSafeInteger(offset) ||
            offset % pageSize !== 0 || offset >= inventory.titles.length) {
          throw new Error('Checkpoint does not match this snapshot. Resume with the original file.');
        }
      }
      const next = offset + pageSize;
      return {
        titles: inventory.titles.slice(offset, next),
        nextCursor: next < inventory.titles.length ? digest + ':' + next : null,
      };
    },
  };
}
