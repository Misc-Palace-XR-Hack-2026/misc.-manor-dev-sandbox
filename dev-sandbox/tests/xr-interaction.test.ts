import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, newRoom } from '../src/core/store';
import {
  XR_LANDINGS,
  canEnterVr,
  enterReason,
  teleportOffset,
  snapTurnOffset,
  landingAt,
  objectHitFrom,
  objectIdFromRay,
  destinationHitFrom,
  xrSelect,
  spawnPosition,
  walkableAt,
  walkableFloorPad,
  panelButtons,
  runPanelAction,
  inspectPreview,
  loftBeaconVisible,
  objectActions,
  objectMenuAnchor,
  objectMenuHit,
  dedicatedRooms,
  stickForwardTeleport,
  xrSessionInit,
} from '../src/xr/interaction';
import { OBJECT_KINDS } from '../src/core/types';
import { LIGHTING_PRESETS } from '../src/core/appearance';
import { ROOM_TRACKS } from '../src/core/soundtrack';

globalThis.localStorage = { getItem: () => null, setItem: () => {} } as unknown as Storage;

test('Enter VR requests a DOM overlay so browser iframe previews can play in-headset', () => {
  const root = { id: 'xr-dom-overlay' } as HTMLElement;
  const init = xrSessionInit(root);
  assert.deepEqual(init.optionalFeatures, ['local-floor', 'dom-overlay']);
  assert.equal(init.domOverlay?.root, root);
});

test('Enter VR is disabled until a secure immersive-vr session is available', async () => {
  assert.equal(canEnterVr({ isSecureContext: false, xr: null }), false);
  assert.match(enterReason({ isSecureContext: false, xr: null }), /https/i);
  assert.equal(canEnterVr({ isSecureContext: true, xr: null }), false);
  assert.match(enterReason({ isSecureContext: true, xr: null }), /WebXR/i);
  const xr = { isSessionSupported: async (mode: string) => mode === 'immersive-vr' };
  assert.equal(await canEnterVr({ isSecureContext: true, xr }), true);
  assert.equal(enterReason({ isSecureContext: true, xr }), '');
});

test('headset and controllers share the player offset instead of leaving hands at the origin', () => {
  const player = spawnPosition();
  assert.deepEqual(player, { x: 4.2, y: 0, z: 3.4 });
  assert.ok(player.x > 1 && player.z > 1);
  const hand = { x: 0.25, y: 1.2, z: -0.4 };
  const withHeadset = { x: player.x + hand.x, y: player.y + hand.y, z: player.z + hand.z };
  const distIfLeftAtOrigin = Math.hypot(player.x - hand.x, player.z - hand.z);
  const distIfParented = Math.hypot(player.x - withHeadset.x, player.y - withHeadset.y, player.z - withHeadset.z);
  assert.ok(distIfLeftAtOrigin > 3, 'origin-parented controllers sit meters away from the headset');
  assert.ok(distIfParented < 2, 'player-parented controllers stay at arm length');
});

test('teleport accepts any walkable floor or loft point, not only tiny pads', () => {
  const floor = walkableAt({ x: 3.1, y: 0.02, z: 2.8 });
  assert.deepEqual(floor, { x: 3.1, y: 0, z: 2.8 });
  const loft = walkableAt({ x: 2.0, y: 2.35, z: 1.6 });
  assert.deepEqual(loft, { x: 2.0, y: 2.3, z: 1.6 });
  assert.equal(walkableAt({ x: 0, y: 0, z: 0 }), null);
  assert.equal(walkableAt({ x: -1, y: 0, z: 3 }), null);
});

test('VR teleport covers the extended floor, not only the original 6.3 room', () => {
  assert.deepEqual(walkableAt({ x: 8.2, y: 0.02, z: 4.2 }), { x: 8.2, y: 0, z: 4.2 });
  assert.deepEqual(walkableAt({ x: 5.4, y: 0, z: 6.6 }), { x: 5.4, y: 0, z: 6.6 });
  assert.deepEqual(walkableAt({ x: 9.6, y: 0, z: 5.8 }), { x: 9.6, y: 0, z: 5.8 });
  const pad = walkableFloorPad();
  assert.ok(pad.width > 9, `walk pad width ${pad.width} must cover the 10.3 interior`);
  assert.ok(pad.depth > 6.4, `walk pad depth ${pad.depth} must cover the 7.3 interior`);
  assert.ok(pad.x > 4.5, 'pad center follows the expanded room, not the old 3.3 midpoint');
});

test('stick-forward teleport uses same-frame floor hover and ignores placing mode', () => {
  const hover = { x: 3.1, y: 0.02, z: 2.8 };
  assert.deepEqual(stickForwardTeleport(hover, false, -0.8), { x: 3.1, y: 0, z: 2.8 });
  assert.equal(stickForwardTeleport(null, false, -0.8), null, 'cleared hover never teleports');
  assert.equal(stickForwardTeleport(hover, true, -0.8), null, 'placing must not steal the stick');
  assert.equal(stickForwardTeleport(hover, false, -0.2), null, 'needs a forward deflection');
  assert.deepEqual(stickForwardTeleport({ x: 2.0, y: 2.35, z: 1.6 }, false, -1), { x: 2.0, y: 2.3, z: 1.6 });
});

test('loft beacon is only visible in VR while standing on the floor', () => {
  assert.equal(loftBeaconVisible(false, 0), false);
  assert.equal(loftBeaconVisible(true, 0), true);
  assert.equal(loftBeaconVisible(true, 2.3), false);
  assert.deepEqual(walkableAt({ x: 2.0, y: 3.05, z: 1.6 }), { x: 2.0, y: 2.3, z: 1.6 });
});

test('teleport and snap turn move the player rig, not saved placements', () => {
  const store = new Store(newRoom());
  const before = store.exportJson();
  const loft = landingAt('loft');
  assert.ok(loft);
  const offset = teleportOffset({ x: 0, y: 0, z: 0 }, loft!);
  assert.equal(offset.x, -loft!.x);
  assert.equal(offset.z, -loft!.z);
  const turn = snapTurnOffset({ x: 4.2, y: 0, z: 3.4 }, Math.PI / 4);
  assert.ok(Math.abs(turn.y) > 0);
  assert.equal(store.exportJson(), before);
  assert.ok(XR_LANDINGS.every((p) => p.y === 0 || p.y === 2.3));
  assert.ok(!XR_LANDINGS.some((p) => p.y > 0 && p.y < 2.3), 'stairs are not landings');
});

test('object and destination hits stay on separate rays; place uses Store', () => {
  const store = new Store(newRoom());
  const repId = store.addItem({ title: 'Chair', sourceRef: 'note:chair', type: 'note', kind: 'armchair' });
  const from = store.slotOf(repId)!;
  const to = store.layout.slots.find((s) => s.id !== from)!.id;
  const objects = [{ id: repId, throughWall: false }];
  const destinations = [{ id: to }];
  assert.equal(objectHitFrom(objects, { throughWall: true }), null);
  assert.equal(objectHitFrom(objects, { throughWall: false }), repId);
  assert.equal(objectIdFromRay({ id: repId, distance: 4 }, null), repId, 'unobstructed object hit');
  assert.equal(objectIdFromRay({ id: repId, distance: 4 }, { distance: 1.2 }), null, 'closer wall blocks the object');
  assert.equal(objectIdFromRay({ id: repId, distance: 3.4 }, { distance: 3.4 }), repId, 'equal distance still counts as the object');
  assert.equal(objectIdFromRay({ id: repId, distance: 2.6 }, { distance: 1.8 }), null, 'loft slab from below occludes');
  assert.equal(objectIdFromRay(null, { distance: 1 }), null);
  assert.equal(destinationHitFrom(destinations.concat([{ id: 'object-volume' }]), { holding: false }), null);
  assert.equal(destinationHitFrom([{ id: to }], { holding: true }), to);

  xrSelect(store, { kind: 'object', id: repId });
  assert.equal(store.selectedId, repId);
  xrSelect(store, { kind: 'destination', id: to });
  assert.equal(store.slotOf(repId), to);
  assert.equal(store.selectedId, null);
  store.undo();
  assert.equal(store.slotOf(repId), from);
});

test('VR panel includes loft travel and full lighting, music, surfaces, and object lists', () => {
  const store = new Store(newRoom());
  const home = panelButtons(store, 'home').map((b) => b.id);
  assert.ok(home.includes('go:loft'));
  assert.ok(home.includes('go:floor'));
  assert.ok(home.includes('page:lighting'));
  assert.ok(home.includes('page:music'));
  assert.ok(home.includes('page:surfaces'));
  assert.ok(home.includes('page:object'));
  const lighting = panelButtons(store, 'lighting').map((b) => b.id);
  assert.ok(lighting.includes('light:'));
  for (const id of Object.keys(LIGHTING_PRESETS)) assert.ok(lighting.includes('light:' + id));
  const music = panelButtons(store, 'music').map((b) => b.id);
  assert.ok(music.includes('music:follow'));
  assert.ok(music.includes('music:off'));
  for (const track of ROOM_TRACKS) assert.ok(music.includes('music:' + track));
  const surfaces = panelButtons(store, 'surfaces').map((b) => b.id);
  assert.ok(surfaces.includes('surface:floor:'));
  assert.ok(surfaces.includes('surface:floor:wood'));
  assert.ok(surfaces.includes('surface:wall:brick'));
  const kinds = panelButtons(store, 'object').map((b) => b.id);
  for (const kind of OBJECT_KINDS) assert.ok(kinds.includes('kind:' + kind));
});

test('Go to loft is a player teleport, not a saved placement change', () => {
  const store = new Store(newRoom());
  const before = store.exportJson();
  const loft = runPanelAction(store, 'go:loft');
  assert.deepEqual(loft.teleport, { x: 2.0, y: 2.3, z: 1.6 });
  assert.equal(store.exportJson(), before);
  const floor = runPanelAction(store, 'go:floor');
  assert.deepEqual(floor.teleport, spawnPosition());
});

test('VR hover preview shows the object title and a safe link when one exists', () => {
  const store = new Store(newRoom());
  const noteId = store.addItem({ title: 'Grocery list', sourceRef: 'buy milk', type: 'note', kind: 'notebook' });
  const note = inspectPreview(store, noteId);
  assert.equal(note.title, 'Grocery list');
  assert.equal(note.detail, 'buy milk');
  assert.equal(note.href, null);
  const linkId = store.addItem({ title: 'Palace notes', sourceRef: 'example.com/room', type: 'link', kind: 'book' });
  const link = inspectPreview(store, linkId);
  assert.equal(link.title, 'Palace notes');
  assert.equal(link.href, 'https://example.com/room');
  assert.equal(inspectPreview(store, 'missing').title, '');
});

test('Open link is offered for URLs and hands off after exiting VR', () => {
  const store = new Store(newRoom());
  const noteId = store.addItem({ title: 'Note', sourceRef: 'just a note', type: 'note', kind: 'notebook' });
  store.select(noteId);
  assert.ok(!panelButtons(store, 'home').some((b) => b.id === 'open:link'));
  const linkId = store.addItem({ title: 'Docs', sourceRef: 'https://github.com/example/docs', type: 'link', kind: 'book' });
  store.select(linkId);
  assert.ok(panelButtons(store, 'home').some((b) => b.id === 'open:link'));
  const opened = runPanelAction(store, 'open:link');
  assert.equal(opened.openUrl, 'https://github.com/example/docs');
  assert.equal(opened.exit, true);
  store.select(noteId);
  assert.equal(runPanelAction(store, 'open:link').openUrl, undefined);
});

test('Open link in VR uses embed overlay for iframe-safe URLs', () => {
  const store = new Store(newRoom());
  const ytId = store.addItem({ title: 'Video', sourceRef: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890abcdEF', type: 'link', kind: 'book' });
  store.select(ytId);
  const opened = runPanelAction(store, 'open:link');
  assert.equal(opened.openUrl, undefined);
  assert.equal(opened.exit, undefined);
  assert.equal(opened.openEmbed?.fallbackUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890abcdEF');
  assert.match(opened.openEmbed?.src ?? '', /^https:\/\/www\.youtube-nocookie\.com\/embed\//);
});

test('Open link in VR uses embed overlay for Spotify and standard websites', () => {
  const store = new Store(newRoom());
  const spotify = store.addItem({ title: 'Playlist', sourceRef: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', type: 'link', kind: 'book' });
  store.select(spotify);
  const sp = runPanelAction(store, 'open:link');
  assert.equal(sp.openUrl, undefined);
  assert.equal(sp.exit, undefined);
  assert.match(sp.openEmbed?.src ?? '', /^https:\/\/open\.spotify\.com\/embed\/playlist\//);

  const page = store.addItem({ title: 'Site', sourceRef: 'https://www.unpackinggame.com/', type: 'link', kind: 'book' });
  store.select(page);
  const pg = runPanelAction(store, 'open:link');
  assert.equal(pg.openUrl, undefined);
  assert.equal(pg.exit, undefined);
  assert.equal(pg.openEmbed?.src, 'https://www.unpackinggame.com/');
});

test('selected objects grow Edit, Move, Put away, and Open buttons', () => {
  const store = new Store(newRoom());
  assert.deepEqual(objectActions(store), []);
  const noteId = store.addItem({ title: 'Note', sourceRef: 'just a note', type: 'note', kind: 'notebook' });
  store.select(noteId);
  assert.deepEqual(objectActions(store).map((b) => b.id), ['page:object', 'move', 'stash:' + noteId]);
  assert.deepEqual(objectActions(store).map((b) => b.label), ['Edit', 'Move', 'Put away']);
  const linkId = store.addItem({ title: 'Docs', sourceRef: 'https://example.com/docs', type: 'link', kind: 'book' });
  store.select(linkId);
  assert.deepEqual(objectActions(store).map((b) => b.id), ['page:object', 'move', 'stash:' + linkId, 'open:link']);
  const from = store.slotOf(noteId);
  store.select(noteId);
  const moved = runPanelAction(store, 'move');
  assert.equal(moved.page, undefined);
  assert.equal(store.selectedId, noteId);
  assert.equal(store.slotOf(noteId), undefined);
  store.undo();
  assert.equal(store.slotOf(noteId), from);
});

test('VR Move uses pickUp so cancel, disconnect, and session end restore the original slot', () => {
  const store = new Store(newRoom());
  const noteId = store.addItem({ title: 'Note', sourceRef: 'just a note', type: 'note', kind: 'notebook' });
  const from = store.slotOf(noteId);
  assert.ok(from);
  store.select(noteId);
  runPanelAction(store, 'move');
  assert.equal(store.holding, noteId, 'Move must remember pickup, not commit an unplaced object');
  assert.equal(store.slotOf(noteId), undefined);
  store.select(null);
  assert.equal(store.slotOf(noteId), from, 'session end / deselect restores the source slot');
  assert.equal(store.holding, null);

  store.select(noteId);
  runPanelAction(store, 'move');
  store.select(noteId);
  assert.equal(store.holding, noteId, 're-selecting the held object keeps pickup');
  store.select(null);
  assert.equal(store.slotOf(noteId), from);
});

test('VR Move onto an occupied slot swaps instead of unplacing the occupant', () => {
  const store = new Store(newRoom());
  const moving = store.addItem({ title: 'Moving', sourceRef: 'note:a', type: 'note', kind: 'notebook' });
  const occupant = store.addItem({ title: 'Occupant', sourceRef: 'note:b', type: 'note', kind: 'book' });
  const from = store.slotOf(moving)!;
  const to = store.slotOf(occupant)!;
  assert.notEqual(from, to);
  store.select(moving);
  runPanelAction(store, 'move');
  xrSelect(store, { kind: 'destination', id: to });
  assert.equal(store.slotOf(moving), to);
  assert.equal(store.slotOf(occupant), from, 'occupant keeps a slot (the remembered source)');
  assert.ok(store.state.representations.some((r) => r.id === occupant));
});

test('object action pills sit above the object, not on the controller ray', () => {
  const origin = { x: 1, y: 0.4, z: 2 };
  const ray = { origin: { x: 4.2, y: 1.4, z: 3.4 }, direction: { x: 0, y: 0, z: -1 } };
  const at = objectMenuAnchor(origin, ray);
  assert.equal(at.x, origin.x);
  assert.equal(at.z, origin.z);
  assert.ok(at.y > origin.y);
  const buttons = objectMenuHit(
    { x: origin.x, y: origin.y + 0.55, z: origin.z },
    [{ id: 'page:object', label: 'Edit' }, { id: 'move', label: 'Move' }],
    { origin: { x: origin.x - 0.11, y: origin.y + 0.55, z: origin.z + 1 }, direction: { x: 0, y: 0, z: -1 } },
  );
  assert.equal(buttons, 'page:object');
  assert.equal(objectMenuHit(
    { x: origin.x, y: origin.y + 0.55, z: origin.z },
    [{ id: 'page:object', label: 'Edit' }],
    ray,
  ), null);
});

test('Change object and Edit open the object list, and dedicated rooms stay visitable in VR', () => {
  const store = new Store(newRoom('Mine'), 'guest');
  const noteId = store.addItem({ title: 'Note', sourceRef: 'just a note', type: 'note', kind: 'notebook' });
  store.select(noteId);
  assert.equal(runPanelAction(store, 'page:object').page, 'object');
  const rooms = [
    { name: 'curious-web', data: newRoom('Curious') },
    { name: 'sample', data: newRoom('Sample') },
    { name: 'vinyl-lounge', data: newRoom('Vinyl') },
  ];
  assert.deepEqual(dedicatedRooms().map((r) => r.id), ['guest', 'german', 'matt', 'levi', 'jawan', 'omari']);
  const home = panelButtons(store, 'home', rooms).map((b) => b.id);
  assert.ok(home.includes('page:rooms'));
  assert.ok(home.includes('page:themes'));
  const page = panelButtons(store, 'rooms', rooms);
  assert.ok(page.some((b) => b.id === 'page:home'));
  assert.ok(page.some((b) => b.id === 'room:matt'));
  const switched = runPanelAction(store, 'room:matt', rooms);
  assert.equal(switched.page, 'home');
  assert.equal(store.roomId, 'matt');
  assert.equal(store.state.owner, "Matt's room");
  const themed = runPanelAction(store, 'theme:vinyl-lounge');
  assert.equal(themed.page, undefined);
  assert.equal(store.state.lighting, 'twilight');
});

test('VR How-to menu is skippable and replayable without changing the personal save', () => {
  const store = new Store(newRoom('Mine'), 'guest');
  const snapshot = store.exportJson();
  const home = panelButtons(store, 'home').map((b) => b.id);
  assert.ok(home.includes('page:howto'));
  assert.ok(home.includes('page:create'));
  assert.equal(runPanelAction(store, 'page:howto').page, 'howto');
  const howto = panelButtons(store, 'howto').map((b) => b.id);
  assert.ok(howto.includes('howto:create'));
  assert.ok(howto.includes('guide:create'));
  assert.equal(runPanelAction(store, 'howto:create').page, 'howto-create');
  assert.ok(panelButtons(store, 'howto-create').some((b) => b.id === 'page:howto'));
  assert.equal(runPanelAction(store, 'howto:skip').page, 'home');
  assert.equal(runPanelAction(store, 'page:howto').page, 'howto', 'replay after skip');
  assert.equal(store.exportJson(), snapshot, 'tutorials must not mutate the personal room');
});

test('VR tutorial is a pop-up: starting it keeps the command menu available', () => {
  const store = new Store(newRoom('Mine'), 'guest');
  const started = runPanelAction(store, 'guide:start');
  assert.equal(started.tutorialEvent, 'start');
  assert.notEqual(started.page, 'guide');
  const guide = { status: 'fresh' as const, lesson: 'create' as const, step: 0, snapshot: null, roomId: null };
  const home = panelButtons(store, 'home', [], undefined, guide).map((b) => b.id);
  assert.ok(home.includes('page:create'), 'commands stay on the home menu during the tutorial');
  assert.ok(home.includes('page:howto'));
  const popup = panelButtons(store, 'guide', [], undefined, guide).map((b) => b.id);
  assert.ok(popup.includes('guide:skip'));
  assert.ok(popup.includes('guide:status'));
  assert.ok(!popup.includes('page:create'), 'the tutorial pop-up is not the command menu');
});

test('tutorial Inbox opening is not restoration and room opening has its own event',()=>{
 const store=new Store(newRoom());
 assert.equal(runPanelAction(store,'page:inbox').tutorialEvent,'inbox-open');
 assert.equal(runPanelAction(store,'page:rooms').tutorialEvent,'open-rooms');
});
