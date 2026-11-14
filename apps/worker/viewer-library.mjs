import { sessionUser } from './accounts.mjs';

const reply = (data, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function viewerLibraryResponse(db, request, site) {
  const url = new URL(request.url, site);
  const bookmark = url.pathname === '/v1/me/bookmarks';
  if (!bookmark && url.pathname !== '/v1/me/progress') return null;
  const user = await sessionUser(db, request.headers.cookie);
  if (!user) return reply({ error: 'login_required' }, 401);
  const { method } = request;
  if (method === 'GET') {
    const { rows } = bookmark ? await db.query(
      `SELECT b.source, b.title_id, b.locale, t.name, b.saved_at
       FROM viewer_bookmark b JOIN catalog_title t
       ON (b.source,b.title_id,b.locale)=(t.source,t.upstream_id,t.locale)
       WHERE b.user_id=$1 ORDER BY saved_at DESC, b.source, b.title_id, b.locale LIMIT 100`, [user.id],
    ) : await db.query(
      `SELECT source,title_id,locale,episode_id,position_seconds,updated_at FROM viewer_progress
       WHERE user_id=$1 ORDER BY updated_at DESC,source,title_id,locale,episode_id LIMIT 100`, [user.id],
    );
    return reply({ items: rows });
  }
  if (method !== 'PUT' && !(bookmark && method === 'DELETE')) {
    return reply({ error: 'method_not_allowed' }, 405);
  }
  if (request.headers.origin !== site) return reply({ error: 'invalid_origin' }, 403);

  const params = url.searchParams;
  const identity = ['source', 'titleId', 'locale', ...(bookmark ? [] : ['episodeId'])]
    .map(key => params.get(key));
  if (!identity.every(value => value?.trim() && value.length <= 512)) {
    return reply({ error: 'invalid_identity' }, 400);
  }
  const keys = [user.id, ...identity];
  if (method === 'DELETE') {
    await db.query('DELETE FROM viewer_bookmark WHERE (user_id,source,title_id,locale)=($1,$2,$3,$4)', keys);
    return reply({ saved: false });
  }
  try {
    if (bookmark) {
      await db.query(
        'INSERT INTO viewer_bookmark (user_id,source,title_id,locale) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        keys,
      );
      return reply({ saved: true });
    }
    const raw = params.get('position');
    const position = Number(raw);
    if (!/^\d+$/.test(raw ?? '') || !Number.isSafeInteger(position) || position > 86400) {
      return reply({ error: 'invalid_position' }, 400);
    }
    await db.query(
      `INSERT INTO viewer_progress (user_id,source,title_id,locale,episode_id,position_seconds)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id,source,title_id,locale,episode_id) DO UPDATE SET
         position_seconds=EXCLUDED.position_seconds,updated_at=now()`, [...keys, position],
    );
    return reply({ positionSeconds: position });
  } catch (error) {
    if (error.code === '23503') return reply({ error: 'catalog_item_unavailable' }, 404);
    throw error;
  }
}
