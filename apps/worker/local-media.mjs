import { createHmac, timingSafeEqual } from 'node:crypto';
import { open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';

export const fixtureMediaPath = /^\/fixture-media\/(\d{1,12})\/(prefix|object)\/([a-f0-9]{64})\/(fixtures\/[a-f0-9]{64}\/[a-f0-9-]{36}\/)(index\.m3u8|episode\.mp4|segment-\d+\.ts)$/;
const prefixPattern = /^fixtures\/[a-f0-9]{64}\/[a-f0-9-]{36}\/$/;
const mediaTypes = {
  'episode.mp4': 'video/mp4',
  'index.m3u8': 'application/vnd.apple.mpegurl',
};

export function createLocalMedia(directory, secret) {
  if (Buffer.byteLength(secret ?? '') < 32) throw new Error('Media signing key must be at least 32 bytes');
  const root = resolve(directory);
  const mac = (expiry, scope, resource) => createHmac('sha256', secret)
    .update(JSON.stringify([expiry, scope, resource])).digest('hex');

  return {
    async sign({ bucket, key, scope, expiresAt }) {
      if (bucket !== 'local:' + root) throw new Error('Asset is outside the local media store');
      const expiry = Math.floor(expiresAt.getTime() / 1000);
      const resource = scope === 'prefix' ? key.slice(0, key.lastIndexOf('/') + 1) : key;
      return `/fixture-media/${expiry}/${scope}/${mac(expiry, scope, resource)}/${key}`;
    },

    async serve(request, response, pathname) {
      const match = fixtureMediaPath.exec(pathname);
      if (!match) return response.writeHead(404).end();
      const [, rawExpiry, scope, signature, prefix, file] = match;
      const expiry = Number(rawExpiry);
      const key = prefix + file;
      const allowed = scope === 'object' ? file === 'episode.mp4' : file !== 'episode.mp4';
      const expected = mac(expiry, scope, scope === 'prefix' ? prefix : key);
      if (!prefixPattern.test(prefix) || !allowed || expiry <= Math.floor(Date.now() / 1000) ||
          !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return response.writeHead(403).end();
      }
      if (!['GET', 'HEAD'].includes(request.method)) return response.writeHead(405, { Allow: 'GET, HEAD' }).end();

      let handle;
      try {
        const base = await realpath(root);
        const path = await realpath(resolve(base, key));
        const child = relative(base, path);
        if (!child || child === '..' || child.startsWith('..' + sep) || isAbsolute(child)) {
          return response.writeHead(404).end();
        }
        handle = await open(path, 'r');
        const info = await handle.stat();
        if (!info.isFile()) return response.writeHead(404).end();
        const { size } = info;
        const headers = {
          'Content-Type': mediaTypes[file] ?? 'video/mp2t',
          'Cache-Control': 'private, no-store',
          'Accept-Ranges': 'bytes',
        };
        if (scope === 'object') headers['Content-Disposition'] = 'attachment; filename="episode.mp4"';
        const range = request.headers.range;
        let start = 0;
        let end = size - 1;
        if (range) {
          const parts = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (parts && (parts[1] || parts[2])) {
            start = parts[1] ? Number(parts[1]) : Math.max(0, size - Number(parts[2]));
            end = parts[1] && parts[2] ? Math.min(end, Number(parts[2])) : end;
          } else {
            start = size;
          }
          if (!Number.isSafeInteger(start) || start > end) {
            return response.writeHead(416, { 'Content-Range': 'bytes */' + size }).end();
          }
          headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
        }
        headers['Content-Length'] = Math.max(0, end - start + 1);
        response.writeHead(range ? 206 : 200, headers);
        if (request.method === 'HEAD' || size === 0) return response.end();
        await pipeline(handle.createReadStream({ start, end, autoClose: false }), response);
      } catch (error) {
        if (response.headersSent) response.destroy();
        else response.writeHead(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500).end();
      } finally {
        await handle?.close();
      }
    },
  };
}
