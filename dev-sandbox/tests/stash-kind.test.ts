import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, newRoom, validateRoom } from '../src/core/store';
import { OBJECT_KINDS } from '../src/core/types';
import { runPanelAction } from '../src/xr/interaction';

const saved = new Map<string, string>();
globalThis.localStorage = { getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => saved.set(key, value) } as unknown as Storage;

test('stash remembers the latest chosen kind across local save and JSON reload', () => {
  const store = new Store(newRoom(), 'stash-test');
  const id = store.addItem({ title: 'Keep me', sourceRef: 'https://example.com', kind: 'guitar' });
  const contentId = store.state.representations.find(r => r.id === id)!.contentItemId;
  store.setKind(id, 'robot');
  store.stash(id);
  assert.equal(store.repFor(contentId), undefined);
  for (const state of [Store.loadSaved('stash-test')!, JSON.parse(store.exportJson())]) {
    const reloaded = new Store(state);
    reloaded.bringOut(contentId);
    assert.equal(reloaded.repFor(contentId)?.objectKind, 'robot');
    assert.equal(reloaded.content(contentId)?.sourceRef, 'https://example.com');
    assert.equal(reloaded.state.contentItems.length, 1);
  }
});

for (const path of ['placed', 'unplaced', 'held', 'xr'] as const) {
  test(`all kinds survive ${path} stash, JSON import, organize, override and undo`, () => {
    for (const kind of OBJECT_KINDS) {
      const store = new Store(newRoom());
      const id = store.addItem({ title: 'Identity', sourceRef: 'Payload', type: 'note', kind });
      const contentId = store.state.representations[0].contentItemId;
      const before = store.exportJson();
      if (path === 'unplaced') store.unplace(id);
      if (path === 'held') store.pickUp(id);
      if (path === 'xr') { store.select(id); runPanelAction(store, `stash:${id}`); }
      else store.stash(id);
      const stashed = store.exportJson();
      assert.equal(store.content(contentId)?.lastObjectKind, kind);
      assert.equal(store.holding, null);
      store.bringOut(contentId);
      assert.equal(store.repFor(contentId)?.objectKind, kind);
      store.undo();
      assert.equal(store.exportJson(), stashed);
      const imported = new Store(newRoom());
      imported.replaceState(JSON.parse(stashed));
      if (path === 'xr') runPanelAction(imported, `out:${contentId}`);
      else imported.autoOrganize();
      const restored = imported.repFor(contentId)!;
      assert.equal(restored.objectKind, kind);
      // An explicit user choice must win over the old remembered preference.
      imported.setKind(restored.id, 'rubberDuck');
      imported.stash(restored.id);
      imported.bringOut(contentId);
      assert.equal(imported.repFor(contentId)?.objectKind, 'rubberDuck');
      const { lastObjectKind: _, ...content } = imported.content(contentId)!;
      assert.deepEqual(content, JSON.parse(before).contentItems[0]);
      assert.equal(validateRoom(imported.state), null);
      store.undo();
      if (path === 'placed' || path === 'xr') assert.equal(store.exportJson(), before);
    }
  });
}

test('legacy inbox defaults remain valid; legacy representations acquire a preference on stash', () => {
  const store = new Store(newRoom());
  const id = store.addItem({title:'Legacy',sourceRef:'https://example.com',kind:'guitar'});
  const contentId = store.state.representations[0].contentItemId;
  assert.equal(store.content(contentId)?.lastObjectKind, undefined);
  const legacy = JSON.parse(store.exportJson());
  legacy.representations = []; legacy.placements = [];
  assert.equal(validateRoom(legacy), null);
  const old = new Store(legacy); old.bringOut(contentId);
  assert.equal(old.repFor(contentId)?.objectKind, 'book');
  store.stash(id); store.bringOut(contentId);
  assert.equal(store.repFor(contentId)?.objectKind, 'guitar');
});

test('invalid optional preferences reject imports without replacing content', () => {
  const store = new Store(newRoom());
  store.addItem({title:'Valid',sourceRef:'note'});
  const before = store.exportJson();
  for (const value of [null, '', 'not-a-kind', 7, {}]) {
    const invalid = JSON.parse(before); invalid.contentItems[0].lastObjectKind = value;
    assert.match(validateRoom(invalid)!, /last object kind/);
    assert.throws(() => store.replaceState(invalid), /last object kind/);
    assert.equal(store.exportJson(), before);
  }
});

test('full-room restore keeps the preference and content in the inbox until space exists', () => {
  const store = new Store(newRoom());
  const id = store.addItem({title:'Waiting',sourceRef:'payload',kind:'robot'});
  const contentId = store.state.representations[0].contentItemId;
  store.stash(id);
  for (const slot of store.layout.slots) {
    const filler = store.addItem({title:'Filler',sourceRef:'',place:false});
    store.place(filler,slot.id);
  }
  store.bringOut(contentId);
  assert.equal(store.repFor(contentId),undefined);
  assert.equal(store.content(contentId)?.lastObjectKind,'robot');
  store.stash(store.state.representations[0].id);
  store.bringOut(contentId);
  assert.equal(store.repFor(contentId)?.objectKind,'robot');
});
