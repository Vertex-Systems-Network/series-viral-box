import { handleMediaSettings } from './media-settings.mjs';

const identifier = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const reply = (data, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function adminAccountsResponse(db, request, token, actor = 'media-admin') {
  const url = new URL(request.url);
  const probe = new Request(url, { method: 'OPTIONS', headers: request.headers });
  if ((await handleMediaSettings(probe, db, token)).status === 401) return reply({ error: 'unauthorized' }, 401);

  const id = url.searchParams.get('id');
  if (url.pathname === '/admin/user-audit') {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
    if (!identifier.test(id ?? '')) return reply({ error: 'invalid_viewer' }, 400);
    const { rows: events } = await db.query(
      'SELECT id::text, actor, action, created_at FROM account_support_event WHERE viewer_id = $1 ORDER BY id DESC LIMIT 50',
      [id],
    );
    return reply({ events });
  }

  if (request.method === 'GET') {
    const cursor = url.searchParams.get('after');
    const email = url.searchParams.get('email')?.trim().toLowerCase() || null;
    if ((cursor && !identifier.test(cursor)) || (email && email.length > 254)) return reply({ error: 'invalid_filter' }, 400);
    const { rows } = await db.query(`SELECT id, email, disabled, created_at, email_verified_at FROM app_user
        WHERE ($1::uuid IS NULL OR id > $1) AND ($2::text IS NULL OR email = $2) ORDER BY id LIMIT 101`,
      [cursor || null, email],
    );
    return reply({ users: rows.slice(0, 100), nextCursor: rows.length > 100 ? rows[99].id : null });
  }

  if (request.method !== 'PATCH') return new Response(null, { status: 405, headers: { Allow: 'GET, PATCH' } });
  const disabled = url.searchParams.get('disabled');
  if (!identifier.test(id ?? '') || !['true', 'false'].includes(disabled)) return reply({ error: 'invalid_update' }, 400);
  const { rows } = await db.query(`WITH updated AS (
      UPDATE app_user SET disabled = $2 WHERE id = $1 RETURNING id, email, disabled
    ), revoked AS (
      DELETE FROM app_session WHERE user_id IN (SELECT id FROM updated)
    ), audited AS (
      INSERT INTO account_support_event (viewer_id, actor, action)
      SELECT id, $3, CASE WHEN disabled THEN 'suspend' ELSE 'restore' END FROM updated
    ) SELECT * FROM updated`, [id, disabled === 'true', actor]);
  return rows.length ? reply({ users: rows, nextCursor: null }) : reply({ error: 'viewer_not_found' }, 404);
}
