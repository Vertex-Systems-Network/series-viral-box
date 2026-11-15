import { writeFile } from 'node:fs/promises';

const origin = 'https://v2.dramafren.org';
const [output, rawLimit = '2'] = process.argv.slice(2);
const limit = Number(rawLimit);
if (!output || !Number.isInteger(limit) || limit < 1 || limit > 100) {
  throw new Error('Usage: node scripts/collect-dramafren-v2.mjs OUTPUT [PAGE_LIMIT]');
}

function decode(value) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (match, token) => {
    if (token[0] !== '#') return named[token.toLowerCase()];
    const hex = token[1].toLowerCase() === 'x';
    const point = Number.parseInt(token.slice(hex ? 2 : 1), hex ? 16 : 10);
    return point <= 0x10ffff ? String.fromCodePoint(point) : match;
  });
}

const titles = new Map();
const visited = new Set();
let page = new URL('/?msdb_catalog=1', origin);
let duplicates = 0;
while (page && visited.size < limit) {
  if (visited.has(page.href)) throw new Error('Catalog pagination repeated');
  visited.add(page.href);
  const response = await fetch(page, { redirect: 'error', signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${page.href}`);
  const html = await response.text();
  const cards = [...html.matchAll(/<article class="msdb-card">([\s\S]*?)<\/article>/g)];
  if (!cards.length) throw new Error(`No catalog cards found on ${page.href}`);

  for (const [, card] of cards) {
    const href = card.match(/<a href="([^"]+)"/)?.[1];
    const name = card.match(/<h2>([^<]+)<\/h2>/)?.[1];
    const declaredEpisodeCount = Number(card.match(/class="msdb-badge">(\d+) episodes?<\//)?.[1]);
    const detail = new URL(decode(href ?? ''), origin);
    const id = detail.searchParams.get('msdb_book');
    const locale = detail.searchParams.get('msdb_lang');
    if (detail.origin !== origin || !/^\d+$/.test(id ?? '') || !locale || !name?.trim() ||
        !Number.isSafeInteger(declaredEpisodeCount) || declaredEpisodeCount < 1) {
      throw new Error(`Unrecognized catalog card on ${page.href}`);
    }
    const key = JSON.stringify([id, locale]);
    if (titles.has(key)) {
      duplicates++;
      continue;
    }
    titles.set(key, { id, locale, name: decode(name.trim()), synopsis: '',
      episodes: [], declaredEpisodeCount });
  }

  const next = html.match(/<a[^>]+href="([^"]*msdb_page=[^"]+)"[^>]*>\s*Next\b/i)?.[1];
  page = next ? new URL(decode(next), origin) : null;
  if (page && (page.origin !== origin || page.searchParams.get('msdb_catalog') !== '1' ||
      !/^\d+$/.test(page.searchParams.get('msdb_page') ?? ''))) {
    throw new Error('Unexpected catalog pagination link');
  }
}

const snapshot = { version: 1, source: 'dramafren-v2/dramabox',
  titles: [...titles.values()] };
await writeFile(output, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
console.log(`Saved ${titles.size} titles from ${visited.size} pages. Skipped ${duplicates} duplicate cards. Episode inventory remains unknown.`);
