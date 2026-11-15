import { CatalogRequestError, createCatalogClient } from './catalog-client.mjs';

export function createNativeFixtureClient(base, transport = fetch) {
  const origin = new URL(base);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) {
    throw new TypeError('Native fixture sessions require a loopback origin');
  }
  let token;
  const send = (url, options) => {
    const headers = new Headers(options.headers);
    if (token && new URL(url).pathname.startsWith('/v1/native/')) headers.set('Authorization', 'Bearer ' + token);
    return transport(url, { ...options, headers, credentials: 'omit', redirect: 'error' });
  };
  const catalog = createCatalogClient(base, send, { nativeFixture: true });

  async function request(action, method, input) {
    const response = await send(new URL('/v1/native/' + action, origin).href, {
      method,
      ...(input && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new CatalogRequestError(response.status, data?.error ?? 'http_error');
    if (!data || typeof data !== 'object') throw new CatalogRequestError(response.status, 'invalid_response');
    return data;
  }

  return {
    ...catalog,
    async login(email, password) {
      const data = await request('login', 'POST', { email, password });
      if (typeof data.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token) ||
          !Number.isFinite(Date.parse(data.expiresAt)) || typeof data.user?.id !== 'string') {
        throw new CatalogRequestError(200, 'invalid_session');
      }
      token = data.token;
      return { user: data.user, expiresAt: data.expiresAt };
    },
    session: () => request('session', 'GET'),
    async logout() {
      try { await request('logout', 'POST'); }
      finally { token = undefined; }
    },
  };
}
