import { readFile } from 'node:fs/promises';

export async function loadFixtureAdapter() {
  const catalog = JSON.parse(await readFile(new URL('./fixture.json', import.meta.url), 'utf8'));
  return {
    source: catalog.source,
    async fetchPage(cursor) {
      if (cursor !== null) throw new Error('Unexpected fixture cursor');
      return { titles: catalog.titles, nextCursor: null };
    },
  };
}
