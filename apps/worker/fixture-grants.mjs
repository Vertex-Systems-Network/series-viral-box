import { getCdnBase } from './media-settings.mjs';

const scopes = {
  playback: { entry: 'index.m3u8', scope: 'prefix' },
  download: { entry: 'episode.mp4', scope: 'object' },
};

export async function resolveFixtureGrant(db, signer, { titleId, locale, episodeId, kind }) {
  if (!Object.hasOwn(scopes, kind)) throw new Error('Invalid fixture grant kind');
  if (![titleId, locale, episodeId].every(value => typeof value === 'string' && value.trim())) {
    throw new Error('Invalid fixture episode identity');
  }
  const { rows: [asset] } = await db.query(
    `SELECT storage_bucket, storage_prefix FROM fixture_media_asset
     WHERE source = 'fixture' AND title_id = $1 AND locale = $2 AND episode_id = $3
       AND available_at IS NOT NULL AND storage_bucket IS NOT NULL AND storage_prefix IS NOT NULL
     ORDER BY available_at DESC, checksum DESC LIMIT 1`,
    [titleId, locale, episodeId],
  );
  if (!asset) return null;

  const { entry, scope } = scopes[kind];
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  const prefix = asset.storage_prefix + '/';
  const url = await signer.sign({
    cdnBaseUrl: await getCdnBase(db),
    bucket: asset.storage_bucket,
    key: prefix + entry,
    resource: scope === 'prefix' ? prefix : prefix + entry,
    scope,
    expiresAt,
  });
  return { kind, url, expiresAt: expiresAt.toISOString() };
}
