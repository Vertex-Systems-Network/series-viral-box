import pg from 'pg';

export async function exportCatalogInventory(db) {
  const { rows } = await db.query(
    `SELECT source, title_id AS "titleId", locale, upstream_id AS "episodeId"
       FROM catalog_episode
      ORDER BY source, title_id, locale, upstream_id`,
  );
  const grouped = new Map();
  for (const { source, ...episode } of rows) {
    // Fixtures and other internal namespaces are outside the registry.
    if (!source.includes('/')) continue;
    if (!grouped.has(source)) grouped.set(source, { source, episodes: [] });
    grouped.get(source).episodes.push(episode);
  }
  return [...grouped.values()];
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
