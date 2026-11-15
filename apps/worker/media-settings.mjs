import { timingSafeEqual } from 'node:crypto';

export function normalizeCdnBase(value) {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error('Expected a CDN URL or null');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Expected an HTTPS CDN base URL');
  }
  return url.href.replace(/\/+$/, '') + '/';
}

export async function getCdnBase(db) {
  const { rows } = await db.query('SELECT cdn_base_url FROM media_settings WHERE id = 1');
  return rows[0]?.cdn_base_url ?? null;
}

export async function handleMediaSettings(request, db, token) {
  const authorization = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from('Bearer ' + token);
  if (!token || authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (request.method === 'GET') return Response.json({ cdnBaseUrl: await getCdnBase(db) });
  if (request.method !== 'PUT') return new Response(null, { status: 405, headers: { Allow: 'GET, PUT' } });
  let cdnBaseUrl;
  try {
    const input = await request.json();
    cdnBaseUrl = normalizeCdnBase(input?.cdnBaseUrl);
  } catch {
    return Response.json({ error: 'Provide an HTTPS cdnBaseUrl or null' }, { status: 400 });
  }
  await db.query(
    `INSERT INTO media_settings (id, cdn_base_url) VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET cdn_base_url = EXCLUDED.cdn_base_url`, [cdnBaseUrl],
  );
  return Response.json({ cdnBaseUrl });
}
