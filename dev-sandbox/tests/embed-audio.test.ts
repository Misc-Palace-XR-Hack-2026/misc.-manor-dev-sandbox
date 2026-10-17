import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportsEmbedAudio } from '../src/views/embed-audio';

test('automatic audio support is limited to exact Vimeo player URLs, not provider labels or lookalike hosts', () => {
  assert.equal(supportsEmbedAudio('vimeo', 'https://player.vimeo.com/video/123456'), true);
  for (const url of ['https://player.vimeo.com.evil.test/video/123456', 'http://player.vimeo.com/video/123456',
    'https://player.vimeo.com:444/video/123456', 'https://player.vimeo.com/not-a-player']) {
    assert.equal(supportsEmbedAudio('vimeo', url), false, url);
  }
  assert.equal(supportsEmbedAudio('page', 'https://player.vimeo.com/video/123456'), false);
  assert.equal(supportsEmbedAudio('youtube', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'), false);
  assert.equal(supportsEmbedAudio('spotify', 'https://open.spotify.com/embed/track/test'), false);
});
