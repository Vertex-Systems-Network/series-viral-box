import { attachBlobPlayback } from './blob-playback.mjs';

const video = document.querySelector('video');
const status = document.querySelector('[role=status]');
let dispose;
try {
  const grant = new URLSearchParams(location.hash.slice(1)).get('grant');
  if (!grant) throw new Error('Missing playback grant');
  dispose = attachBlobPlayback(video, globalThis.Hls, grant, {
    onError: error => { status.textContent = error.message; },
  });
  video.addEventListener('loadeddata', () => { status.textContent = 'Ready to play'; });
  video.addEventListener('playing', () => { status.textContent = 'Playing'; });
} catch (error) {
  status.textContent = error.message;
}
addEventListener('pagehide', () => dispose?.(), { once: true });
