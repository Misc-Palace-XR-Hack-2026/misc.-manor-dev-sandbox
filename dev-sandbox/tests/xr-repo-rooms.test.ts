import test from 'node:test';
import assert from 'node:assert/strict';
import { panelButtons, runPanelAction, repoRoomLabel, type NeighborhoodRoom } from '../src/xr/interaction';
import { Store, newRoom } from '../src/core/store';

globalThis.localStorage = { getItem: () => null, setItem() {} } as unknown as Storage;

function roomWithItems(owner: string, titles: string[]) {
  const base = newRoom(owner);
  for (const title of titles) {
    const id = 'ci-' + title.replace(/\W+/g, '');
    base.contentItems.push({
      id,
      type: 'link',
      title,
      sourceKind: 'url',
      sourceRef: 'https://example.com/' + id,
      tags: [],
      createdAt: new Date().toISOString(),
    } as never);
    base.representations.push({ id: 'rp-' + id, contentItemId: id, objectKind: 'book' } as never);
  }
  return base;
}

const repoRooms: NeighborhoodRoom[] = [
  { name: 'vinyl-lounge', data: roomWithItems('Vinyl Lounge', ['Record A', 'Record B']) },
  { name: 'omari', data: roomWithItems("Omari's room", ['Spoon 1', 'Spoon 2', 'Spoon 3']) },
  { name: 'greenhouse-conservatory', data: roomWithItems('Greenhouse', ['Fern']) },
];

test('the VR Rooms page offers an in-session picker for every committed repo room', () => {
  const store = new Store(newRoom('Guest room'));
  const rooms = panelButtons(store, 'rooms', repoRooms);
  const entry = rooms.find((b) => b.id === 'page:repo-rooms');
  assert.ok(entry, 'Rooms page must link to the repo-room picker from inside VR');

  const picker = panelButtons(store, 'repo-rooms', repoRooms);
  for (const room of repoRooms) {
    assert.ok(
      picker.some((b) => b.id === 'visit-room:' + room.name),
      `repo-rooms page must list ${room.name}`,
    );
  }
  // Names are shown as readable labels, not raw filenames.
  assert.ok(picker.some((b) => b.label.includes('Vinyl Lounge')), 'labels should be human readable');
  assert.ok(picker.some((b) => b.id === 'page:rooms'), 'picker needs a way back');
});

test('picking a repo room in VR loads its items without overwriting the personal save', () => {
  const store = new Store(newRoom('Guest room'));
  assert.equal(store.state.representations.length, 0);
  const writes: string[] = [];
  globalThis.localStorage = {
    getItem: () => null,
    setItem: (k: string) => { writes.push(k); },
  } as unknown as Storage;

  const result = runPanelAction(store, 'visit-room:omari', repoRooms);
  assert.equal(result.page, 'home');
  assert.equal(store.state.representations.length, 3, 'the chosen room renders its objects');
  assert.equal(store.state.contentItems.length, 3);
  assert.ok(store.visiting, 'loading a repo room is a visit, so the personal save is untouched');
  assert.equal(writes.length, 0, 'visiting must not write to localStorage');

  // Return home restores the empty guest room.
  const back = runPanelAction(store, 'home:return', repoRooms);
  assert.equal(back.page, 'home');
  assert.equal(store.state.representations.length, 0);
  assert.equal(store.visiting, null);
});

test('an unknown repo room name is a no-op rather than a crash or a wipe', () => {
  const store = new Store(newRoom('Guest room'));
  const before = JSON.stringify(store.state);
  const result = runPanelAction(store, 'visit-room:does-not-exist', repoRooms);
  assert.deepEqual(result, {});
  assert.equal(JSON.stringify(store.state), before);
});

test('repo room labels are derived from the filename', () => {
  assert.equal(repoRoomLabel('vinyl-lounge'), 'Vinyl Lounge');
  assert.equal(repoRoomLabel('greenhouse-conservatory'), 'Greenhouse Conservatory');
  assert.equal(repoRoomLabel('matt'), 'Matt');
});


test('in demo mode, selecting My room returns home instead of switching to sandbox guest', () => {
  const store = new Store(newRoom('My room'), 'demo-visit');
  const before = JSON.stringify(store.state);
  runPanelAction(store, 'visit-room:omari', repoRooms);
  assert.equal(store.visiting, 'omari');
  const result = runPanelAction(store, 'room:guest', repoRooms);
  assert.equal(result.tutorialEvent, 'returned');
  assert.equal(store.visiting, null);
  assert.equal(store.roomId, 'demo-visit');
  assert.equal(JSON.stringify(store.state), before);
});

test('in demo mode, selecting a built-out room is a reversible visit (not a room switch)', () => {
  const store = new Store(newRoom('My room'), 'demo-visit');
  const before = JSON.stringify(store.state);
  const result = runPanelAction(store, 'room:matt', repoRooms);
  assert.equal(result.tutorialEvent, 'switched');
  assert.equal(store.roomId, 'demo-visit', 'demo room id must stay pinned');
  assert.equal(store.visiting, 'matt');
  assert.notEqual(JSON.stringify(store.state), before, 'visit should show the selected built room');

  const back = runPanelAction(store, 'room:guest', repoRooms);
  assert.equal(back.tutorialEvent, 'returned');
  assert.equal(store.roomId, 'demo-visit');
  assert.equal(store.visiting, null);
  assert.equal(JSON.stringify(store.state), before, 'return home restores the user\'s My room state');
});
