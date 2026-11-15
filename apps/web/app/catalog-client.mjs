export async function readCatalog(path, query = {}) {
  const base = process.env.CATALOG_API_URL ?? 'http://127.0.0.1:3103';
  const url = new URL('/v1/' + path, base);
  for (const [name, value] of Object.entries(query)) {
    if (typeof value === 'string' && value) url.searchParams.set(name, value);
  }
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  return { status: response.status, data: await response.json() };
}

export const titleLink = ({ source, id, locale }) =>
  '/title?' + new URLSearchParams({ source, id, locale });
