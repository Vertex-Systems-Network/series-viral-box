import { readCatalog, titleLink } from './catalog-client.mjs';

export const dynamic = 'force-dynamic';

export default async function CatalogPage({ searchParams }) {
  const { source, locale, cursor } = await searchParams;
  const filters = {
    source: typeof source === 'string' ? source : '',
    locale: typeof locale === 'string' ? locale : '',
  };
  const [providers, result] = await Promise.all([
    readCatalog('providers'), readCatalog('titles', { ...filters, cursor }),
  ]).catch(() => []);
  const sourceOptions = providers?.data.providers ?? [];
  const next = result?.data.nextCursor;
  return (
    <>
      <h1>Series catalog</h1>
      <form action="/">
        <label>Provider
          <select name="source" defaultValue={filters.source}>
            <option value="">All providers</option>
            {sourceOptions.map(provider => <option key={provider}>{provider}</option>)}
          </select>
        </label>
        <label>Language <input name="locale" defaultValue={filters.locale} placeholder="All languages" /></label>
        <button type="submit">Apply filters</button>
      </form>
      {!result || result.status >= 500 ? <p role="status">The catalog is temporarily unavailable.</p>
        : result.status === 400 ? <p role="status">Invalid page. <a href={'/?' + new URLSearchParams(filters)}>Start again</a>.</p>
        : result.data.titles.length ? <ul className="titles">
          {result.data.titles.map(title => <li key={JSON.stringify([title.source, title.id, title.locale])}>
            <a href={titleLink(title)}>{title.name}</a>
            <p>{title.source} · {title.locale}</p>
          </li>)}
        </ul> : <p role="status">No series match these filters.</p>}
      {next && <a href={'/?' + new URLSearchParams({ ...filters, cursor: next })}>Next page</a>}
    </>
  );
}
