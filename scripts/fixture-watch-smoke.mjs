import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { localFixtureStorage } from '../apps/worker/publish-fixture-media.mjs';
import { serveFixtureWatch } from '../apps/worker/fixture-watch-routes.mjs';
import { createLocalMedia } from '../apps/worker/local-media.mjs';

const run = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'svb-watch-'));
const media = createLocalMedia(root, 'fixture-key-'.repeat(4));
const server = createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, 'http://localhost');
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
  const { directory, checksum } = JSON.parse(stdout);
  const prefix = 'fixtures/' + checksum + '/11111111-1111-1111-1111-111111111111/';
  const storage = localFixtureStorage(root);
  for (const file of ['index.m3u8', 'segment-00000.ts']) {
    await storage.put(prefix + file, join(directory, file));
  }
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
    await page.goto(origin + '/fixture-watch#' + new URLSearchParams({ grant }));
    await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
    await page.locator('video').evaluate(video => video.play());
    await page.waitForFunction(() => document.querySelector('video').currentTime > 0.25);
    assert.match(await page.locator('video').evaluate(video => video.currentSrc), /^blob:/);
    assert.ok(requests.some(url => url.endsWith('/segment-00000.ts')));
    assert.ok(requests.every(url => url.startsWith(origin + '/')));
    console.log('Chromium rendered fixture video through blob playback and same-origin requests');
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
