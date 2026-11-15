const columns = 'source, upstream_id AS id, locale, name, synopsis';

export async function catalogResponse(db, url, method) {
  const { pathname, searchParams: params } = url;
  if (!['/v1/titles', '/v1/title', '/v1/providers'].includes(pathname)) return null;
  if (method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  if (pathname === '/v1/providers') {
    const { rows } = await db.query('SELECT DISTINCT source FROM catalog_title ORDER BY source');
    return Response.json({ providers: rows.map(row => row.source) });
  }
  const source = params.get('source');
  const locale = params.get('locale');
  if (pathname === '/v1/title') {
    const id = params.get('id');
    if (!source || !locale || !id) return Response.json({ error: 'invalid_identity' }, { status: 400 });
    const { rows: [title] } = await db.query(
      `SELECT ${columns}, (SELECT coalesce(json_agg(
         json_build_object('id', e.upstream_id, 'number', e.episode_number, 'name', e.name)
         ORDER BY e.episode_number, e.upstream_id), '[]'::json)
         FROM catalog_episode e WHERE (e.source, e.title_id, e.locale) = (t.source, t.upstream_id, t.locale)
       ) AS episodes FROM catalog_title t WHERE (source, upstream_id, locale) = ($1, $2, $3)`,
      [source, id, locale],
    );
    return title ? Response.json(title) : Response.json({ error: 'title_not_found' }, { status: 404 });
  }

  const limit = Number(params.get('limit') ?? 20);
  let cursor = null;
  try {
    if (params.has('cursor')) cursor = JSON.parse(Buffer.from(params.get('cursor'), 'base64url'));
    if ((params.has('cursor') && (!Array.isArray(cursor) || cursor.length !== 3 ||
        !cursor.every(value => typeof value === 'string' && value && value.length <= 512))) ||
        !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error();
  } catch {
    return Response.json({ error: 'invalid_pagination' }, { status: 400 });
  }

  const { rows } = await db.query(
    `SELECT ${columns} FROM catalog_title
     WHERE ($1::text IS NULL OR source = $1) AND ($2::text IS NULL OR locale = $2)
       AND ($3::text IS NULL OR (source, upstream_id, locale) > ($3, $4::text, $5::text))
     ORDER BY source, upstream_id, locale LIMIT $6`,
    [source, locale, ...(cursor ?? [null, null, null]), limit + 1],
  );
  const titles = rows.slice(0, limit);
  const last = titles.at(-1);
  const nextCursor = rows.length > limit
    ? Buffer.from(JSON.stringify([last.source, last.id, last.locale])).toString('base64url') : null;
  return Response.json({ titles, nextCursor });
}
