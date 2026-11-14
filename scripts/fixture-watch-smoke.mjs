import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { PGlite } from '@electric-sql/pglite';
import { accountResponse, sessionUser } from '../apps/worker/accounts.mjs';
import { catalogResponse } from '../apps/worker/catalog-api.mjs';
import { fixtureDemoResponse } from '../apps/worker/fixture-demo.mjs';
import { viewerLibraryResponse } from '../apps/worker/viewer-library.mjs';
import { syncCatalog } from '../apps/worker/sync.mjs';
import { localFixtureStorage, publishFixtureMedia } from '../apps/worker/publish-fixture-media.mjs';
import { serveFixtureWatch } from '../apps/worker/fixture-watch-routes.mjs';
import { createLocalMedia } from '../apps/worker/local-media.mjs';

const run = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'svb-watch-'));
const media = createLocalMedia(root, 'fixture-key-'.repeat(4));
const db = new PGlite();
const server = createServer(async (request, response) => {
  try {
    const origin = 'http://127.0.0.1:' + server.address().port;
    const url = new URL(request.url, origin);
    const { pathname } = url;
    let result;
    if (pathname.startsWith('/v1/account/')) {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      result = await accountResponse(db, new Request(url, {
        method: request.method, headers: request.headers,
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
      }), false);
    } else if (pathname === '/v1/fixture-playback') {
      result = await sessionUser(db, request.headers.cookie)
        ? await fixtureDemoResponse(db, media, true, url, request.method)
        : new Response(null, { status: 401 });
    } else {
      result = await catalogResponse(db, url, request.method) ??
        await viewerLibraryResponse(db, request, origin);
    }
    if (result) {
      response.writeHead(result.status, Object.fromEntries(result.headers)).end(await result.text());
      return;
    }
    if (!await serveFixtureWatch(request, response, pathname)) await media.serve(request, response, pathname);
  } catch {
    response.destroy();
  }
});
let browser;
try {
  const input = join(root, 'input.mp4');
  await run('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=12',
    '-t', '3', '-c:v', 'libx264', input]);
  const { stdout } = await run(process.execPath, ['scripts/package-media.mjs', input, root]);
  const { directory } = JSON.parse(stdout);
  await db.exec(await readFile(new URL('../db/catalog.sql', import.meta.url), 'utf8'));
  await syncCatalog(db, JSON.parse(await readFile(new URL('../apps/worker/fixture.json', import.meta.url))));
  const storage = localFixtureStorage(root);
  const prefix = await publishFixtureMedia(db, storage, directory, 'demo-series', 'en', 'demo-1') + '/';
  const grant = await media.sign({ bucket: storage.bucket, key: prefix + 'index.m3u8',
    scope: 'prefix', expiresAt: new Date(Date.now() + 60000) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  for (const path of ['/fixture-watch', '/fixture-watch/hls.js', '/fixture-watch/player.mjs',
    '/fixture-watch/blob-playback.mjs', grant]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    await response.arrayBuffer();
  }
  if (process.argv.includes('--http-only')) {
    console.log('Watch page, scripts and signed playlist served over HTTP');
  } else {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN });
    const page = await browser.newPage();
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto(origin + '/catalog');
    const selectTitle = () => page.locator('#titles button').first().click();
    const watch = () => page.getByRole('button', { name: /Watch First Cut/ }).click();
    await selectTitle();
    await watch();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Email').fill('viewer@example.test');
    await dialog.getByLabel('Password').fill('fixture-password');
    await dialog.getByRole('button', { name: 'Register' }).click();
    await page.waitForURL('**/fixture-watch#*');
    await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
    const saved = page.waitForResponse(response => response.url().includes('/v1/me/progress?') &&
      response.request().method() === 'PUT' && response.ok() && new URL(response.url()).searchParams.get('position') === '1');
    await page.locator('video').evaluate(video => {
      video.currentTime = 1;
      video.dispatchEvent(new Event('pause'));
    });
    await saved;

    await page.goto(origin + '/catalog');
    await selectTitle();
    await page.getByRole('button', { name: 'Save to My List' }).click();
    await page.locator('#saved-titles button').waitFor();
    await page.getByRole('button', { name: 'Remove from My List' }).click();
    await page.locator('#saved-titles button').waitFor({ state: 'detached' });
    await watch();
    await page.waitForURL('**/fixture-watch#*');
    await page.waitForFunction(() => document.querySelector('video').currentTime >= 1);
    await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
    await page.locator('video').evaluate(video => video.play());
    await page.waitForFunction(() => document.querySelector('video').currentTime > 1.25);
    assert.match(await page.locator('video').evaluate(video => video.currentSrc), /^blob:/);
    assert.ok(requests.some(url => url.endsWith('/segment-00000.ts')));
    const external = requests.map(url => new URL(url)).filter(url => url.origin !== origin);
    assert.deepEqual(external.map(url => url.protocol + '//' + url.host), [],
      'Playback should use the fixture origin for network and blob URLs');
    console.log('Chromium verified registration, My List, saved-position resume and same-origin blob playback');
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await db.close();
  await rm(root, { recursive: true, force: true });
}
