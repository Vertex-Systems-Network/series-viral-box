import pg from 'pg';

export async function exportCatalogInventory(db) {
  const { rows } = await db.query(
    `SELECT t.source, t.upstream_id AS "titleId", t.locale, e.upstream_id AS "episodeId"
       FROM catalog_title t
       LEFT JOIN catalog_episode e ON (e.source, e.title_id, e.locale) = (t.source, t.upstream_id, t.locale)
      ORDER BY t.source, t.locale, t.upstream_id, e.upstream_id`,
  );
  const grouped = new Map();
  for (const { source, titleId, locale, episodeId } of rows) {
    // Fixtures and directory roots are outside provider coverage.
    if (!source.includes('/') || source.startsWith('directory/')) continue;
    const key = JSON.stringify([source, locale]);
    if (!grouped.has(key)) grouped.set(key, { source, locale, titles: [], episodes: [] });
    const inventory = grouped.get(key);
    if (inventory.titles.at(-1)?.titleId !== titleId) inventory.titles.push({ titleId });
    if (episodeId !== null) inventory.episodes.push({ titleId, episodeId });
  }
  return { version: 2, inventories: [...grouped.values()] };
}

export async function readDatabaseInventory(connectionString) {
  if (!connectionString) throw new Error('Set DATABASE_URL to read the catalog database');
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    return await exportCatalogInventory(client);
  } finally {
    await client.end();
  }
}
