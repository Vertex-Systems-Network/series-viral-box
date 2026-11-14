import { collectReelFren, decode, get, origin } from './reelfren-catalog.mjs';

const usage = 'Usage: node scripts/collect-anamana.mjs OUTPUT [TITLE_LIMIT]';
const [output, rawLimit = '20'] = process.argv.slice(2);
const limit = Number(rawLimit);
if (!output || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error(usage);

const sitemap = await get('/sitemap.xml');
const paths = new Map();
for (const [, location] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const url = new URL(decode(location));
  const match = /^\/drama\/anamana\/(\d+)-[^/]+$/.exec(url.pathname);
  if (url.origin === origin && match) paths.set(match[1], url.pathname);
}
if (!paths.size) throw new Error('No Anamana titles found in the sitemap');

const count = await collectReelFren(output, 'reelfren/anamana', [...paths].slice(0, limit));
console.log(`Saved ${count} of ${paths.size} sitemap titles. Provider inventory remains partial.`);
