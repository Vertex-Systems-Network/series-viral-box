import { randomBytes } from 'node:crypto';
import { hashToken, sessionUser } from './accounts.mjs';

const reply = (data, status) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function verificationResponse(db, request, deliver) {
  const url = new URL(request.url);
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  if (request.headers.get('origin') !== url.origin) return reply({ error: 'invalid_origin' }, 403);
  if (url.pathname.endsWith('/request-verification')) {
    const user = await sessionUser(db, request.headers.get('cookie'));
    if (!user) return reply({ error: 'login_required' }, 401);
    if (user.email_verified_at) return reply({ verified: true }, 200);
    if (!deliver) return reply({ error: 'unavailable' }, 503);
    const token = randomBytes(32).toString('hex');
    const hash = hashToken(token);
    await db.query(`INSERT INTO email_verification (user_id, token_hash, expires_at)
      VALUES ($1, $2, now() + interval '30 minutes')
      ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at`,
      [user.id, hash]);
    const link = new URL('/catalog', url.origin);
    link.hash = new URLSearchParams({ verify: token }).toString();
    try {
      await deliver(user.email, link.href, 'verify');
    } catch {
      await db.query('DELETE FROM email_verification WHERE token_hash = $1', [hash]);
      return reply({ error: 'delivery_failed' }, 503);
    }
    return reply({ accepted: true }, 202);
  }
  const input = await request.json().catch(() => null);
  if (typeof input?.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) {
    return reply({ error: 'invalid_token' }, 400);
  }
  const { rows } = await db.query(`WITH used AS (
    DELETE FROM email_verification WHERE token_hash = $1 AND expires_at > now() RETURNING user_id
  ) UPDATE app_user SET email_verified_at = COALESCE(email_verified_at, now())
    WHERE id IN (SELECT user_id FROM used) AND NOT disabled RETURNING id`, [hashToken(input.token)]);
  return rows.length ? reply({ verified: true }, 200) : reply({ error: 'invalid_token' }, 400);
}
