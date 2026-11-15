const requiredText = value => typeof value === 'string' && value.trim().length > 0;

function validate(catalog) {
  if (!requiredText(catalog?.source) || !Array.isArray(catalog.titles)) {
    throw new Error('Invalid catalog');
  }

  const titles = new Set();
  for (const title of catalog.titles) {
    if (![title?.id, title?.locale, title?.name].every(requiredText) ||
        typeof title.synopsis !== 'string' || !Array.isArray(title.episodes)) {
      throw new Error('Invalid title');
    }
    const key = JSON.stringify([title.id, title.locale]);
    if (titles.has(key)) throw new Error('Duplicate title identity');
    titles.add(key);

    const episodes = new Set();
    for (const episode of title.episodes) {
      if (![episode?.id, episode?.name].every(requiredText) ||
          !Number.isInteger(episode.number) || episode.number < 1 || episode.number > 2147483647) {
        throw new Error('Invalid episode');
      }
      if (episodes.has(episode.id)) throw new Error('Duplicate episode identity');
      episodes.add(episode.id);
    }
  }
}

export async function writeCatalog(db, catalog) {
  validate(catalog);
  const { source, titles } = catalog;
  let episodes = 0;
  for (const title of titles) {
    await db.query(
      `INSERT INTO catalog_title (source, upstream_id, locale, name, synopsis)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (source, upstream_id, locale)
       DO UPDATE SET name = EXCLUDED.name, synopsis = EXCLUDED.synopsis`,
      [source, title.id, title.locale, title.name, title.synopsis],
    );

    for (const episode of title.episodes) {
      await db.query(
        `INSERT INTO catalog_episode (source, title_id, locale, upstream_id, episode_number, name)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (source, title_id, locale, upstream_id)
         DO UPDATE SET episode_number = EXCLUDED.episode_number, name = EXCLUDED.name`,
        [source, title.id, title.locale, episode.id, episode.number, episode.name],
      );
      episodes += 1;
    }
  }
  return { titles: titles.length, episodes };
}

export async function sourceTransaction(db, source, work) {
  await db.query('BEGIN');
  try {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [source]);
    const result = await work();
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

export function syncCatalog(db, catalog) {
  return sourceTransaction(db, catalog?.source ?? '', () => writeCatalog(db, catalog));
}
