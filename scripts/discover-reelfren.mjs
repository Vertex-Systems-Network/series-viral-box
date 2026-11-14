import { readFile, writeFile } from 'node:fs/promises';
import { decode, get, origin } from './reelfren-catalog.mjs';

const [output, ...selected] = process.argv.slice(2);
if (!output) {
  throw new Error('Usage: node scripts/discover-reelfren.mjs OUTPUT [PROVIDER ... | --all]');
}

const registry = JSON.parse(await readFile(new URL('../data/source-registry.json', import.meta.url)));
const providers = registry.records.filter(row => row.source === 'reelfren');
const routeFor = key => key === 'sereal-plus' ? 'sereal' : key.replaceAll('-', '');
const byRoute = new Map(providers.map(({ key }) => [routeFor(key), {
  source: 'reelfren/' + key, browseUrl: null, titles: new Map(),
}]));
const keys = new Set(providers.map(row => row.key));
if (selected.includes('--all') ? selected.length !== 1 : selected.some(key => !keys.has(key))) {
  throw new Error('Select registered ReelFren providers or --all');
}
const unmappedRoutes = new Set();

const html = await get('/explore?lang=en');
for (const [, href] of html.matchAll(/\bhref="([^"]+)"/g)) {
  const url = new URL(decode(href), origin);
  if (url.origin !== origin || url.username || url.password) continue;
  const browseRoute = url.pathname === '/explore' ? url.searchParams.get('provider') : null;
  const detail = /^\/drama\/([a-z0-9-]+)\/([^/]+)$/.exec(url.pathname);
  const route = browseRoute ?? detail?.[1];
  if (!route || route === 'all') continue;
  const provider = byRoute.get(route);
  if (!provider) {
    unmappedRoutes.add(route);
    continue;
  }
  url.searchParams.set('lang', 'en');
  url.hash = '';
  if (browseRoute) {
    provider.browseUrl ??= url.href;
  } else {
    const id = /^(\d+)-/.exec(detail[2])?.[1] ?? null;
    provider.titles.set(id ?? url.pathname, { id, url: url.href });
  }
}

const scans = new Map();
for (const [route, provider] of byRoute) {
  const key = provider.source.split('/')[1];
  if (selected[0] !== '--all' && !selected.includes(key)) continue;
  if (!provider.browseUrl) {
    scans.set(provider.source, { status: 'no-browse-link', added: 0 });
    continue;
  }
  const before = provider.titles.size;
  try {
    const browse = new URL(provider.browseUrl);
    const page = await get(browse.pathname + browse.search);
    for (const [, href] of page.matchAll(/\bhref="([^"]+)"/g)) {
      const url = new URL(decode(href), origin);
      const match = /^\/drama\/([a-z0-9-]+)\/([^/]+)$/.exec(url.pathname);
      if (url.origin !== origin || url.username || url.password || match?.[1] !== route) continue;
      const id = /^(\d+)-/.exec(match[2])?.[1] ?? null;
      url.searchParams.set('lang', 'en');
      url.hash = '';
      provider.titles.set(id ?? url.pathname, { id, url: url.href });
    }
    scans.set(provider.source, { status: 'scanned', added: provider.titles.size - before });
  } catch (error) {
    scans.set(provider.source, { status: 'failed', added: provider.titles.size - before, error: error.message });
  }
}

const result = [...byRoute.values()].map(({ source, browseUrl, titles }) => ({
  source,
  browseUrl,
  browseScan: scans.get(source) ?? { status: 'not-requested', added: 0 },
  status: titles.size ? 'partial' : 'unknown',
  titles: [...titles.values()],
}));
if (!result.some(row => row.titles.length)) throw new Error('No recognized title links in ReelFren Explore');

await writeFile(output, JSON.stringify({
  version: 1, page: origin + '/explore?lang=en', locale: 'en',
  observedAt: new Date().toISOString(), providers: result,
  unmappedRoutes: [...unmappedRoutes].sort(),
}, null, 2) + '\n', { flag: 'wx' });
if ([...scans.values()].some(scan => scan.status !== 'scanned')) process.exitCode = 1;
console.log(`Found ${result.reduce((n, row) => n + row.titles.length, 0)} title links across ${result.filter(row => row.titles.length).length} of ${result.length} registered provider routes`);
