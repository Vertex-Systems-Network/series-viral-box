import { randomBytes } from 'node:crypto';
import { hashPassword, hashToken, validPassword } from './accounts.mjs';

const reply = (data, status) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function recoveryResponse(db, request, deliver, outbox) {
  const url = new URL(request.url);
  if (!deliver && !outbox) return reply({ error: 'unavailable' }, 503);
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  if (request.headers.get('origin') !== url.origin) return reply({ error: 'invalid_origin' }, 403);
  const input = await request.json().catch(() => null);
  if (url.pathname.endsWith('/forgot-password')) {
    const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply({ error: 'invalid_email' }, 400);
    }
    const token = randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const link = new URL('/catalog', url.origin);
    link.hash = new URLSearchParams({ reset: token }).toString();
    const upsert = `INSERT INTO password_reset (user_id, token_hash, expires_at)
       SELECT id, $2, now() + interval '20 minutes'
       FROM app_user WHERE email = $1 AND NOT disabled AND password_hash IS NOT NULL
       ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at
       RETURNING user_id, token_hash, expires_at`;
    if (outbox) {
      await outbox.enqueue(db, 'reset', upsert, [email, tokenHash], email, link.href);
      return reply({ accepted: true }, 202);
    }
    const { rows: [account] } = await db.query(upsert, [email, tokenHash]);
    if (account) {
      // Respond before delivery so mail transport latency does not reveal account presence.
      void Promise.resolve().then(() => deliver(email, link.href)).catch(async () => {
        await db.query('DELETE FROM password_reset WHERE token_hash = $1', [tokenHash]);
      }).catch(() => {});
    }
    return reply({ accepted: true }, 202);
  }

  if (!/^[a-f0-9]{64}$/.test(input?.token ?? '') || !validPassword(input?.password)) {
    return reply({ error: 'invalid_reset' }, 400);
  }
  const password = await hashPassword(input.password);
  const { rows } = await db.query(
    `WITH consumed AS (
       DELETE FROM password_reset WHERE token_hash = $1 AND expires_at > now() RETURNING user_id
     ), changed AS (
       UPDATE app_user SET password_hash = $2 WHERE id IN (SELECT user_id FROM consumed)
       AND NOT disabled AND password_hash IS NOT NULL RETURNING id
     ), revoked AS (
       DELETE FROM app_session WHERE user_id IN (SELECT id FROM changed)
     ) SELECT id FROM changed`, [hashToken(input.token), password],
  );
  return rows.length ? reply({ reset: true }, 200) : reply({ error: 'invalid_reset' }, 400);
}
