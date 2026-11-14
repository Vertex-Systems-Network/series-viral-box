import { readFile } from 'node:fs/promises';
import { collectReelFren, origin } from './reelfren-catalog.mjs';

const [output, provider, ...urls] = process.argv.slice(2);
if (!output || !provider || urls.length < 1 || urls.length > 100) {
  throw new Error('Usage: node scripts/collect-reelfren.mjs OUTPUT PROVIDER TITLE_URL [...]');
}

const route = provider === 'sereal-plus' ? 'sereal' : provider;
const registry = JSON.parse(await readFile(new URL('../data/source-registry.json', import.meta.url)));
if (!registry.records.some(record => record.source === 'reelfren' && record.key === provider)) {
  throw new Error('Expected a registered ReelFren provider key');
}

const paths = new Map();
for (const input of urls) {
  const url = new URL(input);
  const match = /^\/drama\/([a-z0-9-]+)\/(\d+)-[^/]+$/.exec(url.pathname);
  const locale = url.searchParams.get('lang');
  if (url.origin !== origin || url.username || url.password || match?.[1] !== route ||
      (locale !== null && locale !== 'en')) {
    throw new Error('Expected an English public title URL for the selected ReelFren provider');
  }
  paths.set(match[2], url.pathname);
}

const count = await collectReelFren(output, 'reelfren/' + provider, paths);
console.log(`Saved ${count} selected titles. Provider inventory remains partial.`);
