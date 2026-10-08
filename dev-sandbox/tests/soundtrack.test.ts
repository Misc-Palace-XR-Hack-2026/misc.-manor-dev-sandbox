import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, newRoom, validateRoom } from '../src/core/store';
import { currentTrack, LIGHTING_TRACKS, ROOM_TRACKS, soundtrackFromUnknown, validSoundtrack } from '../src/core/soundtrack';

globalThis.localStorage = { getItem: () => null, setItem: () => {} } as unknown as Storage;

test('room soundtrack can follow lighting, pick a track, or play nothing', () => {
  const store = new Store(newRoom());
  assert.equal(store.state.soundtrack, undefined);
  assert.equal(currentTrack(store.state), undefined);

  store.setLighting('dawn');
  assert.equal(currentTrack(store.state), LIGHTING_TRACKS.dawn);

  store.setSoundtrack({ mode: 'off' });
  assert.equal(store.state.soundtrack?.mode, 'off');
  assert.equal(currentTrack(store.state), undefined);

  store.setSoundtrack({ mode: 'track', track: 'cyber' });
  assert.equal(currentTrack(store.state), 'cyber');
  store.setLighting('candlelight');
  assert.equal(currentTrack(store.state), 'cyber');

  store.setSoundtrack({ mode: 'follow' });
  assert.equal(currentTrack(store.state), LIGHTING_TRACKS.candlelight);

  const previous = store.exportJson();
  store.setSoundtrack({ mode: 'off' });
  store.undo();
  assert.equal(store.exportJson(), previous);

  const copy = new Store(newRoom());
  copy.replaceState(JSON.parse(store.exportJson()));
  assert.deepEqual(copy.state.soundtrack, store.state.soundtrack);
  assert.equal(validateRoom(store.state), null);
  assert.match(validateRoom({ ...store.state, soundtrack: { mode: 'track', track: 'missing' } })!, /soundtrack/i);
  assert.ok(validSoundtrack({ mode: 'off' }));
  assert.equal(soundtrackFromUnknown({ soundtrack: { mode: 'track', track: 'dawn' } })?.track, 'dawn');
  assert.deepEqual(Object.keys(LIGHTING_TRACKS).sort(), [...ROOM_TRACKS].sort());
});
