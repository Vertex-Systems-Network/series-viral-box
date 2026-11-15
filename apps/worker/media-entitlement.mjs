const maximumGrantLifetimeMs = 5 * 60_000;
const validTerritory = value => typeof value === 'string' && /^[A-Z]{2}$/.test(value);
const validId = value => typeof value === 'string' && value.length > 0;
const validTime = Number.isSafeInteger;

function currentGrant({ now, kind, episodeId, territory, session, viewer, asset, rights }) {
  if (!validTime(now) || !['playback', 'download'].includes(kind) ||
      !validId(episodeId) || !validTerritory(territory)) return null;
  if (!validId(session?.id) || !validId(viewer?.id) || session.viewerId !== viewer.id ||
      viewer.disabled !== false || !validTime(session.expiresAt) || now >= session.expiresAt) return null;
  if (asset?.episodeId !== episodeId || !validId(asset.version) || asset.published !== true ||
      asset[kind] !== true) return null;

  const permission = rights?.[kind];
  if (rights?.episodeId !== episodeId || !validId(rights.revision) ||
      !validTime(permission?.startsAt) || !validTime(permission?.endsAt) ||
      now < permission.startsAt || now >= permission.endsAt ||
      !Array.isArray(permission.territories) ||
      !(permission.territories.includes(territory) || permission.territories.includes('*'))) return null;

  return {
    kind, episodeId, territory, sessionId: session.id, viewerId: viewer.id,
    assetVersion: asset.version, rightsRevision: rights.revision,
    expiresAt: Math.min(now + maximumGrantLifetimeMs, session.expiresAt, permission.endsAt),
  };
}

export function issueMediaGrant(facts) {
  return currentGrant(facts);
}

// The caller must resolve the original claims from a trusted grant store or verified credential.
export function authorizeMediaRequest(grant, facts) {
  if (!validTime(grant?.expiresAt) || grant.expiresAt <= facts.now) return false;
  const current = currentGrant(facts);
  return current !== null && grant.expiresAt <= current.expiresAt &&
    grant.kind === current.kind && grant.episodeId === current.episodeId &&
    grant.territory === current.territory && grant.sessionId === current.sessionId &&
    grant.viewerId === current.viewerId && grant.assetVersion === current.assetVersion &&
    grant.rightsRevision === current.rightsRevision;
}
