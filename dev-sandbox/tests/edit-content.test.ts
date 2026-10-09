import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store,newRoom} from '../src/core/store';
const saved = new Map<string,string>();
globalThis.localStorage={getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>saved.set(k,v)} as any;
test('notes retain literal multiline text; file references and local photos remain undoable',()=>{
 const s=new Store(newRoom());
 s.addItem({title:'Note',sourceRef:'',type:'note'});
 s.addItem({title:'File',sourceRef:'./old.pdf',type:'file'});
 const [note,file]=s.state.contentItems;
 s.updateContent(note.id,{title:'Notebook',sourceRef:'first line\nhttps://example.com\n  last line'});
 assert.equal(s.content(note.id)!.sourceKind,'note');
 assert.equal(s.content(note.id)!.sourceRef,'first line\nhttps://example.com\n  last line');
 s.updateContent(file.id,{title:'Document',sourceRef:'./replaced.pdf'});
 assert.equal(s.content(file.id)!.sourceRef,'./replaced.pdf');
 assert.equal(s.content(file.id)!.sourceKind,'file');
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=';
 s.addPhoto('Local',png);const photo=s.state.contentItems.at(-1)!;
 const before=s.exportJson();s.updateContent(photo.id,{title:'Replacement',sourceRef:'Local photo',imageData:png});
 assert.equal(s.content(photo.id)!.imageData,png);
 const copy=new Store(JSON.parse(s.exportJson()));assert.deepEqual(copy.state,s.state);
 s.undo();assert.equal(s.exportJson(),before);
});
test('invalid URL, missing item, invalid title and photo fail without mutation or history',()=>{
 const s=new Store(newRoom());s.addItem({title:'Link',sourceRef:'https://example.com'});
 const id=s.state.contentItems[0].id, before=s.exportJson();
 for(const sourceRef of ['javascript:alert(1)','data:text/html,bad','not a url']) assert.throws(()=>s.updateContent(id,{title:'Bad',sourceRef}),/URL/);
 assert.throws(()=>s.updateContent(id,{title:' ',sourceRef:'https://example.com'}),/title/);
 assert.throws(()=>s.updateContent('missing',{title:'Bad',sourceRef:''}),/exists/);
 assert.throws(()=>s.updateContent(id,{title:'Bad',sourceRef:'https://example.com',imageData:'data:image/svg+xml;base64,PHN2Zz4='}),/photo/);
 assert.equal(s.exportJson(),before);s.undo();assert.equal(s.state.contentItems.length,0);
});
test('edit reports quota failure and retains undo instead of claiming persisted',()=>{
 const s=new Store(newRoom());s.addItem({title:'Note',sourceRef:'',type:'note'});const before=s.exportJson();
 const original=globalThis.localStorage;
 globalThis.localStorage={getItem:()=>null,setItem:()=>{throw new Error('Quota exceeded');}} as any;
 try {s.updateContent(s.state.contentItems[0].id,{title:'Unsaved',sourceRef:'text'});assert.match(s.saveError!,/Quota/);s.undo();assert.equal(s.exportJson(),before);} finally {globalThis.localStorage=original;}
});

test('edit title and URL preserves identity, placement, kind; persists, exports, imports and undoes',()=>{
 const s=new Store(newRoom());s.addItem({title:'Before',sourceRef:'https://example.com',kind:'cat'});
 const before=s.exportJson(), c=s.state.contentItems[0];
 s.updateContent(c.id,{title:'After',sourceRef:'example.org/changed'});
 assert.equal(s.content(c.id)!.sourceRef,'https://example.org/changed');
 assert.equal(s.content(c.id)!.title,'After');
 assert.deepEqual(s.state.representations,JSON.parse(before).representations);
 assert.deepEqual(s.state.placements,JSON.parse(before).placements);
 assert.equal(s.content(c.id)!.createdAt,c.createdAt);
 assert.deepEqual(Store.loadSaved(),s.state);
 const copy=new Store(newRoom());copy.replaceState(JSON.parse(s.exportJson()));assert.deepEqual(copy.state,s.state);
 s.undo();assert.equal(s.exportJson(),before);
});
