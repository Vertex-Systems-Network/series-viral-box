import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export const validPassword = value => typeof value === 'string' && value.length >= 12 && value.length <= 128;
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + (await derive(password, salt, 64)).toString('hex');
}
async function passwordMatches(password, storedHash) {
  const [salt, digest] = (storedHash ?? ('0'.repeat(32) + ':' + '0'.repeat(128))).split(':');
  return timingSafeEqual(await derive(password, salt, 64), Buffer.from(digest, 'hex'));
}

const lifetime = 86400;
const reply = (data, status = 200, headers = {}) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

function tokenFrom(cookie) {
  return /(?:^|;\s*)svb_session=([a-f0-9]{64})(?:;|$)/.exec(cookie ?? '')?.[1];
}

export function sessionHash(cookie) {
  const token = tokenFrom(cookie);
  return token ? hashToken(token) : null;
}

export async function sessionUser(db, cookie) {
  return sessionUserByHash(db, sessionHash(cookie));
}

export async function sessionUserByHash(db, session) {
  if (!session) return null;
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.email_verified_at FROM app_session s JOIN app_user u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND NOT u.disabled`, [session],
  );
  return rows[0] ?? null;
}

export async function passwordAccount(db, email, password) {
  const { rows: [record] } = await db.query(
    'SELECT id, email, password_hash, disabled FROM app_user WHERE email = $1', [email]);
  const valid = await passwordMatches(password, record?.password_hash);
  return valid && record?.password_hash && !record.disabled ? record : null;
}

export async function accountResponse(db, request, secure = true) {
  const action = new URL(request.url).pathname.split('/').at(-1);
  const cookie = request.headers.get('cookie');
  if (action === 'session' && request.method === 'GET') return reply({ user: await sessionUser(db, cookie) });
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'invalid_origin' }, 403);

  if (action === 'logout') {
    const token = tokenFrom(cookie);
    if (token) await db.query('DELETE FROM app_session WHERE token_hash = $1', [hashToken(token)]);
    return reply({ user: null }, 200, { 'Set-Cookie': sessionCookie('', 0, secure) });
  }
  if (action === 'revoke-other-sessions') {
    const session = sessionHash(cookie);
    const { rows: [result] } = await db.query(`WITH active AS (
        SELECT s.user_id FROM app_session s JOIN app_user u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now() AND NOT u.disabled
      ), revoked AS (
        DELETE FROM app_session WHERE user_id IN (SELECT user_id FROM active)
        AND token_hash <> $1 RETURNING 1
      ) SELECT EXISTS (SELECT 1 FROM active) AS authorized, count(*)::integer AS revoked FROM revoked`, [session]);
    return result.authorized ? reply({ revoked: result.revoked }) : reply({ error: 'login_required' }, 401);
  }
  if (action === 'change-password') {
    const session = sessionHash(cookie);
    const { rows: [record] } = await db.query(`SELECT u.id, u.password_hash
      FROM app_session s JOIN app_user u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND NOT u.disabled`, [session]);
    if (!record) return reply({ error: 'login_required' }, 401);
    if (!record.password_hash) return reply({ error: 'password_unavailable' }, 409);

    const body = await request.json().catch(() => null);
    if (!validPassword(body?.currentPassword) || !validPassword(body?.password) ||
        !await passwordMatches(body.currentPassword, record.password_hash)) {
      return reply({ error: 'invalid_credentials' }, 400);
    }
    const { rows } = await db.query(`WITH changed AS (
        UPDATE app_user u SET password_hash = $3 WHERE id = $1 AND password_hash = $2 AND NOT disabled
        AND EXISTS (SELECT 1 FROM app_session s WHERE s.token_hash = $4 AND s.user_id = u.id AND s.expires_at > now())
        RETURNING id
      ), revoked AS (
        DELETE FROM app_session WHERE user_id IN (SELECT id FROM changed) AND token_hash <> $4
      ), canceled AS (
        DELETE FROM password_reset WHERE user_id IN (SELECT id FROM changed)
      ) SELECT id FROM changed`, [record.id, record.password_hash, await hashPassword(body.password), session]);
    return rows.length ? reply({ changed: true }) : reply({ error: 'account_changed' }, 409);
  }
  if (!['login', 'register'].includes(action)) return reply({ error: 'not_found' }, 404);
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = body?.password;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !validPassword(password)) {
    return reply({ error: 'invalid_credentials' }, 400);
  }

  let user;
  if (action === 'register') {
    const passwordHash = await hashPassword(password);
    const { rows } = await db.query(
      `INSERT INTO app_user (id, email, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING RETURNING id, email`, [randomUUID(), email, passwordHash],
    );
    if (!rows.length) return reply({ error: 'registration_unavailable' }, 409);
    user = rows[0];
  } else {
    const record = await passwordAccount(db, email, password);
    if (!record) return reply({ error: 'invalid_credentials' }, 401);
    user = { id: record.id, email: record.email };
  }

  return createAccountSession(db, user, secure);
}

function sessionCookie(token, age, secure) {
  return `svb_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
}

export async function createAccountSession(db, user, secure) {
  const token = randomBytes(32).toString('hex');
  await db.query('INSERT INTO app_session VALUES ($1, $2, now() + $3 * interval \'1 second\')',
    [hashToken(token), user.id, lifetime]);
  return reply({ user }, 200, { 'Set-Cookie': sessionCookie(token, lifetime, secure) });
}
