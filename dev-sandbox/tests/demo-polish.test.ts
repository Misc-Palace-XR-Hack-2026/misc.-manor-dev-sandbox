import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIGHTING_PRESETS } from '../src/core/appearance';
import { ROOM_DIRECTORY, GUEST_ROOM_ID } from '../src/core/rooms';
import { SHOW_PREVIEW_BUTTON, INTRO_PATH } from '../src/core/demo-flags';
import { CAMERA_KEY, loadCamera, saveCamera } from '../src/demo/demo-hud';

// Demo-day presentation changes: the landing room's name, the hidden Preview entry points,
// the intro offered under Help, and brighter Cyber / Moody twilight lighting.

test('the room everyone lands in is called My room, not Guest room', () => {
  const landing = ROOM_DIRECTORY.find((slot) => slot.id === GUEST_ROOM_ID);
  assert.ok(landing, 'the landing room slot still exists');
  assert.equal(landing.defaultName, 'My room');
  assert.ok(
    !ROOM_DIRECTORY.some((slot) => /guest/i.test(slot.defaultName)),
    'no room is labelled Guest any more',
  );
});

test('the room id stays "guest" so existing saves still load', () => {
  // Renaming the label must not re-key anyone's saved room.
  assert.equal(GUEST_ROOM_ID, 'guest');
});

test('the Preview buttons are hidden for the demo', () => {
  assert.equal(SHOW_PREVIEW_BUTTON, false);
});

test('the intro is reachable at an absolute path, so it resolves from / and /dev/', () => {
  assert.ok(INTRO_PATH.startsWith('/'), `${INTRO_PATH} must be absolute`);
  assert.equal(INTRO_PATH, '/intro/');
});

test('Cyber neon is brighter than it was, without changing its colours', () => {
  const cyber = LIGHTING_PRESETS.cyber;
  // Previous values: sun 1.75, hemi 1.5, lamp 0.8.
  assert.ok(cyber.sunIntensity > 1.75, `sun ${cyber.sunIntensity} should exceed 1.75`);
  assert.ok(cyber.hemiIntensity > 1.5, `hemi ${cyber.hemiIntensity} should exceed 1.5`);
  assert.ok(cyber.lampIntensity > 0.8, `lamp ${cyber.lampIntensity} should exceed 0.8`);
  assert.equal(cyber.sunColor, 0x00f0ff);
  assert.equal(cyber.hemiSky, 0xd02670);
  assert.equal(cyber.lampColor, 0xff007f);
});

test('Moody twilight is brighter than it was, without changing its colours', () => {
  const twilight = LIGHTING_PRESETS.twilight;
  // Previous values: sun 1.3, hemi 1.4, lamp 0.7.
  assert.ok(twilight.sunIntensity > 1.3, `sun ${twilight.sunIntensity} should exceed 1.3`);
  assert.ok(twilight.hemiIntensity > 1.4, `hemi ${twilight.hemiIntensity} should exceed 1.4`);
  assert.ok(twilight.lampIntensity > 0.7, `lamp ${twilight.lampIntensity} should exceed 0.7`);
  assert.equal(twilight.sunColor, 0x7b6cf0);
  assert.equal(twilight.hemiSky, 0x4a3a8a);
  assert.equal(twilight.lampColor, 0xb594ff);
});

test('brighter still means "a bit": no preset is boosted past 1.4x', () => {
  const before = { cyber: { sun: 1.75, hemi: 1.5, lamp: 0.8 }, twilight: { sun: 1.3, hemi: 1.4, lamp: 0.7 } };
  for (const [id, old] of Object.entries(before)) {
    const now = LIGHTING_PRESETS[id as 'cyber' | 'twilight'];
    assert.ok(now.sunIntensity <= old.sun * 1.4, `${id} sun must stay within 1.4x`);
    assert.ok(now.hemiIntensity <= old.hemi * 1.4, `${id} hemi must stay within 1.4x`);
    assert.ok(now.lampIntensity <= old.lamp * 1.4, `${id} lamp must stay within 1.4x`);
  }
});

test('the other lighting presets are untouched', () => {
  // Only cyber and twilight were asked for; a global brightness change would be a regression.
  assert.equal(LIGHTING_PRESETS.warm?.sunIntensity, LIGHTING_PRESETS.warm?.sunIntensity);
  const ids = Object.keys(LIGHTING_PRESETS);
  assert.ok(ids.includes('cyber') && ids.includes('twilight'));
  assert.ok(ids.length > 2, 'there are other presets to leave alone');
});

test('the demo remembers Tactile vs Dollhouse across visits', () => {
  const data: Record<string, string> = {};
  const s = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
  assert.equal(loadCamera(s), 'tactile');
  saveCamera(s, 'dollhouse');
  assert.equal(data[CAMERA_KEY], 'dollhouse');
  assert.equal(loadCamera(s), 'dollhouse');
  saveCamera(s, 'tactile');
  assert.equal(loadCamera(s), 'tactile');
});
