import { randomUUID } from 'node:crypto';
import { sourceTransaction, writeCatalog } from './sync.mjs';

async function getCheckpoint(db, source) {
  const { rows } = await db.query(
    'SELECT cursor, revision::text FROM catalog_checkpoint WHERE source = $1', [source],
  );
  return rows[0] ?? { cursor: null, revision: '0' };
}

// Fetch outside the transaction. The revision check prevents stale concurrent
// responses from overwriting a newer committed page.
export async function runSync(db, adapter) {
  const { source } = adapter;
  if (typeof source !== 'string' || !source.trim()) throw new Error('Invalid adapter source');

  const id = randomUUID();
  await db.query('INSERT INTO catalog_sync_run (id, source, status) VALUES ($1, $2, $3)',
    [id, source, 'running']);
  try {
    let checkpoint = await getCheckpoint(db, source);
    const seen = new Set([checkpoint.cursor]);
    let pages = 0;
    while (pages < 1000) {
      const { titles, nextCursor } = await adapter.fetchPage(checkpoint.cursor);
      if (nextCursor !== null &&
          (typeof nextCursor !== 'string' || !nextCursor || seen.has(nextCursor))) {
        throw new Error('Invalid or repeated pagination cursor');
      }

      checkpoint = await sourceTransaction(db, source, async () => {
        const current = await getCheckpoint(db, source);
        if (current.revision !== checkpoint.revision) throw new Error('Checkpoint advanced by another run');
        await writeCatalog(db, { source, titles });
        const { rows } = await db.query(
          `INSERT INTO catalog_checkpoint (source, cursor, revision) VALUES ($1, $2, 1)
           ON CONFLICT (source) DO UPDATE SET cursor = EXCLUDED.cursor,
             revision = catalog_checkpoint.revision + 1, updated_at = now()
           RETURNING cursor, revision::text`, [source, nextCursor],
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
