import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, newRoom } from '../src/core/store';
import { roomSoundtrack, SoundtrackPlayer } from '../src/views/soundtrack';
globalThis.localStorage = { getItem: () => null, setItem() {} } as unknown as Storage;
test('desktop and XR resolve the same soundtrack player; pause/mute are synchronous and embed still wins', async () => {
  const store = new Store(newRoom());
  const audio = { src: '', volume: 1, loop: false, preload: '', paused: true, plays: 0, addEventListener() {}, removeAttribute() {}, async play() { this.plays++; this.paused = false; }, pause() { this.paused = true; } };
  const player = new SoundtrackPlayer(store, { audio, listen: false, fade: async (_a,b,_ms,set) => set(b) });
  assert.equal(roomSoundtrack(store), player);
  player.startFromGesture();
  await player.idle();
  assert.equal(audio.plays, 1);
  player.pauseFromGesture();
  assert.equal(audio.paused, true);
  player.startFromGesture();
  assert.equal(audio.paused, false);
  player.muteFromGesture();
  assert.equal(audio.paused, true);
  player.setEmbedPlaying(true);
  player.startFromGesture();
  assert.equal(audio.paused, true);
});

test('entering VR unlocks audio silently so the in-VR jukebox is not browser-blocked', async () => {
  const store = new Store(newRoom());
  // A headset-like browser: play() is rejected unless the element was already unlocked by a gesture.
  const audio = {
    src: '', volume: 1, loop: false, preload: '', paused: true, plays: 0, unlocked: false,
    addEventListener() {}, removeAttribute() {},
    async play() { if (!this.unlocked) throw new Error('NotAllowedError'); this.plays++; this.paused = false; },
    pause() { this.paused = true; },
  };
  const player = new SoundtrackPlayer(store, { audio, listen: false, fade: async (_a, b, _ms, set) => set(b) });
  store.setSoundtrack({ mode: 'track', track: 'original' });

  // Without the unlock, an in-session Play is refused and reported as blocked, not playing.
  player.startFromGesture();
  await player.idle();
  assert.equal(audio.plays, 0);
  assert.notEqual(player.soundState, 'playing');
  assert.equal(player.audioUnlocked, false);

  // The real order: the Enter VR click comes first, before anyone has asked for music, so the
  // unlock must stay silent. Use a second player to represent that untouched state.
  const quiet = { ...audio, plays: 0, paused: true, unlocked: true };
  const fresh = new SoundtrackPlayer(new Store(newRoom()), { audio: quiet, listen: false, fade: async (_a, b, _ms, set) => set(b) });
  fresh.primeFromGesture();
  await fresh.idle();
  await Promise.resolve();
  assert.equal(quiet.paused, true, 'priming never starts audible music on its own');

  // Back to the blocked player: once the element unlocks, the Play the user already pressed is honoured.
  audio.unlocked = true;
  player.primeFromGesture();
  await player.idle();
  await Promise.resolve();
  assert.equal(player.audioUnlocked, true);

  // And the in-VR Play works, and switching tracks in VR follows.
  player.startFromGesture();
  await player.idle();
  assert.equal(audio.paused, false);
  assert.equal(player.soundState, 'playing');
  const first = audio.src;
  store.setSoundtrack({ mode: 'track', track: 'cyber' });
  await player.idle();
  assert.notEqual(audio.src, first, 'a track change in VR actually swaps the source');
});

test('priming does not disturb music that is already playing', async () => {
  const store = new Store(newRoom());
  const audio = { src: '', volume: 1, loop: false, preload: '', paused: true, plays: 0, addEventListener() {}, removeAttribute() {}, async play() { this.plays++; this.paused = false; }, pause() { this.paused = true; } };
  const player = new SoundtrackPlayer(store, { audio, listen: false, fade: async (_a, b, _ms, set) => set(b) });
  store.setSoundtrack({ mode: 'track', track: 'original' });
  player.startFromGesture();
  await player.idle();
  assert.equal(player.soundState, 'playing');
  const plays = audio.plays;
  player.primeFromGesture();
  await player.idle();
  assert.equal(audio.plays, plays, 'no second play() on an already-playing element');
  assert.equal(audio.paused, false);
  assert.equal(audio.volume, 1, 'priming never silences live music');
});

