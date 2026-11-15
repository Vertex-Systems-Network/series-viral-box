import assert from 'node:assert/strict';
import test from 'node:test';
import { pilotReadiness } from '../../scripts/pilot-readiness.mjs';

const source = 'test/pilot';
const record = { source: 'test', key: 'pilot', label: 'Pilot', url: 'https://provider.example.test', status: 'qualified' };
const registry = { version: 1, records: [record] };
const verified = { status: 'verified', reference: 'fixture-review-1', observedAt: '2026-01-01T00:00:00Z' };
const evidence = { inventory: verified, limits: verified, media: verified, rights: verified };
const plan = { version: 1, fixture: 'fixture', live: { source, evidence } };

test('live pilot requires qualified identity and four independently verified gates', () => {
  assert.equal(pilotReadiness(plan, registry).ready, true);
  assert.equal(pilotReadiness(plan, { ...registry, records: [{ ...record, status: 'verified' }] }).ready, false);
  const partial = { ...plan, live: { source, evidence: { ...evidence, inventory: { status: 'partial', reference: 'sample' } } } };
  assert.equal(pilotReadiness(partial, registry).ready, false);
  assert.throws(() => pilotReadiness({ ...plan, live: { source: 'directory/root', evidence } }, registry), /registered provider/);
  const missing = { ...plan, live: { source, evidence: { ...evidence, rights: { status: 'verified', reference: 'approval' } } } };
  assert.throws(() => pilotReadiness(missing, registry), /verified evidence date/);
});
