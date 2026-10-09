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

test('blocked autoplay retries synchronously on the first touch without changing rooms', async () => {
  const doc = new EventTarget();
  const win = new EventTarget();
  Object.assign(globalThis, { document: doc, window: win });
  let gesture = false;
  let attempts = 0;
  const audio = new FakeAudio();
  const play = audio.play.bind(audio);
  audio.play = () => {
    attempts++;
    return gesture ? play() : Promise.reject(new Error('NotAllowedError'));
  };
  const store = new Store(newRoom());
  const player = new SoundtrackPlayer(store, {
    audio, fade: async (_from, to, _ms, set) => set(to),
  });
  await player.idle();
  assert.equal(audio.paused, true);
  gesture = true;
  doc.dispatchEvent(new Event('touchend'));
  gesture = false;
  await Promise.resolve();
  assert.equal(audio.paused, false, 'play must run inside the touch handler');
  assert.equal(audio.src, trackUrl('original'));
  doc.dispatchEvent(new Event('touchend'));
  assert.equal(attempts, 2, 'later taps must not restart music');
  player.leave();
  await player.idle();
  doc.dispatchEvent(new Event('touchend'));
  assert.equal(audio.paused, true, 'away state must not be bypassed');
});

test('speaker toggles synchronously without changing the saved track and stays muted across changes', async () => {
  const store = new Store(newRoom());
  store.setSoundtrack({ mode: 'track', track: 'ember' });
  const { player, audio } = makePlayer(store);
  await player.idle();
  const saved = store.exportJson();
  player.toggleSound();
  assert.equal(audio.paused, true);
  assert.equal(player.soundState, 'muted');
  assert.equal(store.exportJson(), saved);
  store.setLighting('dawn');
  player.leave();
  player.return();
  await player.idle();
  assert.equal(audio.paused, true);
  const attempts = audio.plays;
  player.toggleSound();
  assert.equal(audio.plays, attempts + 1, 'play is called before returning from the gesture');
  assert.equal(audio.src, trackUrl('ember'));
  await Promise.resolve();
  assert.equal(player.soundState, 'playing');
  store.setSoundtrack({ mode: 'off' });
  await player.idle();
  player.toggleSound();
  assert.equal(audio.paused, true);
  assert.equal(player.soundState, 'off');
  assert.equal(store.state.soundtrack?.mode, 'off');
});

test('a pending track fade cannot stop a newer explicit unmute', async () => {
  const store = new Store(newRoom());
  const audio = new FakeAudio();
  let finishFade: (() => void) | undefined;
  const player = new SoundtrackPlayer(store, { audio, listen: false,
    fade: async (_from, to, _ms, set) => {
      if (to === 0) await new Promise<void>(resolve => { finishFade = resolve; });
      set(to);
    },
  });
  await player.idle();
  store.setLighting('dawn');
  await Promise.resolve();
  assert.ok(finishFade);
  player.toggleSound();
  player.toggleSound();
  assert.equal(audio.src, trackUrl('dawn'));
  const attempts = audio.plays;
  finishFade();
  await player.idle();
  assert.equal(audio.paused, false);
  assert.equal(audio.volume, 1);
  assert.equal(audio.plays, attempts, 'old fade must not pause and restart the gesture-unlocked audio');
});

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
