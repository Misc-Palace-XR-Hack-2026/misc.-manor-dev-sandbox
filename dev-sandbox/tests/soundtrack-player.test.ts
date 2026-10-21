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
  const audio = new FakeAudio();
  const store = new Store(newRoom());
  const player = new SoundtrackPlayer(store, {
    audio, listen: false, fade: async (_from, to, _ms, set) => set(to),
  });
  await player.idle();
  assert.equal(audio.paused, true, 'player starts paused');

  // First toggleSound without user gesture - successfully plays in our test (FakeAudio always allows)
  player.toggleSound();
  assert.equal(audio.paused, false, 'toggleSound enables playback');
  assert.equal(audio.src, trackUrl('original'));

  // Toggling mutes
  player.toggleSound();
  assert.equal(audio.paused, true, 'toggle while playing mutes');

  // Toggling resumes
  player.toggleSound();
  assert.equal(audio.paused, false, 'toggle while muted resumes');

  // leave() pauses
  player.leave();
  await player.idle();
  assert.equal(audio.paused, true, 'leave pauses');

  // return() resumes
  player.return();
  await player.idle();
  assert.equal(audio.paused, false, 'return resumes');
});

test('speaker toggles synchronously without changing the saved track and stays muted across changes', async () => {
  const store = new Store(newRoom());
  const { player, audio } = makePlayer(store);
  await player.idle();
  const saved = store.exportJson();
  player.toggleSound();
  assert.equal(audio.paused, false, 'first toggleSound enables playback');
  assert.equal(player.soundState, 'playing');
  assert.equal(store.exportJson(), saved, 'toggleSound does not change saved state');
  store.setLighting('dawn');
  await player.idle();
  assert.equal(audio.src, trackUrl('dawn'), 'lighting change auto-plays new track');
  player.toggleSound();
  assert.equal(audio.paused, true, 'toggle while playing mutes');
  assert.equal(player.soundState, 'muted');
  store.setLighting('cyber');
  await player.idle();
  assert.equal(audio.paused, true, 'mute stays across lighting changes');
  player.toggleSound();
  assert.equal(audio.paused, false, 'toggle while muted resumes');
  assert.equal(audio.src, trackUrl('cyber'), 'audio follows current lighting when resume from mute');
  store.setSoundtrack({ mode: 'off' });
  await player.idle();
  assert.equal(audio.paused, true, 'off mode stops playback');
  assert.equal(player.soundState, 'off');
});

test('a pending track fade cannot stop a newer explicit unmute', async () => {
  const store = new Store(newRoom());
  store.setLighting('dawn');
  const audio = new FakeAudio();
  let finishFade: (() => void) | undefined;
  const player = new SoundtrackPlayer(store, { audio, listen: false,
    fade: async (_from, to, _ms, set) => {
      if (to === 0) await new Promise<void>(resolve => { finishFade = resolve; });
      set(to);
    },
  });
  await player.idle();
  player.toggleSound();
  await player.idle();
  assert.equal(audio.src, trackUrl('dawn'));
  player.toggleSound();
  assert.equal(audio.paused, true, 'mute pauses immediately');
  // Now change lighting while muted - this should not trigger a fade since muted
  store.setLighting('cyber');
  await player.idle();
  // Toggle to unmute - the player should resume without any pending fade interference
  player.toggleSound();
  assert.equal(audio.paused, false);
  assert.equal(audio.src, trackUrl('cyber'), 'lighting changed while muted, now play cyber');
  await player.idle();
  assert.equal(audio.volume, 1);
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
  player.toggleSound();
  store.setLighting('dawn');
  await player.idle();
  assert.equal(audio.src, trackUrl('dawn'));
  assert.equal(audio.playing, 1);

  store.setLighting('cyber');
  await player.idle();
  assert.equal(audio.src, trackUrl('cyber'));
  assert.equal(audio.playing, 1);
  assert.ok(fades.some((f) => f.to === 0), 'previous track must fade out before the next starts');
  assert.deepEqual(audio.srcHistory.filter(Boolean), [trackUrl('original'), trackUrl('dawn'), trackUrl('cyber')]);

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
  player.toggleSound();
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

test('constructing the player with a track available and a fake audio must NOT call audio.play() until toggleSound()', async () => {
  const store = new Store(newRoom());
  store.setLighting('dawn');
  const audio = new FakeAudio();
  const player = new SoundtrackPlayer(store, { audio, listen: false, fade: async (_from, to, _ms, set) => set(to) });
  await player.idle();
  assert.equal(audio.plays, 0, 'play must not be called during construction');
  assert.equal(audio.paused, true);
  player.toggleSound();
  assert.equal(audio.plays, 1, 'play is called after toggleSound');
  assert.equal(audio.paused, false);
});

test('after toggleSound() then toggleSound() (muted), changing store lighting must not call play()', async () => {
  const store = new Store(newRoom());
  store.setLighting('dawn');
  const audio = new FakeAudio();
  const player = new SoundtrackPlayer(store, { audio, listen: false, fade: async (_from, to, _ms, set) => set(to) });
  await player.idle();
  player.toggleSound();
  await player.idle();
  const plays = audio.plays;
  player.toggleSound();
  assert.equal(player.soundState, 'muted');
  store.setLighting('cyber');
  await player.idle();
  assert.equal(audio.plays, plays, 'play must not be called when muted');
  assert.equal(audio.paused, true);
});

test('embed pause is immediate and independent of away, selection changes and speaker gestures', async () => {
  const store = new Store(newRoom());
  const { player, audio } = makePlayer(store);
  await player.idle();
  player.toggleSound();
  player.setEmbedPlaying(true);
  assert.equal(audio.paused, true, 'no fade overlap with embed');
  player.return();
  player.toggleSound(); // mute while suspended
  player.toggleSound(); // re-enable intent, but do not play
  store.setLighting('dawn');
  await player.idle();
  assert.equal(audio.paused, true, 'return, speaker and sync cannot override embed');
  player.leave();
  player.setEmbedPlaying(false);
  await player.idle();
  assert.equal(audio.paused, true, 'ending embed must not clear away');
  player.return();
  await player.idle();
  assert.equal(audio.paused, false);
});

test('embed interruption invalidates an in-flight fade and clamps volume writes', async () => {
  const store = new Store(newRoom());
  const audio = new FakeAudio();
  let release: (() => void) | undefined;
  const player = new SoundtrackPlayer(store, { audio, listen: false,
    fade: async (_from, to, _ms, set) => {
      set(-0.01); assert.equal(audio.volume, 0);
      set(1.01); assert.equal(audio.volume, 1);
      if (to === 0) await new Promise<void>(resolve => { release = resolve; });
      set(to);
    },
  });
  await player.idle();
  player.toggleSound();
  store.setLighting('dawn');
  await Promise.resolve();
  assert.ok(release, 'track fade is in flight');
  player.setEmbedPlaying(true);
  assert.equal(audio.paused, true, 'embed pauses before pending fade resolves');
  release();
  await player.idle();
  assert.equal(audio.paused, true);
  player.setEmbedPlaying(false);
  await player.idle();
  assert.equal(audio.paused, false);
});

test('disabled, off and user-muted music do not resume after embed dismissal', async () => {
  const store = new Store(newRoom());
  const {player, audio} = makePlayer(store);
  await player.idle();
  player.setEmbedPlaying(true);
  player.setEmbedPlaying(false);
  await player.idle();
  assert.equal(audio.plays, 0);
  player.toggleSound();
  player.setEmbedPlaying(true);
  player.toggleSound();
  player.setEmbedPlaying(false);
  await player.idle();
  assert.equal(audio.paused, true);
  store.setSoundtrack({mode:'off'});
  player.setEmbedPlaying(true);
  player.setEmbedPlaying(false);
  await player.idle();
  assert.equal(audio.paused, true);
});

test('an in-environment embed play message pauses room music; mere iframe presence does not', async () => {
  const store = new Store(newRoom());
  const { player, audio } = makePlayer(store);
  await player.idle();
  player.toggleSound();
  await player.idle();
  assert.equal(audio.paused, false);
  player.setEmbedPlaying(true);
  await player.idle();
  assert.equal(audio.paused, true, 'actual embed playback pauses room music');
  player.setEmbedPlaying(false);
  await player.idle();
  assert.equal(audio.paused, false, 'stopping embed resumes unless muted');
  player.toggleSound();
  player.setEmbedPlaying(true);
  player.setEmbedPlaying(false);
  await player.idle();
  assert.equal(audio.paused, true, 'muted stays muted after embed ends');
});
