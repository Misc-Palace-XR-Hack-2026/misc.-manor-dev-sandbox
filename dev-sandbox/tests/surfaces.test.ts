import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, newRoom, validateRoom } from '../src/core/store';

test('independent surfaces preserve content, undo, export/import and legacy saves', () => {
 const saved = new Map<string,string>();
 globalThis.localStorage = {getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>saved.set(k,v)} as Storage;
 const store = new Store(newRoom());
 store.addItem({title:'Keep',sourceRef:'https://example.com'});
 const content = store.exportJson();
 store.setSurface('floor',{preset:'wood'});
 store.setSurface('wall',{preset:'brick'});
 store.setSurface('background',{preset:'sky'});
 assert.deepEqual(store.state.surfaces,{floor:{preset:'wood'},wall:{preset:'brick'},background:{preset:'sky'}});
 assert.deepEqual(Store.loadSaved(),store.state);
 const imported = new Store(newRoom()); imported.replaceState(JSON.parse(store.exportJson()));
 assert.deepEqual(imported.state,store.state);
 store.undo();assert.equal(store.state.surfaces?.background,undefined);
 store.setSurface('floor',undefined);assert.equal(store.state.surfaces?.floor,undefined);
 assert.deepEqual(store.state.contentItems,JSON.parse(content).contentItems);
 assert.equal(validateRoom(JSON.parse(content)),null);
});
