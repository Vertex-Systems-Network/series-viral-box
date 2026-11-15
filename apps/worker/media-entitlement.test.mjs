import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeMediaRequest, issueMediaGrant } from './media-entitlement.mjs';

const now = 1_800_000_000_000;

function fixture(overrides = {}) {
  return {
    now,
    kind: 'playback',
    episodeId: 'episode-1',
    territory: 'PK',
    session: { id: 'session-1', viewerId: 'viewer-1', expiresAt: now + 600_000 },
    viewer: { id: 'viewer-1', disabled: false },
    asset: { episodeId: 'episode-1', version: 'asset-v1', published: true, playback: true, download: true },
    rights: {
      episodeId: 'episode-1',
      revision: 'rights-v1',
      playback: { startsAt: now, endsAt: now + 600_000, territories: ['PK', 'AE'] },
      download: { startsAt: now, endsAt: now + 60_000, territories: ['AE'] },
    },
    ...overrides,
  };
}

test('issues separate playback and download grants only in their territory and window', () => {
  const playback = issueMediaGrant(fixture());
  assert.equal(playback.expiresAt, now + 300_000);
  assert.equal(authorizeMediaRequest(playback, fixture()), true);
  assert.equal(issueMediaGrant(fixture({ kind: 'download' })), null);
  const downloadFacts = fixture({ kind: 'download', territory: 'AE' });
  const download = issueMediaGrant(downloadFacts);
  assert.equal(download.expiresAt, now + 60_000);
  assert.equal(authorizeMediaRequest(download, downloadFacts), true);
  assert.equal(authorizeMediaRequest(playback, fixture({ kind: 'download', territory: 'AE' })), false);

  for (const overrides of [
    { now: now - 1 }, { now: now + 600_000 }, { territory: null }, { territory: 'ZZ' },
    { kind: 'preview' }, { rights: null }, { session: null }, { asset: null },
  ]) assert.equal(issueMediaGrant(fixture(overrides)), null);

  const ended = fixture({ now: now + 600_000 });
  ended.session.expiresAt += 60_000;
  assert.equal(issueMediaGrant(ended), null, 'A live session cannot extend a rights window');
  const worldwide = fixture({ territory: 'US' });
  worldwide.rights.playback.territories = ['*'];
  assert.ok(issueMediaGrant(worldwide));
  assert.equal(issueMediaGrant({ ...worldwide, territory: null }), null);
});

test('caps expiry at the original session and rejects a grant at its expiry', () => {
  const facts = fixture();
  facts.session.expiresAt = now + 30_000;
  const grant = issueMediaGrant(facts);
  assert.equal(grant.expiresAt, now + 30_000);
  assert.equal(authorizeMediaRequest(grant, { ...facts, now: grant.expiresAt - 1 }), true);
  assert.equal(authorizeMediaRequest(grant, { ...facts, now: grant.expiresAt }), false);
  assert.equal(authorizeMediaRequest(grant, { ...facts, now: NaN }), false);
  assert.equal(issueMediaGrant({ ...facts, now: grant.expiresAt }), null);
});

test('rechecks current facts before serving an already issued grant', () => {
  const facts = fixture();
  const grant = issueMediaGrant(facts);
  const rejected = [
    { viewer: { ...facts.viewer, disabled: true } },
    { session: null },
    { session: { ...facts.session, id: 'session-2' } },
    { session: { ...facts.session, viewerId: 'other-viewer' } },
    { territory: 'AE' },
    { episodeId: 'episode-2' },
    { asset: { ...facts.asset, published: false } },
    { asset: { ...facts.asset, version: 'asset-v2' } },
    { asset: { ...facts.asset, playback: false } },
    { rights: { ...facts.rights, revision: 'rights-v2' } },
    { rights: { ...facts.rights, playback: null } },
    { rights: { ...facts.rights, playback: { ...facts.rights.playback, territories: ['AE'] } } },
  ];
  for (const overrides of rejected) {
    assert.equal(authorizeMediaRequest(grant, fixture(overrides)), false, JSON.stringify(overrides));
  }
  assert.equal(issueMediaGrant(fixture(rejected[0])), null);
});
