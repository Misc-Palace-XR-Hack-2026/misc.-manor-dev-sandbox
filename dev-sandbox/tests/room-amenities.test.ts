import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, newRoom } from '../src/core/store';
import { randomPortalDrop, ensureJukeboxTrack } from '../src/core/room-amenities';
import { dropKey } from '../src/core/random-drop';
import { panelButtons, runPanelAction } from '../src/xr/interaction';
import { JUKEBOX_POS, SAVE_POINT_POS } from '../src/core/intro-timeline';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

globalThis.localStorage = { getItem: () => null, setItem() {} } as unknown as Storage;
test('portal drop uses production pool, dedupes and remains one undoable store operation', () => {
  const store = new Store(newRoom());
  const before = store.exportJson();
  const pool = new Map([['test', Array.from({ length: 10 }, (_, i) => ({ content: { id: 'i'+i, title: 'Item '+i, type: 'link' as const, sourceKind: 'url' as const, sourceRef: 'https://example.com/'+i, tags: [], createdAt: '' }, kind: 'spoon' as const, room: 'test' }))]]);
  const result = randomPortalDrop(store, pool);
  assert.ok(result.placed.length >= 4);
  assert.equal(new Set(store.state.contentItems.map(dropKey)).size, store.state.contentItems.length);
  store.undo();
  assert.equal(store.exportJson(), before);
});
test('jukebox first open chooses a track without changing explicit off or a track', () => {
  const store = new Store(newRoom());
  ensureJukeboxTrack(store);
  assert.equal(store.state.soundtrack?.mode, 'track');
  const chosen = store.state.soundtrack;
  ensureJukeboxTrack(store);
  assert.deepEqual(store.state.soundtrack, chosen);
  store.setSoundtrack({ mode: 'off' });
  ensureJukeboxTrack(store);
  assert.deepEqual(store.state.soundtrack, { mode: 'off' });
});
test('VR scenery sits exactly where the public build puts it', () => {
  const vr = readFileSync(join(process.cwd(), 'src/xr/amenities.ts'), 'utf8');
  const demo = readFileSync(join(process.cwd(), 'src/demo/demo-app.ts'), 'utf8');

  // Both views must read the one shared anchor, not a hand-tuned copy of it.
  assert.match(vr, /position\.set\(\.\.\.SAVE_POINT_POS\)/, 'portal uses the shared anchor');
  assert.match(vr, /position\.set\(\.\.\.JUKEBOX_POS\)/, 'jukebox uses the shared anchor');
  assert.doesNotMatch(vr, /position\.set\(\s*\d/, 'no literal coordinates left in the VR scenery');

  // Facing and scale match the public build's treatment.
  assert.match(demo, /jukebox\.group\.rotation\.y = -Math\.PI \/ 2/);
  assert.match(vr, /jukebox\.group\.rotation\.y = -Math\.PI \/ 2/);
  assert.match(demo, /const JUKEBOX_SCALE = 0\.6/);
  assert.match(vr, /const JUKEBOX_SCALE = 0\.6/);

  // Sanity: the anchors are the production ones, off opposite sides of the room.
  assert.deepEqual(JUKEBOX_POS, [11.4, 0, 1.3]);
  assert.deepEqual(SAVE_POINT_POS, [2.6, 0, 8.45]);
});

test('portal and jukebox pages expose real actions independent of onboarding', () => {
  const store = new Store(newRoom());
  assert.deepEqual(panelButtons(store, 'portal').map(b => b.id), ['page:home', 'page:create', 'portal:drop', 'portal:files', 'portal:clean']);
  const music = panelButtons(store, 'jukebox').map(b => b.id);
  for (const id of ['music:follow', 'music:off', 'player:play', 'player:mute', 'player:pause']) assert.ok(music.includes(id));
  assert.deepEqual(runPanelAction(store, 'portal:files'), { portalFiles: true });
  assert.deepEqual(runPanelAction(store, 'player:play'), { musicAction: 'play' });
});
