import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { buildCoverage } from '../../scripts/catalog-coverage.mjs';
import { exportCatalogInventory } from './coverage-inventory.mjs';

const source = 'fixture-provider/catalog';
const directory = 'directory/guide';
const records = [{ source: 'fixture-provider', key: 'catalog' }, { source: 'directory', key: 'guide' }];
const evidence = { reference: 'fixture export #1', observedAt: '2026-01-01T00:00:00Z' };
const title = { titleId: 'series-1' };
const episode = { ...title, episodeId: 'episode-1' };
const row = { source, locale: 'en', scope: 'authoritative', evidence, titles: [title], episodes: [episode] };
const snapshot = (...inventories) => ({ version: 2, inventories });

test('assesses catalog and evidenced media independently per locale and excludes directory roots', () => {
  const french = { ...row, locale: 'fr', titles: [title, { titleId: 'title-only' }], episodes: [] };
  const check = { ...episode, source, locale: 'en', assetVersion: 'asset-1', playable: true,
    downloadable: false, evidence };
  const result = buildCoverage(records, [source, directory, 'missing/source'], snapshot(row, french),
    snapshot(row, { ...french, titles: [title] }), [check]);
  assert.deepEqual(result.discoveryRoots, [directory]);
  assert.deepEqual(result.missingSources, ['missing/source']);
  assert.equal(result.sources.length, 1);
  const [english, incomplete] = result.sources[0].locales;
  assert.equal(english.status, 'catalog-complete');
  assert.deepEqual(english.media, { evidenced: 1, playable: 1, downloadable: 0, unknown: 0 });
  assert.equal(incomplete.status, 'catalog-incomplete');
  assert.deepEqual(incomplete.titles.missing, ['title-only']);
  const noMedia = buildCoverage(records, [], snapshot(row), snapshot(row)).sources[0];
  assert.equal(noMedia.status, 'catalog-complete-for-assessed-locales');
  assert.deepEqual(noMedia.locales[0].media, { evidenced: 0, playable: 0, downloadable: 0, unknown: 1 });
});

test('requires authoritative evidence and leaves legacy inventories partial', () => {
  const legacy = [{ source, complete: true, episodes: [{ ...episode, locale: 'en' }] }];
  assert.equal(buildCoverage(records, [], legacy, snapshot(row)).sources[0].locales[0].status, 'inventory-partial');
  assert.throws(() => buildCoverage(records, [], snapshot({ ...row, evidence: null })), /per-locale inventory evidence/);
  assert.throws(() => buildCoverage(records, [], snapshot({ ...row, source: directory })), /Invalid provider inventory/);
  assert.throws(() => buildCoverage(records, [], snapshot(row, row)), /Repeated provider locale/);
  assert.throws(() => buildCoverage(records, [], snapshot({ ...row, titles: [] })), /Episode has no title/);
});

test('exports title-only database records without inferring media coverage', async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL('../../db/catalog.sql', import.meta.url), 'utf8'));
    await db.query(`INSERT INTO catalog_title VALUES
      ($1, 'series-1', 'en', 'Series', ''), ($1, 'series-1', 'fr', 'Série', ''),
      ($2, 'directory', 'en', 'Directory', '')`, [source, directory]);
    await db.query(`INSERT INTO catalog_episode VALUES ($1, 'series-1', 'en', 'episode-1', 1, 'Episode')`, [source]);
    assert.deepEqual(await exportCatalogInventory(db), snapshot(
      { source, locale: 'en', titles: [title], episodes: [episode] },
      { source, locale: 'fr', titles: [title], episodes: [] },
    ));
  } finally {
    await db.close();
  }
});
