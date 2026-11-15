import { resolveFixtureGrant } from './fixture-grants.mjs';

export async function fixtureDemoResponse(db, local, enabled, url, method) {
  if (url.pathname !== '/v1/fixture-playback') return null;
  const headers = { 'Cache-Control': 'no-store' };
  if (!enabled || !local) return Response.json({ error: 'unavailable' }, { status: 404, headers });
  if (method !== 'POST') return new Response(null, { status: 405, headers: { ...headers, Allow: 'POST' } });
  const { titleId, locale, episodeId, kind } = Object.fromEntries(url.searchParams);
  if (![titleId, locale, episodeId].every(value => value?.trim() && value.length <= 512) ||
      !['playback', 'download'].includes(kind)) {
    return Response.json({ error: 'invalid_request' }, { status: 400, headers });
  }
  const grant = await resolveFixtureGrant(db, local, { titleId, locale, episodeId, kind });
  return Response.json(grant ?? { error: 'unavailable' }, { status: grant ? 200 : 404, headers });
}
