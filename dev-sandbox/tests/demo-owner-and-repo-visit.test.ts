import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeDemoOwner, seedDemoRoom, DEMO_OWNER } from '../src/demo/demo-room';

// Pin two production regressions:
// 1) the public demo sometimes showed 'Visitor' instead of 'My room';
// 2) loading a repo room from settings overwrote the local room instead of opening a reversible visit.

test("new demo seeds use 'My room'", () => {
  const room = seedDemoRoom();
  assert.equal(room.owner, DEMO_OWNER);
});

test("legacy demo owner label 'Visitor' is migrated in memory", () => {
  const room = seedDemoRoom();
  room.owner = 'Visitor';
  const changed = normalizeDemoOwner(room);
  assert.equal(changed, true);
  assert.equal(room.owner, DEMO_OWNER);
});

test('modern demo owner labels are left untouched', () => {
  const room = seedDemoRoom();
  room.owner = 'My custom room name';
  const changed = normalizeDemoOwner(room);
  assert.equal(changed, false);
  assert.equal(room.owner, 'My custom room name');
});

test('settings repo loader opens a visit (reversible) instead of replacing the saved room', () => {
  const source = readFileSync(join(process.cwd(), 'src/views/menu.ts'), 'utf8');
  assert.match(source, /this\.store\.visit\(room\.data, room\.name\)/, 'repo load should route through visit()');
  assert.doesNotMatch(source, /this\.store\.replaceState\(room\.data\)/, 'repo load must not overwrite state via replaceState()');
});
