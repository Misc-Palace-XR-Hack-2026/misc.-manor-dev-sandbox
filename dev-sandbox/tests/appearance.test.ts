import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, newRoom, validateRoom } from '../src/core/store';

test('legacy loft and study saves migrate through constructor, import and local reload without losing content', () => {
  const saved = new Map<string,string>();
  globalThis.localStorage = { getItem: (k:string) => saved.get(k) ?? null, setItem: (k:string,v:string) => saved.set(k,v) } as Storage;
  const original = new Store(newRoom());
  original.addItem({title:'Keep my book',sourceRef:'https://example.com'});
  for (const [theme, lighting] of [['loft','loft'],['study','dawn']]) {
    const legacy = {...JSON.parse(original.exportJson()), appearance:{theme,lighting}};
    assert.equal(validateRoom(legacy), null);
    const constructed = new Store(legacy);
    const imported = new Store(newRoom()); imported.replaceState(legacy);
    saved.set('mp-sandbox:room',JSON.stringify(legacy));
    for (const room of [constructed.state, imported.state, Store.loadSaved()!]) {
      assert.ok(room);
      assert.equal('appearance' in room,false);
      assert.equal(room.lighting, lighting === 'loft' ? undefined : lighting);
      assert.deepEqual(room.contentItems,legacy.contentItems);
      assert.deepEqual(room.representations,legacy.representations);
      assert.deepEqual(room.placements,legacy.placements);
      assert.equal(room.id,legacy.id);
    }
  }
  assert.match(validateRoom({...original.state, lighting:'evil'})!,/lighting/i);
  assert.match(validateRoom({...original.state, appearance:{theme:'study',lighting:'evil'}})!,/lighting/i);
});

test('invalid local saves are never silently replaced by the sample room', () => {
  const saved = new Map([['mp-sandbox:room','{broken'],['mp-sandbox:room:backup','also broken']]);
  globalThis.localStorage = {getItem:(k:string)=>saved.get(k) ?? null,setItem:(k:string,v:string)=>saved.set(k,v)} as Storage;
  const before = [...saved];
  assert.throws(()=>Store.loadSaved(),/saved room/i);
  assert.deepEqual([...saved],before);
  const good=newRoom();saved.set('mp-sandbox:room:backup',JSON.stringify(good));
  assert.deepEqual(Store.loadSaved(),good);
  assert.equal(saved.get('mp-sandbox:room'),'{broken');
});
