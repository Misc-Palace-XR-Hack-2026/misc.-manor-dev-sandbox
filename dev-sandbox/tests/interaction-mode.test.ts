import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, newRoom } from '../src/core/store';

test('Preview guards mutation commands and preserves saves/history while rooms remain navigable', () => {
  const s = new Store(newRoom());
  const id = s.addItem({ title: 'Keep', sourceRef: 'https://example.com' });
  const c = s.state.contentItems[0];
  s.setMode('preview');
  const before = s.exportJson(), storage = [...saved];
  const commands = [
    () => s.pickUp(id), () => s.place(id, s.freeSlotIds()[0]), () => s.unplace(id),
    () => s.stash(id), () => s.deleteContent(c.id), () => s.setKind(id, 'cat'),
    () => s.updateContent(c.id, { title: 'Bad', sourceRef: 'https://example.org' }),
    () => s.renameItem(c.id, 'Bad'), () => s.addItem({ title: 'Bad', sourceRef: '' }),
    () => s.setOwner('Bad'), () => s.setLighting(undefined), () => s.setSurface('floor', undefined),
    () => s.setSoundtrack({ mode: 'off' }), () => s.applyLook({}),
    () => s.autoOrganize(), () => s.importFiles([{title:'Bad',ref:'bad.pdf'}]),
    () => s.importBookmarks([{title:'Bad',url:'https://example.org',folder:''}]),
    () => s.bringOut(c.id), () => s.undo(), () => s.replaceState(newRoom('Bad')),
  ];
  for (const command of commands) {
    command();
    assert.equal(s.exportJson(), before);
    assert.equal(s.holding, null);
    assert.deepEqual([...saved], storage);
  }
  s.switchRoom('preview-test', newRoom('Other'));
  assert.equal(s.mode, 'preview');
  assert.equal(s.state.owner, 'Other');
  s.setMode('edit');
  s.setOwner('Editable');
  assert.equal(s.state.owner, 'Editable');
});

const saved = new Map<string, string>();
globalThis.localStorage = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => { saved.set(k, v); } } as Storage;

test('Preview is session-only, cancels pickup and preserves inspection, data and undo', () => {
  const s = new Store(newRoom());
  assert.equal(s.mode, 'edit');
  const id = s.addItem({ title: 'Keep', sourceRef: 'https://example.com' });
  const before = s.exportJson();
  s.pickUp(id);
  s.setMode('preview');
  assert.equal(s.holding, null);
  assert.equal(s.exportJson(), before);
  s.select(id);
  assert.equal(s.selectedId, id);
  assert.equal(s.mode, 'preview');
  assert.equal(new Store(JSON.parse(before)).mode, 'edit');
  s.setMode('edit');
  s.undo();
  assert.equal(s.state.contentItems.length, 0);
});
