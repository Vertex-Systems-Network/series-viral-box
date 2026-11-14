import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { syncCatalog } from '../apps/worker/sync.mjs';
import { localFixtureStorage, publishFixtureMedia } from '../apps/worker/publish-fixture-media.mjs';
import { resolveFixtureGrant } from '../apps/worker/fixture-grants.mjs';
import { createLocalMedia } from '../apps/worker/local-media.mjs';

const run = promisify(execFile);

test('signed local delivery serves decodable HLS and MP4', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'svb-media-http-'));
  const media = createLocalMedia(root, 'fixture-key-'.repeat(4));
  const server = createServer((request, response) => {
    media.serve(request, response, new URL(request.url, 'http://localhost').pathname)
      .catch(() => response.destroy());
  });
  const db = new PGlite();
  try {
    const input = join(root, 'input.mp4');
    await run('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
      'testsrc2=size=160x90:rate=12', '-t', '5', '-c:v', 'libx264', input]);
    const packager = fileURLToPath(new URL('./package-media.mjs', import.meta.url));
    const { stdout } = await run(process.execPath, [packager, input, root]);
    const packaged = JSON.parse(stdout);
    await db.exec(await readFile(new URL('../db/catalog.sql', import.meta.url), 'utf8'));
    const fixture = JSON.parse(await readFile(new URL('../apps/worker/fixture.json', import.meta.url), 'utf8'));
    await syncCatalog(db, fixture);
    await publishFixtureMedia(db, localFixtureStorage(root), packaged.directory, 'demo-series', 'en', 'demo-1');

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const grant = async kind => origin + (await resolveFixtureGrant(db, media, {
      titleId: 'demo-series', locale: 'en', episodeId: 'demo-1', kind,
    })).url;
    const playlist = await grant('playback');
    const mp4 = await grant('download');
    for (const url of [playlist, mp4]) {
      await run('ffmpeg', ['-nostdin', '-v', 'error', '-xerror', '-i', url, '-f', 'null', '-'],
        { timeout: 15000 });
    }
    const response = await fetch(mp4, { headers: { Range: 'bytes=0-31' } });
    assert.equal(response.status, 206);
    assert.equal((await response.arrayBuffer()).byteLength, 32);
    assert.equal((await fetch(new URL('episode.mp4', playlist))).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.close();
    await rm(root, { recursive: true, force: true });
  }
});
