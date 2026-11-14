import { attachBlobPlayback } from './blob-playback.mjs';

const video = document.querySelector('video');
const status = document.querySelector('[role=status]');
const fragment = new URLSearchParams(location.hash.slice(1));
const keys = ['titleId', 'locale', 'episodeId'];
const progress = keys.every(key => fragment.get(key))
  ? new URLSearchParams([['source', 'fixture'], ...keys.map(key => [key, fragment.get(key)])])
  : null;
let dispose;
let lastPosition;
let lastWrite = 0;
let writing = false;
let queued;
let ready = false;

async function restorePosition() {
  if (!progress) return;
  try {
    const response = await fetch('/v1/me/progress?' + progress, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return;
    const { positionSeconds } = await response.json();
    if (positionSeconds > 0 && positionSeconds < video.duration && video.paused && video.currentTime === 0) {
      video.currentTime = positionSeconds;
    }
  } catch {
    // Playback is available even when progress cannot be loaded.
  } finally {
    ready = true;
  }
}

async function savePosition(force = false) {
  if (!ready || !progress || video.readyState < 1 || !Number.isFinite(video.currentTime)) return;
  const position = video.ended ? 0 : Math.floor(video.currentTime);
  if (position === lastPosition || (!force && Date.now() - lastWrite < 10000)) return;
  if (writing) {
    if (force) queued = true;
    return;
  }
  const params = new URLSearchParams(progress);
  params.set('position', position);
  writing = true;
  lastWrite = Date.now();
  try {
    const response = await fetch('/v1/me/progress?' + params, { method: 'PUT', keepalive: true });
    if (response.ok) lastPosition = position;
  } catch {
    // A later playback event can retry.
  } finally {
    writing = false;
    if (queued) {
      queued = false;
      savePosition(true);
    }
  }
}

video.addEventListener('loadedmetadata', restorePosition, { once: true });
video.addEventListener('timeupdate', () => savePosition());
video.addEventListener('pause', () => savePosition(true));
video.addEventListener('ended', () => savePosition(true));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) savePosition(true);
});
try {
  const grant = fragment.get('grant');
  if (!grant) throw new Error('Missing playback grant');
  dispose = attachBlobPlayback(video, globalThis.Hls, grant, {
    onError: error => { status.textContent = error.message; },
  });
  video.addEventListener('loadeddata', () => { status.textContent = 'Ready to play'; });
  video.addEventListener('playing', () => { status.textContent = 'Playing'; });
} catch (error) {
  status.textContent = error.message;
}
addEventListener('pagehide', () => { savePosition(true); dispose?.(); }, { once: true });
