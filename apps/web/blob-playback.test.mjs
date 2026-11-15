import assert from 'node:assert/strict';
import test from 'node:test';
import { attachBlobPlayback } from './blob-playback.mjs';

test('playlist loads through a blob and teardown releases the player', () => {
  const calls = [];
  class Hls {
    static Events = { MEDIA_ATTACHED: 'attached', ERROR: 'error' };
    static isSupported() { return true; }
    handlers = new Map();
    on(event, handler) { this.handlers.set(event, handler); }
    attachMedia(video) {
      video.src = 'blob:https://app.example/id';
      this.handlers.get('attached')();
    }
    loadSource(url) { calls.push(url); }
    destroy() { calls.push('destroy'); }
  }

  const video = {
    ownerDocument: { location: { origin: 'https://app.example' } },
    removeAttribute() { this.src = ''; },
    load() {},
  };
  const path = '/fixture-media/signed/index.m3u8';
  assert.throws(() => attachBlobPlayback(video, Hls, 'https://upstream.example' + path), /same-origin/);
  const cleanup = attachBlobPlayback(video, Hls, path);
  assert.match(video.src, /^blob:/);
  assert.deepEqual(calls, ['https://app.example' + path]);
  cleanup();
  cleanup();
  assert.equal(video.src, '');
  assert.deepEqual(calls, ['https://app.example' + path, 'destroy']);

  class UnsupportedAttachment extends Hls {
    attachMedia() { this.handlers.get('attached')(); }
  }
  const errors = [];
  attachBlobPlayback(video, UnsupportedAttachment, path, { onError: error => errors.push(error.message) });
  assert.match(errors[0], /blob URL/);
  assert.equal(calls.at(-1), 'destroy');
  assert.equal(calls.length, 3);
});
