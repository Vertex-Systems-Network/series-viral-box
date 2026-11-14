import { randomUUID } from 'node:crypto';
import { sourceTransaction, writeCatalog } from './sync.mjs';

async function getCheckpoint(db, source) {
  const { rows } = await db.query(
    'SELECT cursor, revision::text, watermark FROM catalog_checkpoint WHERE source = $1', [source],
  );
  return rows[0] ?? { cursor: null, revision: '0', watermark: null };
}

// Fetch outside the transaction. The revision check prevents stale concurrent
// responses from overwriting a newer committed page.
export async function runSync(db, adapter) {
  const { source } = adapter;
  if (typeof source !== 'string' || !source.trim()) throw new Error('Invalid adapter source');

  // Use a dedicated database connection for the duration of the run.
  // The two-argument session lock is separate from the page transaction lock.
  const { rows: [lock] } = await db.query(
    'SELECT pg_try_advisory_lock(84132, hashtext($1)) AS acquired', [source],
  );
  if (!lock.acquired) throw new Error('A sync is already running for this source');
  try {
    // A previous worker can leave a running row if its connection drops.
    await db.query(
      "UPDATE catalog_sync_run SET status = 'failed', finished_at = now() WHERE source = $1 AND status = 'running'",
      [source],
    );
    return await runPages(db, adapter, source);
  } finally {
    await db.query('SELECT pg_advisory_unlock(84132, hashtext($1))', [source]);
  }
}

async function runPages(db, adapter, source) {
  const id = randomUUID();
  await db.query('INSERT INTO catalog_sync_run (id, source, status) VALUES ($1, $2, $3)',
    [id, source, 'running']);
  try {
    let checkpoint = await getCheckpoint(db, source);
    const seen = new Set([checkpoint.cursor]);
    let pages = 0;
    while (pages < 1000) {
      const { titles, nextCursor, watermark } = await adapter.fetchPage(
        checkpoint.cursor, { watermark: checkpoint.watermark },
      );
      if (watermark !== undefined &&
          (nextCursor !== null || typeof watermark !== 'string' || !watermark.trim())) {
        throw new Error('Expected a nonempty watermark on the final page only');
      }
      if (nextCursor !== null &&
          (typeof nextCursor !== 'string' || !nextCursor || seen.has(nextCursor))) {
        throw new Error('Invalid or repeated pagination cursor');
      }

      checkpoint = await sourceTransaction(db, source, async () => {
        const current = await getCheckpoint(db, source);
        if (current.revision !== checkpoint.revision) throw new Error('Checkpoint advanced by another run');
        await writeCatalog(db, { source, titles });
        const { rows } = await db.query(
          `INSERT INTO catalog_checkpoint (source, cursor, revision, watermark) VALUES ($1, $2, 1, $3)
           ON CONFLICT (source) DO UPDATE SET cursor = EXCLUDED.cursor,
             revision = catalog_checkpoint.revision + 1, watermark = EXCLUDED.watermark, updated_at = now()
           RETURNING cursor, revision::text, watermark`, [source, nextCursor, watermark ?? checkpoint.watermark],
        );
        await db.query(
          `UPDATE catalog_sync_run SET pages = pages + 1,
             status = CASE WHEN $2 THEN 'succeeded' ELSE status END,
             finished_at = CASE WHEN $2 THEN now() ELSE finished_at END
           WHERE id = $1`, [id, nextCursor === null],
        );
        return rows[0];
      });
      pages += 1;
      if (nextCursor === null) return { id, pages };
      seen.add(nextCursor);
    }
    throw new Error('Catalog exceeded the page limit');
  } catch (error) {
    await db.query("UPDATE catalog_sync_run SET status = 'failed', finished_at = now() WHERE id = $1", [id]);
    throw error;
  }
}
