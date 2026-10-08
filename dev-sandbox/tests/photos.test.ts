import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store,newRoom,validateRoom} from '../src/core/store';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=';
globalThis.localStorage={getItem:()=>null,setItem:()=>{}} as any;
test('local photo is content, survives JSON and undo, rejects unsafe or oversized image data atomically',()=>{
 const store=new Store(newRoom()); const before=store.exportJson();
 const rep=store.addPhoto('Family photo',png);
 const content=store.content(store.state.representations.find(r=>r.id===rep)!.contentItemId)!;
 assert.equal(content.imageData,png);assert.equal(content.type,'image');assert.equal(store.state.representations[0].objectKind,'photoFrame');
 const copy=new Store(newRoom());copy.replaceState(JSON.parse(store.exportJson()));assert.equal(copy.state.contentItems[0].imageData,png);
 for(const bad of ['https://example.com/image.jpg','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,PHN2Zz4=','data:image/jpeg;base64,'+'A'.repeat(1600000)]){
  const saved=store.exportJson();assert.throws(()=>store.addPhoto('bad',bad),/photo|image/i);assert.equal(store.exportJson(),saved);
  const room=JSON.parse(saved);room.contentItems[0].imageData=bad;assert.match(validateRoom(room)!,/photo|image/i);
 }
 store.undo();assert.equal(store.exportJson(),before);
});
test('storage quota failure keeps photo in memory and reports unsaved status',()=>{
 globalThis.localStorage={getItem:()=>null,setItem:()=>{throw new Error('Quota exceeded');}} as any;
 const store=new Store(newRoom());store.addPhoto('Photo',png);
 assert.equal(store.state.contentItems[0].imageData,png);assert.match(store.saveError!,/Could not save locally.*Quota/);
});
