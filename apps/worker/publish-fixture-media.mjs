import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';
import { verifyFixturePackage } from './register-fixture-media.mjs';

const run = promisify(execFile);

export function localFixtureStorage(directory) {
  const root = resolve(directory);
  function pathFor(key) {
    if (!/^fixtures\/[a-f0-9]{64}\/[a-f0-9-]{36}\/(?:episode\.mp4|index\.m3u8|segment-\d+\.ts)$/.test(key)) {
      throw new Error('Invalid fixture storage key');
    }
    return join(root, key);
  }
  return {
    bucket: 'local:' + root,
    async put(key, input) {
      const output = pathFor(key);
      await mkdir(dirname(output), { recursive: true });
      await copyFile(input, output);
    },
    async remove(key) { await rm(pathFor(key), { force: true }); },
  };
}

export async function publishFixtureMedia(db, storage, directory, titleId, locale, episodeId) {
  const { checksum, files } = await verifyFixturePackage(directory);
  const episode = [titleId, locale, episodeId];
  const { rows } = await db.query(
    `SELECT storage_bucket, storage_prefix FROM fixture_media_asset
     WHERE source = 'fixture' AND title_id = $1 AND locale = $2 AND episode_id = $3
       AND checksum = $4 AND storage_bucket = $5 AND available_at IS NOT NULL`,
    [...episode, checksum, storage.bucket],
  );
  if (rows.length) return rows[0].storage_prefix;

  const prefix = `fixtures/${checksum}/${randomUUID()}`;
  const uploaded = [];
  let databaseWriteAttempted = false;
  try {
    for (const file of files) {
      const key = prefix + '/' + file;
      uploaded.push(key);
      await storage.put(key, join(directory, file));
    }
    databaseWriteAttempted = true;
    const result = await db.query(
      `INSERT INTO fixture_media_asset
         (source, title_id, locale, episode_id, checksum, storage_bucket, storage_prefix, available_at)
       VALUES ('fixture', $1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (source, title_id, locale, episode_id, checksum)
       DO UPDATE SET storage_bucket = EXCLUDED.storage_bucket,
         storage_prefix = EXCLUDED.storage_prefix, available_at = EXCLUDED.available_at
       WHERE fixture_media_asset.available_at IS NULL
       RETURNING storage_prefix`,
      [...episode, checksum, storage.bucket, prefix],
    );
    if (result.rows.length) return prefix;
    const winner = await db.query(
      `SELECT storage_bucket, storage_prefix FROM fixture_media_asset
       WHERE source = 'fixture' AND title_id = $1 AND locale = $2 AND episode_id = $3 AND checksum = $4`,
      [...episode, checksum],
    );
    if (winner.rows[0]?.storage_bucket !== storage.bucket) {
      throw new Error('Fixture asset is already published to a different bucket');
    }
    await Promise.allSettled(uploaded.map(key => storage.remove(key)));
    return winner.rows[0].storage_prefix;
  } catch (error) {
    // An ambiguous database commit can already point at these objects.
    // Keep the prefix for reconciliation once the database write is attempted.
    if (!databaseWriteAttempted) {
      await Promise.allSettled(uploaded.map(key => storage.remove(key)));
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [directory, titleId, locale, episodeId] = process.argv.slice(2);
  const { DATABASE_URL, FIXTURE_MEDIA_BUCKET: bucket, FIXTURE_S3_ENDPOINT: endpoint, FIXTURE_MEDIA_DIR = './var/media' } = process.env;
  if (!directory || !titleId || !locale || !episodeId || !DATABASE_URL ||
      (bucket && !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket))) {
    throw new Error('Set DATABASE_URL and pass DIRECTORY TITLE_ID LOCALE EPISODE_ID');
  }
  const flags = endpoint ? ['--endpoint-url', endpoint] : [];
  const storage = bucket ? {
    bucket,
    put(key, path) {
      const mime = key.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' :
        key.endsWith('.ts') ? 'video/mp2t' : 'video/mp4';
      return run('aws', [...flags, 's3', 'cp', path, 's3://' + bucket + '/' + key,
        '--content-type', mime, '--only-show-errors'], { timeout: 300_000 });
    },
    remove(key) {
      return run('aws', [...flags, 's3', 'rm', 's3://' + bucket + '/' + key,
        '--only-show-errors'], { timeout: 30_000 });
    },
  } : localFixtureStorage(FIXTURE_MEDIA_DIR);
  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    console.log(await publishFixtureMedia(client, storage, directory, titleId, locale, episodeId));
  } finally {
    await client.end();
  }
}
