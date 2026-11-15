import { notFound } from 'next/navigation';
import { readCatalog } from '../catalog-client.mjs';

export const dynamic = 'force-dynamic';

export default async function TitlePage({ searchParams }) {
  const { source, id, locale } = await searchParams;
  const result = await readCatalog('title', { source, id, locale }).catch(() => null);
  if (result?.status === 404 || result?.status === 400) notFound();
  if (result?.status !== 200) return <p role="status">The series is temporarily unavailable.</p>;
  const title = result.data;
  return (
    <>
      <a href={'/?' + new URLSearchParams({ source, locale })}>Back to catalog</a>
      <h1>{title.name}</h1>
      <p>{title.synopsis}</p>
      <h2>Episodes</h2>
      {title.episodes.length ? <ol>
        {title.episodes.map(episode => <li key={episode.id} value={episode.number}>{episode.name}</li>)}
      </ol> : <p>No episode metadata is available.</p>}
    </>
  );
}
