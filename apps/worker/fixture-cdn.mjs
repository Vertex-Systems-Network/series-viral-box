import { timingSafeEqual } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { fixtureMediaPath } from './local-media.mjs';
import { normalizeCdnBase } from './media-settings.mjs';

const passthrough = ['accept-ranges', 'content-disposition', 'content-length', 'content-range', 'content-type'];
const allowedStatuses = new Set([200, 206, 403, 404, 416]);

export function createFixtureCdnProxy(configuredBase, transport = fetch) {
  const base = normalizeCdnBase(configuredBase);
  if (!base) throw new Error('A fixture CDN base is required');
  return async (request, response, pathname) => {
    if (!fixtureMediaPath.test(pathname)) return response.writeHead(404).end();
    if (!['GET', 'HEAD'].includes(request.method)) return response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    const headers = { 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache' };
    if (request.headers.range) headers.Range = request.headers.range;

    const controller = new AbortController();
    const abort = () => controller.abort();
    const timeout = setTimeout(abort, 10_000);
    response.once('close', abort);
    try {
      const upstream = await transport(new URL(pathname.slice(1), base), {
        method: request.method, headers, signal: controller.signal, redirect: 'error',
      });
      clearTimeout(timeout);

      const encoding = upstream.headers.get('content-encoding');
      if (!allowedStatuses.has(upstream.status) || (encoding && encoding !== 'identity')) {
        await upstream.body?.cancel();
        return response.writeHead(502).end();
      }

      const output = { 'Cache-Control': 'private, no-store' };
      for (const name of passthrough) {
        const value = upstream.headers.get(name);
        if (value !== null) output[name] = value;
      }
      response.writeHead(upstream.status, output);
      if (request.method === 'HEAD' || !upstream.body) return response.end();
      await pipeline(upstream.body, response);
    } catch {
      if (response.destroyed) return;
      if (response.headersSent) response.destroy();
      else response.writeHead(502).end();
    } finally {
      clearTimeout(timeout);
      response.off('close', abort);
    }
  };
}

export function createPrivateFixtureOrigin(media, token) {
  const expected = Buffer.from(token ?? '');
  if (expected.length < 32) throw new Error('Fixture origin token must be at least 32 bytes');
  return async (request, response) => {
    const presented = Buffer.from(request.headers['x-fixture-origin-token'] ?? '');
    if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
      return response.writeHead(403, { 'Cache-Control': 'no-store' }).end();
    }
    const pathname = new URL(request.url, 'http://localhost').pathname;
    return media.serve(request, response, pathname);
  };
}
