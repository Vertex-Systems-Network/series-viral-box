import { writeFile } from 'node:fs/promises';

const origin = 'https://reelfren.net';
const usage = 'Usage: node scripts/collect-anamana.mjs OUTPUT [TITLE_LIMIT]';
const [output, rawLimit = '20'] = process.argv.slice(2);
const limit = Number(rawLimit);
if (!output || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error(usage);

async function get(path) {
  const response = await fetch(origin + path, {
    redirect: 'error',
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${path}`);
  return response.text();
}

function decode(value) {
  const entities = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|quot|lt|gt);/gi, (_, entity) => {
    if (entity[0] !== '#') return entities[entity.toLowerCase()];
    const hex = entity[1].toLowerCase() === 'x';
    return String.fromCodePoint(Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10));
  });
}

const sitemap = await get('/sitemap.xml');
const paths = new Map();
for (const [, location] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const url = new URL(decode(location));
  const match = /^\/drama\/anamana\/(\d+)-[^/]+$/.exec(url.pathname);
  if (url.origin === origin && match) paths.set(match[1], url.pathname);
}
if (!paths.size) throw new Error('No Anamana titles found in the sitemap');

const source = 'reelfren/anamana';
const titles = [];
const failures = [];
for (const [id, path] of [...paths].slice(0, limit)) {
  try {
    const detailPath = path + '?lang=en';
    const watchPath = path.replace('/drama/', '/watch/') + '?ep=1&lang=en';
    const detail = await get(detailPath);
    const watch = await get(watchPath);
    const name = detail.match(/<h1\b[^>]*>([^<]+)<\/h1>/i)?.[1];
    const count = Number(detail.match(/"numberOfEpisodes"\s*:\s*(\d+)/)?.[1]);
    const numbers = [...new Set([...watch.matchAll(/\bEP\s*(?:<!-- -->)?\s*(\d+)\b/g)]
      .map(match => Number(match[1])))].sort((a, b) => a - b);
    if (!name?.trim() || !count || numbers.length !== count || numbers.some((n, i) => n !== i + 1)) {
      throw new Error(`Episode selector did not match the declared inventory for title ${id}`);
    }
    titles.push({
      id,
      locale: 'en',
      name: decode(name.trim()),
      synopsis: '',
      episodes: numbers.map(number => ({ id: String(number), number, name: `Episode ${number}` })),
    });
    console.log(`Verified ${id}: ${count} episode entries`);
  } catch (error) {
    failures.push(id);
    console.error(`Title ${id}: ${error.message}`);
  }
}
if (failures.length) throw new Error(`Snapshot incomplete. Failed title IDs: ${failures.join(', ')}`);

await writeFile(output, JSON.stringify({ version: 1, source, titles }, null, 2) + '\n', { flag: 'wx' });
console.log(`Saved ${titles.length} of ${paths.size} sitemap titles. Provider inventory remains partial.`);
