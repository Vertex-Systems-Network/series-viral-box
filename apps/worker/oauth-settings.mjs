import { timingSafeEqual } from 'node:crypto';

const providers = ['google', 'apple'];
const reply = (data, status = 200, headers = {}) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export async function oauthSettingsResponse(db, request, token, env = process.env) {
  const actual = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from('Bearer ' + token);
  if (!token || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return reply({ error: 'unauthorized' }, 401);
  }
  const secretPresent = provider => Boolean((provider === 'google'
    ? env.GOOGLE_CLIENT_SECRET : env.APPLE_PRIVATE_KEY)?.trim());
  const view = row => ({
    provider: row.provider, enabled: row.enabled, clientId: row.client_id,
    teamId: row.team_id, keyId: row.key_id, secretConfigured: secretPresent(row.provider),
  });
  if (request.method === 'GET') {
    const { rows } = await db.query('SELECT * FROM oauth_provider_settings');
    return reply({ providers: providers.map(provider => view(rows.find(row => row.provider === provider) ??
      { provider, enabled: false, client_id: null, team_id: null, key_id: null })) });
  }
  if (request.method !== 'PUT') return reply({ error: 'method_not_allowed' }, 405, { Allow: 'GET, PUT' });
  const input = await request.json().catch(() => null);
  const { provider, enabled, clientId = null, teamId = null, keyId = null } = input ?? {};
  const identifier = value => typeof value === 'string' && /^[A-Za-z0-9._-]{1,254}$/.test(value);
  if (!providers.includes(provider) || typeof enabled !== 'boolean' ||
      Object.keys(input ?? {}).some(key => !['provider', 'enabled', 'clientId', 'teamId', 'keyId'].includes(key)) ||
      ![clientId, teamId, keyId].every(value => value === null || identifier(value)) ||
      (provider === 'google' && (teamId !== null || keyId !== null))) {
    return reply({ error: 'invalid_provider_settings' }, 400);
  }
  if (enabled && (!clientId || !secretPresent(provider) || (provider === 'apple' && (!teamId || !keyId)))) {
    return reply({ error: 'provider_credentials_missing' }, 400);
  }
  const { rows: [row] } = await db.query(
    `INSERT INTO oauth_provider_settings (provider, enabled, client_id, team_id, key_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (provider) DO UPDATE SET enabled = EXCLUDED.enabled,
       client_id = EXCLUDED.client_id, team_id = EXCLUDED.team_id, key_id = EXCLUDED.key_id
     RETURNING *`, [provider, enabled, clientId, teamId, keyId],
  );
  return reply(view(row));
}
