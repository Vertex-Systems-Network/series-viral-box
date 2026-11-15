import { readFile } from 'node:fs/promises';
import { collectReelFren, origin } from './reelfren-catalog.mjs';

const [output, provider, ...inputs] = process.argv.slice(2);
if (!output || !provider || inputs.length < 1 || inputs.length > 100) {
  throw new Error('Usage: node scripts/collect-reelfren.mjs OUTPUT PROVIDER TITLE_URL [...] | --manifest FILE LIMIT');
}

const route = provider === 'sereal-plus' ? 'sereal' : provider.replaceAll('-', '');
const registry = JSON.parse(await readFile(new URL('../data/source-registry.json', import.meta.url)));
if (!registry.records.some(record => record.source === 'reelfren' && record.key === provider)) {
  throw new Error('Expected a registered ReelFren provider key');
}

let urls = inputs;
if (inputs[0] === '--manifest') {
  const limit = Number(inputs[2]);
  if (inputs.length !== 3 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Provide a discovery manifest and a limit from 1 to 100');
  }
  const manifest = JSON.parse(await readFile(inputs[1], 'utf8'));
  if (manifest.version !== 1 || manifest.locale !== 'en' || !Array.isArray(manifest.providers)) {
    throw new Error('Expected an English version 1 discovery manifest');
  }
  const row = manifest.providers.find(item => item.source === 'reelfren/' + provider);
  const candidates = row?.titles ?? [];
  const eligible = candidates.filter(item => typeof item.id === 'string' && /^\d+$/.test(item.id));
  console.log(`Found ${eligible.length} numeric-ID titles of ${candidates.length} discovered for ${provider}`);
  if (!eligible.length) throw new Error('Manifest has no supported title IDs for this provider');
  urls = eligible.slice(0, limit).map(item => item.url);
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
