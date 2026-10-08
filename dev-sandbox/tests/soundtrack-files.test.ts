import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { currentTrack, ROOM_TRACKS, trackUrl } from '../src/core/soundtrack';

const audioDir = '/home/dvgpro/Projects/misc.-palace-dev-sandbox/dev-sandbox/public/audio';

test('licensed room tracks are present MPEG files named for each soundtrack id', () => {
  for (const track of ROOM_TRACKS) {
    const path = join(audioDir, `${track}.mp3`);
    assert.equal(trackUrl(track), `/audio/${track}.mp3`);
    assert.ok(existsSync(path), `missing ${path}`);
    const bytes = readFileSync(path);
    assert.ok(bytes.length > 100_000, `${track}.mp3 too small`);
    assert.equal(bytes.subarray(0, 3).toString(), 'ID3');
  }
  assert.equal(currentTrack({}), 'original');
  assert.equal(currentTrack({ lighting: undefined, soundtrack: { mode: 'follow' } }), 'original');
});
