import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/package-media.mjs LOCAL_FILE OUTPUT_DIRECTORY');
const root = resolve(output);
await mkdir(root, { recursive: true });
const stage = await mkdtemp(join(root, '.staging-'));

try {
  const master = join(stage, 'episode.mp4');
  await run('ffmpeg', [
    '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', resolve(input),
    '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-force_key_frames', 'expr:gte(t,n_forced*4)', '-c:a', 'aac', '-movflags', '+faststart', master,
  ], { timeout: 300_000 });
  await run('ffmpeg', [
    '-nostdin', '-v', 'error', '-i', master, '-c', 'copy', '-hls_time', '4',
    '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
    '-hls_segment_filename', join(stage, 'segment-%05d.ts'), join(stage, 'index.m3u8'),
  ], { timeout: 300_000 });
  const playlist = await readFile(join(stage, 'index.m3u8'), 'utf8');
  if (!playlist.includes('#EXT-X-ENDLIST') || !/^segment-\d+\.ts$/m.test(playlist)) {
    throw new Error('FFmpeg did not produce a complete HLS playlist');
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(master)) hash.update(chunk);
  const checksum = hash.digest('hex');
  const manifest = { checksum, mp4: 'episode.mp4', hls: 'index.m3u8' };
  await writeFile(join(stage, 'media.json'), JSON.stringify(manifest, null, 2) + '\n');
  const destination = join(root, checksum);
  try {
    await rename(stage, destination);
  } catch (error) {
    if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
    const existing = JSON.parse(await readFile(join(destination, 'media.json'), 'utf8'));
    if (existing.checksum !== checksum) throw error;
  }
  console.log(JSON.stringify({ directory: destination, ...manifest }));
} finally {
  await rm(stage, { recursive: true, force: true });
}
