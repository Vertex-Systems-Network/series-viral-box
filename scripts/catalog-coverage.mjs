import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isProviderSource, validate } from './source-registry.mjs';

const read = async path => JSON.parse(await readFile(path, 'utf8'));
const root = path => new URL('../' + path, import.meta.url);
const sourceKey = row => row.source + '/' + row.key;
const nonempty = value => typeof value === 'string' && Boolean(value.trim());
const localeKey = (source, locale) => JSON.stringify([source, locale]);
const episodeKey = ({ titleId, episodeId }) => JSON.stringify([titleId, episodeId]);

function add(set, id, label) {
  if (set.has(id)) throw new Error('Repeated ' + label + ': ' + id);
  set.add(id);
}

function validEvidence(evidence) {
  return nonempty(evidence?.reference) && typeof evidence.observedAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(evidence.observedAt) &&
    Number.isFinite(Date.parse(evidence.observedAt));
}

function indexInventories(input, providers, expected) {
  const inventories = new Map();
  const versioned = input?.version === 2;
  const rows = versioned ? input.inventories : input;
  if (!Array.isArray(rows)) throw new Error('Expected inventory rows');
  for (const row of rows) {
    const source = row?.source;
    if (!providers.has(source) || !Array.isArray(row.episodes) ||
        (versioned && (!nonempty(row.locale) || !Array.isArray(row.titles)))) {
      throw new Error('Invalid provider inventory: ' + source);
    }
    if (versioned && expected && (!['partial', 'authoritative'].includes(row.scope) ||
        !validEvidence(row.evidence))) throw new Error('Expected per-locale inventory evidence for ' + source);

    function get(locale) {
      if (!nonempty(locale)) throw new Error('Invalid locale in ' + source);
      const id = localeKey(source, locale);
      if (!inventories.has(id)) inventories.set(id, {
        source, locale, titles: new Set(), episodes: new Set(),
        scope: versioned && expected ? row.scope : 'partial',
        evidence: versioned && expected ? row.evidence : null,
      });
      return inventories.get(id);
    }

    if (versioned) {
      if (inventories.has(localeKey(source, row.locale))) throw new Error('Repeated provider locale: ' + source);
      get(row.locale);
    }
    for (const title of row.titles ?? []) {
      if (!nonempty(title?.titleId)) throw new Error('Invalid title identity in ' + source);
      add(get(versioned ? row.locale : title.locale).titles, title.titleId, 'title identity');
    }
    for (const episode of row.episodes) {
      if (!nonempty(episode?.titleId) || !nonempty(episode.episodeId)) {
        throw new Error('Invalid episode identity in ' + source);
      }
      const inventory = get(versioned ? row.locale : episode.locale);
      if (versioned && !inventory.titles.has(episode.titleId)) throw new Error('Episode has no title in ' + source);
      if (!versioned) inventory.titles.add(episode.titleId);
      add(inventory.episodes, episodeKey(episode), 'episode identity');
    }
  }
  return inventories;
}

function indexMedia(rows, providers) {
  if (!Array.isArray(rows)) throw new Error('Expected media evidence rows');
  const media = new Map();
  for (const row of rows) {
    if (!providers.has(row?.source) || ![row.locale, row.titleId, row.episodeId, row.assetVersion].every(nonempty) ||
        typeof row.playable !== 'boolean' || typeof row.downloadable !== 'boolean' || !validEvidence(row.evidence)) {
      throw new Error('Invalid episode media evidence');
    }
    const id = localeKey(row.source, row.locale);
    const episodes = media.get(id) ?? new Map();
    const episode = episodeKey(row);
    if (episodes.has(episode)) throw new Error('Repeated episode media evidence');
    episodes.set(episode, row);
    media.set(id, episodes);
  }
  return media;
}

export function buildCoverage(records, required, expectedRows = [], importedRows = [], mediaRows = []) {
  const registered = new Set(records.map(sourceKey));
  const providers = new Set(records.filter(isProviderSource).map(sourceKey));
  const expected = indexInventories(expectedRows, providers, true);
  const imported = indexInventories(importedRows, providers, false);
  const media = indexMedia(mediaRows, providers);
  const locales = new Map([...imported, ...expected]);
  const reports = new Map();
  for (const [id, { source, locale }] of locales) {
    const inventory = expected.get(id);
    const actual = imported.get(id);
    const expectedEpisodes = [...(inventory?.episodes ?? [])];
    const missingTitles = [...(inventory?.titles ?? [])].filter(title => !actual?.titles.has(title));
    const missingEpisodes = expectedEpisodes.filter(episode => !actual?.episodes.has(episode)).map(JSON.parse);
    const observedMedia = media.get(id);
    const mediaEvidence = expectedEpisodes.map(episode => observedMedia?.get(episode)).filter(Boolean);
    const status = !inventory ? 'inventory-unknown' : inventory.scope !== 'authoritative' ? 'inventory-partial' :
      missingTitles.length || missingEpisodes.length ? 'catalog-incomplete' : 'catalog-complete';
    const report = {
      locale, status, inventoryEvidence: inventory?.evidence ?? null,
      titles: { expected: inventory?.titles.size ?? null, imported: actual?.titles.size ?? 0, missing: missingTitles },
      episodes: { expected: inventory?.episodes.size ?? null, imported: actual?.episodes.size ?? 0, missing: missingEpisodes },
      media: {
        evidenced: mediaEvidence.length,
        playable: mediaEvidence.filter(row => row.playable).length,
        downloadable: mediaEvidence.filter(row => row.downloadable).length,
        unknown: inventory ? expectedEpisodes.length - mediaEvidence.length : null,
      },
    };
    if (!reports.has(source)) reports.set(source, []);
    reports.get(source).push(report);
  }

  return {
    registered: records.length,
    missingSources: required.filter(id => !registered.has(id)),
    discoveryRoots: records.filter(row => !isProviderSource(row)).map(sourceKey),
    sources: [...providers].map(source => {
      const sourceLocales = reports.get(source) ?? [];
      const status = sourceLocales.length === 0 ? 'inventory-unknown' :
        sourceLocales.every(row => row.status === 'catalog-complete') ? 'catalog-complete-for-assessed-locales' : 'catalog-unverified';
      return { source, status, locales: sourceLocales };
    }),
  };
}

async function main() {
  const [expectedPath, importedPath, mediaFlag, mediaPath, ...extra] = process.argv.slice(2);
  if (Boolean(expectedPath) !== Boolean(importedPath) || extra.length ||
      ((mediaFlag || mediaPath) && (mediaFlag !== '--media' || !mediaPath))) {
    throw new Error('Usage: node scripts/catalog-coverage.mjs [EXPECTED IMPORTED|--db [--media MEDIA]]');
  }
  const { required } = await read(root('data/required-sources.json'));
  const { records } = validate(await read(root('data/source-registry.json')));
  const expected = expectedPath ? await read(expectedPath) : [];
  const imported = importedPath === '--db'
    ? await (await import('../apps/worker/coverage-inventory.mjs')).readDatabaseInventory(process.env.DATABASE_URL)
    : importedPath ? await read(importedPath) : [];
  const report = buildCoverage(records, required, expected, imported, mediaPath ? await read(mediaPath) : []);
  console.log(JSON.stringify(report, null, 2));
  if (report.missingSources.length || (expectedPath && report.sources.some(row => row.status !== 'catalog-complete-for-assessed-locales'))) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
