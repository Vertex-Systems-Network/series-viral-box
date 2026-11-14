import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('independent executions resume and skip blocked dependencies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svb-runner-'));
  const plan = join(dir, 'plan.json');
  const state = join(dir, 'state.sqlite');
  const runner = fileURLToPath(new URL('./continuation.mjs', import.meta.url));
  const task = (id, exit, dependsOn = []) => ({
    id, command: process.execPath, args: ['-e', 'process.exit(' + exit + ')'], dependsOn,
  });
  writeFileSync(plan, JSON.stringify({ tasks: [
    task('first', 0), task('second', 0, ['first']), task('broken', 1),
    task('dependent', 0, ['broken']), task('independent', 0),
  ] }));
  const run = (mode, expectedCode = 0) => {
    const result = spawnSync(process.execPath, [runner, plan, state, mode], { encoding: 'utf8' });
    assert.equal(result.status, expectedCode, result.stderr);
    return result.stdout;
  };
  try {
    assert.match(run('once'), /first/);
    run('pause');
    assert.equal(run('once', 3), '');
    run('resume');
    assert.match(run('once'), /second/);
    assert.match(run('supervise'), /independent/);
    assert.deepEqual(JSON.parse(run('status')).tasks.map(row => [row.id, row.status]), [
      ['first', 'done'], ['second', 'done'], ['broken', 'blocked'], ['independent', 'done'],
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
