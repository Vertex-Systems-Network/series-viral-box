import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const [planPath, statePath, mode = 'drain'] = process.argv.slice(2);
if (!planPath || !statePath || !['once', 'drain', 'status', 'pause', 'resume', 'supervise'].includes(mode)) {
  throw new Error('Usage: node scripts/continuation.mjs PLAN STATE [once|drain|status|pause|resume|supervise]');
}

const tasks = JSON.parse(readFileSync(planPath, 'utf8')).tasks;
if (!Array.isArray(tasks)) throw new Error('Expected a tasks array');
const ids = new Set();
for (const { id, command, args, dependsOn } of tasks) {
  if (typeof id !== 'string' || !id || ids.has(id) || typeof command !== 'string' ||
      !command || !Array.isArray(args) || args.some(value => typeof value !== 'string') ||
      !Array.isArray(dependsOn) || dependsOn.some(dependency => !ids.has(dependency))) {
    throw new Error('Tasks must have unique IDs, argument arrays and dependencies listed first');
  }
  ids.add(id);
}

const db = new DatabaseSync(statePath);
db.exec(`
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS control (id INTEGER PRIMARY KEY, paused INTEGER NOT NULL);
  INSERT OR IGNORE INTO control VALUES (1, 0);
  CREATE TABLE IF NOT EXISTS task (
    id TEXT PRIMARY KEY, status TEXT NOT NULL, attempts INTEGER NOT NULL,
    token TEXT, expires INTEGER, outcome TEXT
  );
`);
const leaseMs = 60_000;

function claim() {
  const now = Date.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    // An interrupted command may have side effects. Require reconciliation before replay.
    db.prepare("UPDATE task SET status = 'blocked', outcome = 'Lease expired; reconcile before retry', token = NULL, expires = NULL WHERE status = 'running' AND expires <= ?").run(now);
    const paused = db.prepare('SELECT paused FROM control WHERE id = 1').get().paused;
    const states = new Map(db.prepare('SELECT * FROM task').all().map(row => [row.id, row]));
    const next = !paused && ![...states.values()].some(row => row.status === 'running')
      && tasks.find(task => !states.has(task.id) && task.dependsOn.every(id => states.get(id)?.status === 'done'));
    if (!next) {
      db.exec('COMMIT');
      return null;
    }
    const token = randomUUID();
    db.prepare("INSERT INTO task VALUES (?, 'running', 1, ?, ?, NULL)").run(next.id, token, now + leaseMs);
    db.exec('COMMIT');
    return { ...next, token };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

async function execute(task) {
  const child = spawn(task.command, task.args, { stdio: 'inherit', shell: false });
  const heartbeat = setInterval(() => {
    const result = db.prepare("UPDATE task SET expires = ? WHERE id = ? AND token = ? AND status = 'running'")
      .run(Date.now() + leaseMs, task.id, task.token);
    if (!result.changes) child.kill();
  }, leaseMs / 4);
  try {
    const outcome = await new Promise(resolve => {
      child.once('error', error => resolve({ status: 'blocked', outcome: error.code ?? 'spawn error' }));
      child.once('close', (code, signal) => resolve({
        status: code === 0 ? 'done' : 'blocked',
        outcome: signal ? 'signal ' + signal : 'exit ' + code,
      }));
    });
    db.prepare('UPDATE task SET status = ?, outcome = ?, token = NULL, expires = NULL WHERE id = ? AND token = ?')
      .run(outcome.status, outcome.outcome, task.id, task.token);
    console.log(JSON.stringify({ id: task.id, ...outcome }));
  } finally {
    clearInterval(heartbeat);
  }
}

try {
  if (mode === 'pause' || mode === 'resume') {
    db.prepare('UPDATE control SET paused = ? WHERE id = 1').run(Number(mode === 'pause'));
  } else if (mode === 'supervise') {
    // Each child creates its own database session and claims its own task.
    let result;
    do {
      const child = spawn(process.execPath, [process.argv[1], planPath, statePath, 'once'], {
        stdio: 'inherit',
      });
      result = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
      });
      if (result !== 0 && result !== 3) throw new Error('Continuation child failed');
    } while (result === 0);
  } else if (mode === 'status') {
    console.log(JSON.stringify({
      paused: Boolean(db.prepare('SELECT paused FROM control WHERE id = 1').get().paused),
      tasks: db.prepare('SELECT id, status, attempts, outcome FROM task ORDER BY rowid').all(),
    }, null, 2));
  } else {
    do {
      const task = claim();
      if (!task) {
        if (mode === 'once') process.exitCode = 3;
        break;
      }
      await execute(task);
    } while (mode === 'drain');
  }
} finally {
  db.close();
}
