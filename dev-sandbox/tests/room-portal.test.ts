import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, newRoom, roomKeys } from '../src/core/store';
import { roomCatalog, seededRepoNames, visitCatalogRoom, randomRoom, loadRoomJson } from '../src/core/room-portal';
const saved = new Map<string,string>();
globalThis.localStorage = { getItem: (k:string) => saved.get(k) ?? null, setItem: (k:string,v:string) => saved.set(k,v), removeItem:(k:string)=>saved.delete(k) } as Storage;
const repo = [{name:'german',data:newRoom('German')}, {name:'extra',data:newRoom('Extra')}];
test('catalog includes My room, every directory room and every committed room without hiding examples', () => {
 const catalog = roomCatalog(repo);
 assert.equal(catalog[0].id, 'home');
 assert.ok(catalog.some(r=>r.id==='repo:extra'));
 assert.ok(catalog.some(r=>r.id==='directory:matt'));
 assert.equal(new Set(catalog.map(r=>r.id)).size,catalog.length);
});
test('a named room and the file it seeds from are one entry, not two', () => {
 // german.json is German's room's own content; vinyl-lounge is Matt's seed when matt.json is absent.
 const files = [{name:'german',data:newRoom('German')},{name:'vinyl-lounge',data:newRoom('Vinyl')},{name:'curious-web',data:newRoom('Curious')}];
 assert.deepEqual([...seededRepoNames(Object.fromEntries(files.map(f=>[f.name,f.data])))].sort(),
   ['creative-atelier','garden-notebook','german','omari','vinyl-lounge']);
 const catalog = roomCatalog(files);
 assert.equal(catalog.filter(r=>r.id==='repo:german').length,0,'German is listed once, as the named room');
 assert.equal(catalog.filter(r=>r.id==='repo:vinyl-lounge').length,0,"Matt's seed is not a second room");
 assert.ok(catalog.some(r=>r.id==='repo:curious-web'),'rooms no named room represents are still offered');
 assert.ok(catalog.some(r=>r.label==="German's room"));
 assert.equal(new Set(catalog.map(r=>r.label)).size,catalog.length,'no two rooms share a label');

 // A file matching the room id wins over the slot seed, so only that file is consumed.
 const withMatt = [...files,{name:'matt',data:newRoom('Matt file')}];
 const consumed = seededRepoNames(Object.fromEntries(withMatt.map(f=>[f.name,f.data])));
 assert.ok(consumed.has('matt'));
 assert.ok(!consumed.has('vinyl-lounge'),'the unused seed becomes a room of its own');
 assert.ok(roomCatalog(withMatt).some(r=>r.id==='repo:vinyl-lounge'));
});
test('random visits exclude home/current; repeated visits preserve the personal room and persisted JSON', () => {
 const store = new Store(newRoom('Personal'), 'demo-visit');
 store.setLighting('twilight');
 const before=store.exportJson();
 const catalog=roomCatalog(repo);
 const first=randomRoom(catalog,null,()=>0)!;
 visitCatalogRoom(store,first);
 const next=randomRoom(catalog,first.id,()=>0)!;
 assert.notEqual(next.id,first.id);
 visitCatalogRoom(store,next);
 assert.equal(store.roomId,'demo-visit');
 store.returnHome();
 assert.equal(store.exportJson(),before);
 assert.equal(JSON.parse(saved.get(roomKeys('demo-visit').main)!).owner,'Personal');
});
test('return home restores home undo history instead of allowing a visited room to overwrite it',()=>{
 const store=new Store(newRoom('Personal'),'demo-visit');store.setLighting('twilight');
 visitCatalogRoom(store,roomCatalog(repo)[1]);store.setLighting('dawn');store.returnHome();store.undo();
 assert.equal(store.state.owner,'Personal');assert.equal(store.state.lighting,undefined);
});
test('visiting with an object in hand restores its placement before taking the home snapshot',()=>{
 const store=new Store(newRoom('Mine'),'demo-visit');const id=store.addItem({title:'Keep',sourceRef:'https://example.com/keep'});
 const before=store.exportJson();store.pickUp(id);visitCatalogRoom(store,roomCatalog(repo)[1]);store.returnHome();
 assert.equal(store.exportJson(),before);assert.equal(store.holding,null);
});
test('JSON load validates before changing state, supports undo and never reseeds My room', () => {
 const store=new Store(newRoom('Mine'),'demo-visit');
 const before=store.exportJson();
 assert.throws(()=>loadRoomJson(store,'{"bad":true}'));
 assert.equal(store.exportJson(),before);
 loadRoomJson(store,JSON.stringify(newRoom('Loaded')));
 assert.equal(store.state.owner,'Loaded');
 store.undo(); assert.equal(store.exportJson(),before);
});
