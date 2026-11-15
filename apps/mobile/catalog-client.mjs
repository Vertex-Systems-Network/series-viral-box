export class CatalogRequestError extends Error {
  constructor(status, code) {
    super('Catalog request failed: ' + code);
    this.name = 'CatalogRequestError';
    this.status = status;
    this.code = code;
  }
}

/**
 * @typedef {{source: string, id: string, locale: string}} TitleIdentity
 * @typedef {TitleIdentity & {episodeId: string}} EpisodeIdentity
 */

/** Use a transport that owns session handling for authenticated fixture calls. */
export function createCatalogClient(base, transport = fetch) {
  const origin = new URL(base);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.href !== origin.origin + '/') {
    throw new TypeError('Expected a catalog API origin');
  }

  async function getJson(path, query, method = 'GET', signal) {
    const url = new URL(path, origin);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const response = await transport(url.href, { method, signal });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new CatalogRequestError(response.status, body?.error ?? 'http_error');
    if (!body || typeof body !== 'object') throw new CatalogRequestError(response.status, 'invalid_response');
    return body;
  }

  const episodeQuery = ({ source, id, locale, episodeId }) => ({ source, titleId: id, locale, episodeId });

  return {
    providers: signal => getJson('/v1/providers', {}, 'GET', signal),
    list: ({ source, locale, cursor, limit } = {}, signal) =>
      getJson('/v1/titles', { source, locale, cursor, limit }, 'GET', signal),
    /** @param {TitleIdentity} identity */
    title: ({ source, id, locale }, signal) => getJson('/v1/title', { source, id, locale }, 'GET', signal),
    /** @param {EpisodeIdentity} identity */
    progress: (identity, signal) => getJson('/v1/me/progress', episodeQuery(identity), 'GET', signal),
    /** @param {EpisodeIdentity} identity */
    setProgress: (identity, position, signal) =>
      getJson('/v1/me/progress', { ...episodeQuery(identity), position }, 'PUT', signal),
    /**
     * @param {EpisodeIdentity} identity
     * @param {'playback' | 'download'} kind
     */
    async fixtureGrant(identity, kind, signal) {
      if (identity.source !== 'fixture' || !['playback', 'download'].includes(kind)) {
        throw new TypeError('Expected a fixture episode and a valid grant kind');
      }
      const data = await getJson('/v1/fixture-playback', { ...episodeQuery(identity), kind }, 'POST', signal);
      let url;
      try {
        if (typeof data.url !== 'string') throw new TypeError();
        url = new URL(data.url, origin);
      } catch {
        throw new CatalogRequestError(200, 'invalid_media_grant');
      }
      const scope = kind === 'playback' ? 'prefix' : 'object';
      const entry = kind === 'playback' ? 'index.m3u8' : 'episode.mp4';
      if (data.kind !== kind || url.origin !== origin.origin || url.username || url.password || url.hash ||
          !url.pathname.startsWith('/fixture-media/') || url.pathname.split('/')[3] !== scope ||
          !url.pathname.endsWith('/' + entry) || !Number.isFinite(Date.parse(data.expiresAt))) {
        throw new CatalogRequestError(200, 'invalid_media_grant');
      }
      return { kind, url: url.href, expiresAt: data.expiresAt };
    },
  };
}
