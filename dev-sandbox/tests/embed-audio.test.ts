import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportsEmbedAudio } from '../src/views/embed-audio';

test('automatic audio support is limited to exact Vimeo, YouTube and SoundCloud player URLs', () => {
  assert.equal(supportsEmbedAudio('vimeo', 'https://player.vimeo.com/video/123456'), true);
  for (const url of ['https://player.vimeo.com.evil.test/video/123456', 'http://player.vimeo.com/video/123456',
    'https://player.vimeo.com:444/video/123456', 'https://player.vimeo.com/not-a-player']) {
    assert.equal(supportsEmbedAudio('vimeo', url), false, url);
  }
  assert.equal(supportsEmbedAudio('page', 'https://player.vimeo.com/video/123456'), false);
  assert.equal(supportsEmbedAudio('youtube', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'), true);
  assert.equal(supportsEmbedAudio('youtube', 'https://www.youtube.com/embed/dQw4w9WgXcQ'), true);
  for (const url of ['http://www.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube.com:444/embed/dQw4w9WgXcQ',
    'https://www.youtube.com.evil.test/embed/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/embed/invalid', 'https://youtube.com/embed/dQw4w9WgXcQ']) {
    assert.equal(supportsEmbedAudio('youtube', url), false, url);
  }
  assert.equal(supportsEmbedAudio('page', 'https://www.youtube.com/embed/dQw4w9WgXcQ'), false);
  assert.equal(supportsEmbedAudio('soundcloud', 'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fa%2Fb'), true);
  for (const url of ['https://w.soundcloud.com/player', 'https://soundcloud.com/a/b',
    'https://w.soundcloud.com.evil.test/player/', 'http://w.soundcloud.com/player/']) {
    assert.equal(supportsEmbedAudio('soundcloud', url), false, url);
  }
  assert.equal(supportsEmbedAudio('page', 'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fa%2Fb'), false);
  assert.equal(supportsEmbedAudio('spotify', 'https://open.spotify.com/embed/track/test'), false);
});
