import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

const viewerPaths = /^\/v1\/(?:account\/(?:session|login|register|logout|forgot-password|reset-password|request-verification|verify-email|change-password|revoke-other-sessions)|me\/(?:bookmarks|progress)|oauth\/(?:providers|(?:google|apple)\/(?:start|link|callback))|fixture-playback|providers|titles|title)$/;
const fixturePages = /^\/(?:catalog(?:\/(?:style\.css|page\.mjs))?|fixture-watch(?:\/(?:hls\.js|player\.mjs|blob-playback\.mjs))?)$/;
const mediaPath = /^\/fixture-media\/[a-zA-Z0-9./-]+$/;
const requestHeaders = ['origin', 'cookie', 'content-type', 'range'];
const responseHeaders = ['allow', 'cache-control', 'content-disposition', 'content-length', 'content-range',
  'content-type', 'accept-ranges', 'location', 'referrer-policy', 'set-cookie'];

function parseOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value) throw new Error('Expected a bare origin');
  return url;
}

export function proxyViewerRoute(request) {
  const input = new URL(request.url);
  if (!viewerPaths.test(input.pathname) && !fixturePages.test(input.pathname) && !mediaPath.test(input.pathname)) {
    return new Response(null, { status: 404 });
  }
  if (!process.env.VIEWER_PUBLIC_ORIGIN) return new Response(null, { status: 404 });
  let upstream;
  let site;
  try {
    site = parseOrigin(process.env.VIEWER_PUBLIC_ORIGIN);
    upstream = parseOrigin(process.env.CATALOG_API_URL ?? 'http://127.0.0.1:3103');
    if (upstream.origin === site.origin) throw new Error('Viewer upstream loops back to the web origin');
  } catch {
    return new Response(null, { status: 503 });
  }
  if (request.headers.get('host') !== site.host) return new Response(null, { status: 403 });

  const headers = { Host: site.host };
  for (const name of requestHeaders) {
    const value = request.headers.get(name);
    if (value !== null) headers[name] = value;
  }

  return new Promise(resolve => {
    const transport = upstream.protocol === 'https:' ? httpsRequest : httpRequest;
    const outgoing = transport(new URL(input.pathname + input.search, upstream), {
      method: request.method, headers, signal: request.signal,
    }, incoming => {
      clearTimeout(timeout);
      const forwarded = new Headers();
      for (const name of responseHeaders) {
        const value = incoming.headers[name];
        for (const entry of [value].flat()) {
          if (typeof entry === 'string') forwarded.append(name, entry);
        }
      }
      const status = incoming.statusCode;
      const noBody = request.method === 'HEAD' || [204, 205, 304].includes(status);
      if (noBody) incoming.resume();
      resolve(new Response(noBody ? null : Readable.toWeb(incoming), { status, headers: forwarded }));
    });
    const timeout = setTimeout(() => outgoing.destroy(), 10_000);
    outgoing.once('error', () => {
      clearTimeout(timeout);
      resolve(new Response(null, { status: 502 }));
    });
    if (request.body) {
      const body = Readable.fromWeb(request.body);
      outgoing.once('close', () => body.destroy());
      body.once('error', error => outgoing.destroy(error));
      body.pipe(outgoing);
    } else {
      outgoing.end();
    }
  });
}
