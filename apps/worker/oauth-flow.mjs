import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRemoteJWKSet, customFetch, importPKCS8, jwtVerify, SignJWT } from 'jose';
import { createAccountSession, sessionHash } from './accounts.mjs';

const providers = {
  google: {
    issuer: 'https://accounts.google.com',
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    keys: 'https://www.googleapis.com/oauth2/v3/certs',
  },
  apple: {
    issuer: 'https://appleid.apple.com',
    authorize: 'https://appleid.apple.com/auth/authorize',
    token: 'https://appleid.apple.com/auth/token',
    keys: 'https://appleid.apple.com/auth/keys',
  },
};
const random = () => randomBytes(32).toString('hex');
const digest = value => createHash('sha256').update(value).digest('hex');
const headers = { 'Cache-Control': 'no-store' };

export async function oauthResponse(db, url, method, incoming, env = process.env, transport = fetch) {
  const match = /^\/v1\/oauth\/(google|apple)\/(start|link|callback)$/.exec(url.pathname);
  if (!match && url.pathname !== '/v1/oauth/providers') return null;
  const configured = env.AUTH_PUBLIC_ORIGIN ? new URL(env.AUTH_PUBLIC_ORIGIN) : null;
  const origin = configured?.protocol === 'https:' && configured.origin === env.AUTH_PUBLIC_ORIGIN
    ? configured.origin : null;
  const { rows } = await db.query('SELECT * FROM oauth_provider_settings WHERE enabled');
  const ready = row => origin && row.client_id && (row.provider === 'google'
    ? env.GOOGLE_CLIENT_SECRET?.trim()
    : row.team_id && row.key_id && env.APPLE_PRIVATE_KEY?.trim());
  if (!match) {
    return method === 'GET' ? Response.json({ providers: rows.filter(ready).map(row => row.provider) }, { headers })
      : new Response(null, { status: 405, headers });
  }
  const [, provider, action] = match;
  const settings = rows.find(row => row.provider === provider && ready(row));
  if (!settings) return new Response(null, { status: 404, headers });
  const endpoints = providers[provider];
  const callbackPath = '/v1/oauth/' + provider + '/callback';
  const redirectUri = origin + callbackPath;
  const cookieName = 'svb_oauth_' + provider;
  const callbackCookie = (value, age) =>
    `${cookieName}=${value}; Path=${callbackPath}; HttpOnly; Secure; SameSite=None; Max-Age=${age}`;
  if (action === 'start' || action === 'link') {
    const linking = action === 'link';
    if (method !== (linking ? 'POST' : 'GET')) return new Response(null, { status: 405, headers });
    if (linking && incoming.headers.origin !== origin) return new Response(null, { status: 403, headers });
    const linkSession = linking ? sessionHash(incoming.headers.cookie) : null;
    if (linking && !linkSession) return new Response(null, { status: 401, headers });
    const state = random();
    const browser = random();
    const nonce = random();
    await db.query('DELETE FROM oauth_attempt WHERE expires_at <= now()');
    const { rows: [attempt] } = await db.query(
      `INSERT INTO oauth_attempt (state, provider, browser_hash, nonce, link_session_hash)
       SELECT $1, $2, $3, $4, $5::text WHERE $5::text IS NULL OR EXISTS (
         SELECT 1 FROM app_session s JOIN app_user u ON u.id = s.user_id
         WHERE s.token_hash = $5 AND s.expires_at > now() AND NOT u.disabled
       ) RETURNING state`,
      [state, provider, digest(browser), nonce, linkSession],
    );
    if (!attempt) return new Response(null, { status: 401, headers });
    const target = new URL(endpoints.authorize);
    target.search = new URLSearchParams({
      client_id: settings.client_id, redirect_uri: redirectUri, response_type: 'code',
      scope: provider === 'apple' ? 'email' : 'openid email', state, nonce,
      ...(provider === 'apple' ? { response_mode: 'form_post' } : {}),
    });
    return new Response(null, { status: 302, headers: {
      ...headers, Location: target.href, 'Set-Cookie': callbackCookie(browser, 600),
    } });
  }

  if (method !== (provider === 'apple' ? 'POST' : 'GET')) {
    return new Response(null, { status: 405, headers });
  }
  let params = url.searchParams;
  if (provider === 'apple') {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of incoming) {
      bytes += chunk.length;
      if (bytes > 16384) return new Response(null, { status: 413, headers });
      chunks.push(chunk);
    }
    params = new URLSearchParams(Buffer.concat(chunks).toString());
  }
  const state = params.get('state');
  const cookie = new RegExp('(?:^|;\\s*)' + cookieName + '=([a-f0-9]{64})(?:;|$)')
    .exec(incoming.headers.cookie ?? '')?.[1];
  if (!state || !/^[a-f0-9]{64}$/.test(state) || !cookie) return new Response(null, { status: 400, headers });
  const { rows: [attempt] } = await db.query(
    'DELETE FROM oauth_attempt WHERE state=$1 AND provider=$2 AND browser_hash=$3 AND expires_at > now() RETURNING nonce, link_session_hash',
    [state, provider, digest(cookie)],
  );
  if (!attempt) return new Response(null, { status: 400, headers });

  const redirect = (session, linked = false) => {
    const outcome = attempt.link_session_hash ? (linked ? 'linked' : 'link-failed') : (session ? 'ok' : 'failed');
    const result = new Headers({ ...headers, Location: '/catalog?oauth=' + outcome });
    result.append('Set-Cookie', callbackCookie('', 0));
    if (session) result.append('Set-Cookie', session.headers.get('set-cookie'));
    return new Response(null, { status: 303, headers: result });
  };
  try {
    const code = params.get('code');
    if (!code || params.has('error')) return redirect();
    const secret = provider === 'google' ? env.GOOGLE_CLIENT_SECRET : await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: settings.key_id })
      .setIssuer(settings.team_id).setSubject(settings.client_id).setAudience(endpoints.issuer)
      .setIssuedAt().setExpirationTime('5m')
      .sign(await importPKCS8(env.APPLE_PRIVATE_KEY.replaceAll('\\n', '\n'), 'ES256'));
    const token = await transport(endpoints.token, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ code, client_id: settings.client_id, client_secret: secret,
        redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    if (!token.ok) return redirect();
    const { id_token: idToken } = await token.json();
    const { payload } = await jwtVerify(idToken, createRemoteJWKSet(new URL(endpoints.keys), { [customFetch]: transport }), {
      issuer: endpoints.issuer, audience: settings.client_id, algorithms: ['RS256'],
      requiredClaims: ['exp', 'sub', 'nonce'],
    });
    if (payload.nonce !== attempt.nonce || typeof payload.sub !== 'string' || !payload.sub ||
        (payload.azp && payload.azp !== settings.client_id)) return redirect();

    if (attempt.link_session_hash) {
      const presentedSession = sessionHash(incoming.headers.cookie);
      if (presentedSession && presentedSession !== attempt.link_session_hash) return redirect();
      const { rows: [linked] } = await db.query(
        `INSERT INTO oauth_identity (provider, subject, user_id)
         SELECT $1, $2, u.id FROM app_session s JOIN app_user u ON u.id = s.user_id
         WHERE s.token_hash = $3 AND s.expires_at > now() AND NOT u.disabled
         ON CONFLICT (provider, subject) DO UPDATE SET user_id = EXCLUDED.user_id
         WHERE oauth_identity.user_id = EXCLUDED.user_id RETURNING user_id`,
        [provider, payload.sub, attempt.link_session_hash],
      );
      return redirect(null, Boolean(linked));
    }

    const { rows: [existing] } = await db.query(
      `SELECT u.id, u.email, u.disabled FROM oauth_identity i JOIN app_user u ON u.id=i.user_id
       WHERE i.provider=$1 AND i.subject=$2`, [provider, payload.sub],
    );
    if (existing?.disabled) return redirect();
    let user = existing;
    if (!user) {
      const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
      if (!email || email.length > 254 || ![true, 'true'].includes(payload.email_verified)) return redirect();
      const { rows: [created] } = await db.query(
        `WITH created AS (
           INSERT INTO app_user (id,email) VALUES ($1,$2)
           ON CONFLICT (email) DO NOTHING RETURNING id,email
         ), linked AS (
           INSERT INTO oauth_identity (provider,subject,user_id)
           SELECT $3,$4,id FROM created RETURNING user_id
         ) SELECT id,email FROM created JOIN linked ON id=user_id`, [randomUUID(), email, provider, payload.sub],
      );
      if (!created) return redirect();
      user = created;
    }
    return redirect(await createAccountSession(db, { id: user.id, email: user.email }, true));
  } catch {
    return redirect();
  }
}
