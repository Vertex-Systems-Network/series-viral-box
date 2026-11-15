import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isProviderSource, validate } from './source-registry.mjs';

const categories = ['inventory', 'limits', 'media', 'rights'];

export function pilotReadiness(plan, registry) {
  const { records } = validate(registry);
  if (plan?.version !== 1 || plan.fixture !== 'fixture' || !plan.live?.evidence) {
    throw new Error('Expected a version 1 pilot plan');
  }
  const { source, evidence } = plan.live;
  const provider = records.find(record => isProviderSource(record) && record.source + '/' + record.key === source);
  if (!provider) throw new Error('Pilot source must be a registered provider');
  const gates = categories.map(category => {
    const item = evidence[category];
    if (!['pending', 'partial', 'verified'].includes(item?.status)) {
      throw new Error('Invalid pilot evidence status for ' + category);
    }
    if (item.status !== 'pending' && (typeof item.reference !== 'string' || !item.reference.trim())) {
      throw new Error('Missing evidence reference for ' + category);
    }
    if (item.status === 'verified' && (typeof item.observedAt !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(item.observedAt) ||
        !Number.isFinite(Date.parse(item.observedAt)))) {
      throw new Error('Missing verified evidence date for ' + category);
    }
    return { gate: category, status: item.status, reference: item.reference ?? null,
      observedAt: item.observedAt ?? null };
  });
  return { fixture: plan.fixture, source, registryStatus: provider.status,
    ready: provider.status === 'qualified' && gates.every(item => item.status === 'verified'), gates };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flags = process.argv.slice(2);
  if (flags.length > 1 || flags.some(flag => flag !== '--require-ready')) {
    throw new Error('Usage: node scripts/pilot-readiness.mjs [--require-ready]');
  }
  const load = async name => JSON.parse(await readFile(new URL('../data/' + name, import.meta.url), 'utf8'));
  const report = pilotReadiness(await load('pilot-qualification.json'), await load('source-registry.json'));
  console.log(JSON.stringify(report, null, 2));
  if (flags.includes('--require-ready') && !report.ready) process.exitCode = 1;
}
