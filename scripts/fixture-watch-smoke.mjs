import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PGlite } from '@electric-sql/pglite';
import { createCatalogApp } from '../apps/api/catalog-app.mjs';
import { migrateCatalog } from '../apps/worker/migrate-catalog.mjs';
import { syncCatalog } from '../apps/worker/sync.mjs';
import { localFixtureStorage, publishFixtureMedia } from '../apps/worker/publish-fixture-media.mjs';
import { createLocalMedia } from '../apps/worker/local-media.mjs';

const run = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'svb-watch-'));
const key = 'fixture-key-'.repeat(4);
const media = createLocalMedia(root, key);
const db = new PGlite();
const inbox = new Map();
const deliverMail = (email, link, purpose = 'reset') => {
  inbox.set(purpose, { email, link });
};
let app;
let web;
let server;
let browser;
try {
  const input = join(root, 'input.mp4');
  await run('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=12',
    '-t', '3', '-c:v', 'libx264', input]);
  const { stdout } = await run(process.execPath, ['scripts/package-media.mjs', input, root]);
  const { directory } = JSON.parse(stdout);
  await migrateCatalog(db);
  await syncCatalog(db, JSON.parse(await readFile(new URL('../apps/worker/fixture.json', import.meta.url))));
  const storage = localFixtureStorage(root);
  const prefix = await publishFixtureMedia(db, storage, directory, 'demo-series', 'en', 'demo-1') + '/';
  const grant = await media.sign({ bucket: storage.bucket, key: prefix + 'index.m3u8',
    scope: 'prefix', expiresAt: new Date(Date.now() + 60000) });
  const env = { ENABLE_FIXTURE_DEMO: '1', MEDIA_SIGNING_KEY: key, FIXTURE_MEDIA_DIR: root };
  app = await createCatalogApp(db, { env, deliver: deliverMail });
  await app.listen(0, '127.0.0.1');
  let origin = await app.getUrl();
  if (process.argv.includes('--next')) {
    process.env.CATALOG_API_URL = origin;
    const { default: next } = await import('next');
    web = next({ dir: fileURLToPath(new URL('../apps/web', import.meta.url)), dev: false, quiet: true });
    await web.prepare();
    server = createServer(web.getRequestHandler());
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = 'http://127.0.0.1:' + server.address().port;
    process.env.VIEWER_PUBLIC_ORIGIN = origin;
    env.AUTH_PUBLIC_ORIGIN = origin;
  }
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
    const email = 'viewer@example.test';
    const password = 'fixture-password';
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto(origin + '/catalog');
    const selectTitle = () => page.locator('#titles button').first().click();
    const watch = () => page.getByRole('button', { name: /Watch First Cut/ }).click();
    await selectTitle();
    await watch();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Email').fill(email);
    await dialog.getByLabel('Password').fill(password);
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

    const mailLink = purpose => {
      const message = inbox.get(purpose);
      assert.equal(message?.email, email, 'Mail recipient should match the fixture viewer');
      assert.equal(new URL(message.link).origin, origin, 'Mail link should target the fixture origin');
      return message.link;
    };

    // Retain the original viewer session while another browser context resets the password.
    const recoveryPage = await browser.newPage();
    await recoveryPage.goto(origin + '/catalog');
    await recoveryPage.getByRole('button', { name: 'Log in', exact: true }).click();
    await recoveryPage.getByRole('button', { name: 'Forgot password' }).click();
    const recovery = recoveryPage.locator('#recovery');
    await recovery.getByLabel('Email').fill(email);
    await recovery.getByRole('button', { name: 'Continue' }).click();
    await recovery.getByText('If the account is eligible, a reset link will arrive by email.').waitFor();

    // Load links as external mail navigation so the catalog processes the new fragment.
    await recoveryPage.goto('about:blank');
    await recoveryPage.goto(mailLink('reset'));
    const newPassword = 'fixture-password-replaced';
    await recovery.getByLabel('New password').fill(newPassword);
    await recovery.getByRole('button', { name: 'Continue' }).click();
    const login = recoveryPage.locator('#login');
    await recoveryPage.getByText('Password updated. Log in with your new password.').waitFor();

    await page.goto(origin + '/catalog');
    await page.getByRole('button', { name: 'Log in', exact: true }).waitFor();
    const revokedSession = await page.request.get(origin + '/v1/account/session');
    assert.equal((await revokedSession.json()).user, null);

    await login.getByLabel('Email').fill(email);
    await login.getByLabel('Password').fill(newPassword);
    await login.getByRole('button', { name: 'Log in', exact: true }).click();
    await recoveryPage.getByRole('button', { name: 'Verify email', exact: true }).click();
    await recoveryPage.getByText('Check your inbox for the verification link.').waitFor();
    await recoveryPage.goto('about:blank');
    await recoveryPage.goto(mailLink('verify'));
    await recoveryPage.getByText('Email verified.', { exact: true }).waitFor();
    await recoveryPage.getByRole('button', { name: 'Log out', exact: true }).waitFor();
    await recoveryPage.getByRole('button', { name: 'Verify email', exact: true }).waitFor({ state: 'hidden' });
    const verifiedSession = await recoveryPage.request.get(origin + '/v1/account/session');
    assert.ok((await verifiedSession.json()).user?.email_verified_at);
    console.log('Chromium verified password recovery, session revocation, login and email verification');
  }
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await web?.close();
  await app?.close();
  await db.close();
  await rm(root, { recursive: true, force: true });
}
