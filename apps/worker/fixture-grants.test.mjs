import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { resolveFixtureGrant } from './fixture-grants.mjs';
import { handleMediaSettings } from './media-settings.mjs';
import { syncCatalog } from './sync.mjs';

test('fixture grants resolve only published assets with bounded playback and download scopes', async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL('../../db/catalog.sql', import.meta.url), 'utf8'));
    await syncCatalog(db, JSON.parse(await readFile(new URL('./fixture.json', import.meta.url))));
    const checks = [];
    const signer = { async sign(request) { checks.push(request); return 'https://example.test/media'; } };
    const issue = kind => resolveFixtureGrant(db, signer, {
      titleId: 'demo-series', locale: 'en', episodeId: 'demo-1', kind,
    });

    const checksum = 'a'.repeat(64);
    await db.query(
      `INSERT INTO fixture_media_asset (source, title_id, locale, episode_id, checksum)
       VALUES ('fixture', 'demo-series', 'en', 'demo-1', $1)`, [checksum],
    );
    assert.equal(await issue('playback'), null);
    assert.equal(checks.length, 0);
    await assert.rejects(issue('constructor'), /Invalid fixture grant kind/);

    await db.query(
      `UPDATE fixture_media_asset SET storage_bucket = 'private-fixtures',
       storage_prefix = 'fixtures/version', available_at = now() WHERE checksum = $1`, [checksum],
    );
    const setCdn = (cdnBaseUrl, authorization = 'Bearer test') => handleMediaSettings(
      new Request('http://localhost/admin/media-settings', {
        method: 'PUT', headers: { authorization }, body: JSON.stringify({ cdnBaseUrl }),
      }), db, 'test',
    );
    assert.equal((await setCdn('https://cdn.example.test/media', 'Bearer wrong')).status, 401);
    assert.equal((await setCdn('http://cdn.example.test')).status, 400);
    assert.equal((await setCdn('https://cdn.example.test/media')).status, 200);
    const before = Date.now();
    const playback = await issue('playback');
    const download = await issue('download');
    for (const grant of [playback, download]) {
      assert.ok(Date.parse(grant.expiresAt) >= before + 300_000);
      assert.ok(Date.parse(grant.expiresAt) <= Date.now() + 300_000);
    }
    assert.equal(checks[0].key, 'fixtures/version/index.m3u8');
    assert.equal(checks[0].scope, 'prefix');
    assert.equal(checks[0].resource, 'fixtures/version/');
    assert.equal(checks[0].cdnBaseUrl, 'https://cdn.example.test/media/');
    assert.equal((await setCdn(null)).status, 200);
    await issue('download');
    assert.equal(checks[2].cdnBaseUrl, null);
    assert.equal(checks[1].scope, 'object');
    assert.equal(checks[1].resource, 'fixtures/version/episode.mp4');
  } finally {
    await db.close();
  }
});
