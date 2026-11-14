import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

export async function verifyFixturePackage(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'media.json'), 'utf8'));
  if (manifest.mp4 !== 'episode.mp4' || manifest.hls !== 'index.m3u8') {
    throw new Error('Unexpected fixture manifest paths');
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(directory, manifest.mp4))) hash.update(chunk);
  const checksum = hash.digest('hex');
  if (manifest.checksum !== checksum) throw new Error('MP4 checksum mismatch');
  const lines = (await readFile(join(directory, manifest.hls), 'utf8')).trim().split(/\r?\n/);
  const segments = lines.filter(line => line && !line.startsWith('#'));
  if (lines[0] !== '#EXTM3U' || !lines.includes('#EXT-X-ENDLIST') || !segments.length ||
      segments.some(segment => !/^segment-\d+\.ts$/.test(segment))) {
    throw new Error('Invalid fixture HLS playlist');
  }
  for (const segment of segments) {
    const file = await stat(join(directory, segment));
    if (!file.isFile() || !file.size) throw new Error('Missing or empty HLS segment');
  }

  return { checksum, files: [manifest.mp4, ...segments, manifest.hls] };
}

export async function registerFixtureMedia(db, directory, titleId, locale, episodeId) {
  const { checksum } = await verifyFixturePackage(directory);
  await db.query(
    `INSERT INTO fixture_media_asset (source, title_id, locale, episode_id, checksum)
     VALUES ('fixture', $1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [titleId, locale, episodeId, checksum],
  );
  return checksum;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [directory, titleId, locale, episodeId] = process.argv.slice(2);
  if (!directory || !titleId || !locale || !episodeId || !process.env.DATABASE_URL) {
    throw new Error('Set DATABASE_URL and pass DIRECTORY TITLE_ID LOCALE EPISODE_ID');
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    console.log(await registerFixtureMedia(client, directory, titleId, locale, episodeId));
  } finally {
    await client.end();
  }
}
