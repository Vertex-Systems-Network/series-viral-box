/**
 * Attach a signed local HLS playlist through an hls.js MediaSource adapter.
 * Call the returned cleanup when switching episodes or unmounting the player.
 */
export function attachBlobPlayback(video, Hls, grantUrl, { onError = () => {} } = {}) {
  const origin = video.ownerDocument.location.origin;
  const playlist = new URL(grantUrl, origin);
  if (playlist.origin !== origin || playlist.username || playlist.password ||
      !playlist.pathname.startsWith('/fixture-media/') ||
      !playlist.pathname.endsWith('/index.m3u8')) {
    throw new Error('Expected a same-origin fixture playback grant');
  }
  if (!Hls.isSupported()) throw new Error('This browser does not support blob playback');

  const hls = new Hls();
  let disposed = false;

  function cleanup() {
    if (disposed) return;
    disposed = true;
    hls.destroy();
    video.removeAttribute('src');
    video.load();
  }

  function fail(error) {
    cleanup();
    onError(error);
  }

  hls.on(Hls.Events.MEDIA_ATTACHED, () => {
    if (disposed) return;
    if (!video.src.startsWith('blob:')) {
      fail(new Error('The player did not attach a blob URL'));
      return;
    }
    hls.loadSource(playlist.href);
  });
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!disposed && data.fatal) fail(new Error('Playback failed: ' + data.details));
  });

  try {
    hls.attachMedia(video);
  } catch (error) {
    cleanup();
    throw error;
  }
  return cleanup;
}
