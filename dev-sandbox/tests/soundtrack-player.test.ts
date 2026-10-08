import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SoundtrackPlayer, type AudioLike } from '../src/views/soundtrack';
import { Store, newRoom } from '../src/core/store';
import { trackUrl } from '../src/core/soundtrack';

globalThis.localStorage = { getItem: () => null, setItem: () => {} } as unknown as Storage;

class FakeAudio implements AudioLike {
  src = '';
  volume = 1;
  loop = false;
  preload = 'none';
  paused = true;
  plays = 0;
  pauses = 0;
  srcHistory: string[] = [];
  playing = 0;
  addEventListener(): void {}
  removeAttribute(name: string): void {
    if (name === 'src') this.src = '';
  }
  play(): Promise<void> {
    this.paused = false;
    this.plays += 1;
    this.playing += 1;
    this.srcHistory.push(this.src);
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
    this.pauses += 1;
    this.playing = 0;
  }
}

function makePlayer(store: Store, audio = new FakeAudio()) {
  const fades: Array<{ from: number; to: number }> = [];
  const player = new SoundtrackPlayer(store, {
    audio,
    listen: false,
    fade: async (from, to, _ms, set) => {
      fades.push({ from, to });
      set(to);
    },
  });
  return { player, audio, fades };
}

test('changing lighting or track never leaves two sources playing; previous fades out first', async () => {
  const store = new Store(newRoom());
  const { player, audio, fades } = makePlayer(store);
  store.setLighting('dawn');
  await player.idle();
  assert.equal(audio.src, trackUrl('dawn'));
  assert.equal(audio.playing, 1);

  store.setLighting('cyber');
  await player.idle();
  assert.equal(audio.src, trackUrl('cyber'));
  assert.equal(audio.playing, 1);
  assert.ok(fades.some((f) => f.to === 0), 'previous track must fade out before the next starts');
  assert.deepEqual(audio.srcHistory.filter(Boolean), [trackUrl('dawn'), trackUrl('cyber')]);

  store.setSoundtrack({ mode: 'track', track: 'ember' });
  await player.idle();
  assert.equal(audio.src, trackUrl('ember'));
  assert.equal(audio.playing, 1);
});

test('opening a link or hiding the page pauses the soundtrack until return', async () => {
  const store = new Store(newRoom());
  store.setLighting('sunset');
  const { player, audio } = makePlayer(store);
  await player.idle();
  assert.equal(audio.paused, false);

  player.leave();
  await player.idle();
  assert.equal(audio.paused, true);
  assert.equal(audio.playing, 0);

  player.return();
  await player.idle();
  assert.equal(audio.paused, false);
  assert.equal(audio.src, trackUrl('sunset'));
  assert.equal(audio.playing, 1);
});
