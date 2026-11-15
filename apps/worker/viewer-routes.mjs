import { createLocalMedia } from './local-media.mjs';
import { createFixtureCdnProxy } from './fixture-cdn.mjs';
import { fixtureDemoResponse } from './fixture-demo.mjs';
import { accountResponse, sessionUser } from './accounts.mjs';
import { oauthResponse } from './oauth-flow.mjs';
import { viewerLibraryResponse } from './viewer-library.mjs';
import { recoveryResponse } from './recovery.mjs';
import { createMailOutbox } from './account-mail-outbox.mjs';
import { resetMailer } from './reset-mail.mjs';
import { verificationResponse } from './email-verification.mjs';

async function send(outgoing, response) {
  const headers = Object.fromEntries(response.headers);
  if (response.headers.has('set-cookie')) headers['set-cookie'] = response.headers.getSetCookie();
  outgoing.writeHead(response.status, headers).end(Buffer.from(await response.arrayBuffer()));
  return true;
}

export function createViewerRoutes(db, { env = process.env, localOrigin, deliver = resetMailer(env) }) {
  const origin = () => env.AUTH_PUBLIC_ORIGIN ?? localOrigin();
  const local = env.MEDIA_SIGNING_KEY ? createLocalMedia(env.FIXTURE_MEDIA_DIR ?? './var/media', env.MEDIA_SIGNING_KEY) : null;
  if (env.FIXTURE_CDN_BASE_URL && !local) throw new Error('Set MEDIA_SIGNING_KEY to use FIXTURE_CDN_BASE_URL');
  const cdnProxy = env.FIXTURE_CDN_BASE_URL ? createFixtureCdnProxy(env.FIXTURE_CDN_BASE_URL) : null;
  const accountMailOutbox = env.MAIL_OUTBOX_KEY ? createMailOutbox(env.MAIL_OUTBOX_KEY) : null;
  const attempts = new Map();

  async function handleViewer(incoming, outgoing, url) {
    if (env.AUTH_PUBLIC_ORIGIN && url.pathname.startsWith('/v1/oauth/') &&
        incoming.headers.host !== new URL(env.AUTH_PUBLIC_ORIGIN).host) {
      return outgoing.writeHead(403).end();
    }
    const oauth = await oauthResponse(db, url, incoming.method, incoming, env);
    if (oauth) return send(outgoing, oauth);
    if (['/v1/account/session', '/v1/account/login', '/v1/account/register', '/v1/account/logout', '/v1/account/forgot-password', '/v1/account/reset-password', '/v1/account/request-verification', '/v1/account/verify-email', '/v1/account/change-password', '/v1/account/revoke-other-sessions'].includes(url.pathname)) {
      const site = new URL(origin());
      if (incoming.headers.host !== site.host) return outgoing.writeHead(403).end();
      if (incoming.method === 'POST' && /\/(login|register|forgot-password|reset-password|request-verification|verify-email|change-password)$/.test(url.pathname)) {
        const minute = Math.floor(Date.now() / 60000);
        const address = incoming.socket.remoteAddress;
        for (const [key, value] of attempts) if (value.minute !== minute) attempts.delete(key);
        const attempt = attempts.get(address) ?? { minute, count: 0 };
        attempts.set(address, attempt);
        if (++attempt.count > 10) return outgoing.writeHead(429).end();
      }
      const chunks = [];
      let length = 0;
      for await (const chunk of incoming.iterator({ destroyOnReturn: false })) {
        length += chunk.length;
        if (length > 4096) return outgoing.writeHead(413, { Connection: 'close' }).end();
        chunks.push(chunk);
      }
      const request = new Request(new URL(url.pathname, site), {
        method: incoming.method,
        headers: incoming.headers,
        ...(length && incoming.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
      });
      const account = /\/(request-verification|verify-email)$/.test(url.pathname)
        ? await verificationResponse(db, request, deliver, accountMailOutbox)
        : /\/(forgot-password|reset-password)$/.test(url.pathname)
        ? await recoveryResponse(db, request, deliver, accountMailOutbox)
        : await accountResponse(db, request, site.protocol === 'https:');
      return send(outgoing, account);
    }
    if (url.pathname === '/v1/fixture-playback' && local && env.ENABLE_FIXTURE_DEMO === '1') {
      const site = origin();
      if (incoming.headers.origin !== site) return outgoing.writeHead(403).end();
      if (!await sessionUser(db, incoming.headers.cookie)) {
        return outgoing.writeHead(401, { 'Cache-Control': 'no-store' }).end();
      }
    }
    const viewerOrigin = origin();
    const library = await viewerLibraryResponse(db, incoming, viewerOrigin);
    if (library) return send(outgoing, library);
    const playback = await fixtureDemoResponse(db, local, env.ENABLE_FIXTURE_DEMO === '1', url, incoming.method);
    if (playback) return send(outgoing, playback);
    if (local && url.pathname.startsWith('/fixture-media/')) {
      await (cdnProxy ?? local.serve)(incoming, outgoing, url.pathname);
      return true;
    }
    return false;
  }
  return { handleViewer, local };
}
