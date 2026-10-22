import test from 'node:test';
import assert from 'node:assert/strict';
import {Store,newRoom} from '../src/core/store';
const memory=new Map<string,string>();
globalThis.localStorage={getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>{memory.set(k,v);}} as Storage;
test('practice isolates all room saves, backups, preference, object identity and undo history',()=>{
 const s=new Store(newRoom('Personal'),'guest');
 s.addItem({title:'Personal',sourceRef:'https://personal.example'});
 const original=s.state, json=s.exportJson(), saved=[...memory];
 s.beginPractice();
 s.addItem({title:'Sample',sourceRef:'https://example.com'});
 s.switchRoom('matt',newRoom('Other'));
 s.setOwner('Practice only'); s.undo();
 s.switchRoom('guest',newRoom());
 s.endPractice();
 assert.equal(s.state,original); assert.equal(s.exportJson(),json);
 assert.deepEqual([...memory],saved);
 s.undo(); assert.equal(s.state.contentItems.length,0);
});
test('async work is invalid across entry, replay, exit and room round trips',()=>{
 const s=new Store(newRoom(),'guest');
 const personal=s.sessionGuard();s.beginPractice();assert.equal(personal(),false);
 const practice=s.sessionGuard();s.endPractice();s.beginPractice();assert.equal(practice(),false);
 const room=s.sessionGuard();s.switchRoom('matt',newRoom());s.switchRoom('guest',newRoom());assert.equal(room(),false);
 s.endPractice();
});
test('empty and exact duplicate imports do not create undo history',()=>{
 const s=new Store(newRoom());s.beginPractice();
 s.importBookmarks([]);assert.equal(s.canUndo,false);
 const entry={title:'Sample',url:'https://example.com',folder:'Folder'};
 assert.deepEqual(s.importBookmarks([entry,entry]),{added:1,placed:1});
 s.importBookmarks([entry]);s.undo();assert.equal(s.state.contentItems.length,0);
});
test('practice room round trips retain practice edits without reading unreadable personal rooms',()=>{
 const s=new Store(newRoom('Personal'),'guest');
 memory.set('mp-sandbox:rooms:matt','unreadable');
 const before=[...memory];s.beginPractice();
 const id=s.addItem({title:'Sample',sourceRef:'Keep identity',type:'note'});
 const content=s.state.contentItems[0]; const placement=s.slotOf(id);
 s.switchRoom('matt',newRoom());s.setOwner('Disposable destination');
 s.switchRoom('guest',newRoom());assert.equal(s.content(content.id),content);assert.equal(s.slotOf(id),placement);
 s.endPractice();assert.deepEqual([...memory],before);
});
test('practice move occupied swap, cancel, stash, restore and style preserve assigned content',()=>{
 const s=new Store(newRoom());s.beginPractice();
 const first=s.addItem({title:'First',sourceRef:'Original note',type:'note'}), second=s.addItem({title:'Second',sourceRef:'https://example.com'});
 const content=s.state.contentItems[0], data=JSON.stringify(s.state.contentItems), a=s.slotOf(first)!, b=s.slotOf(second)!;
 s.pickUp(first);s.place(first,b);assert.equal(s.slotOf(second),a);
 s.pickUp(first);s.select(null);assert.equal(s.slotOf(first),b);
 s.stash(first);assert.deepEqual(s.content(content.id),{...content,lastObjectKind:'notebook'});s.bringOut(content.id);assert.ok(s.slotOf(s.repFor(content.id)!.id));
 const placements=JSON.stringify(s.state.placements);
 s.setLighting('dawn');s.setSurface('wall',{preset:'plaster'});s.undo();s.undo();
 assert.equal(JSON.stringify(s.state.placements),placements);
 // Stash adds representation preference metadata; all original media fields stay exact.
 assert.equal(JSON.stringify(s.state.contentItems.map(({lastObjectKind: _, ...item})=>item)),data);
 assert.equal(s.content(content.id)?.lastObjectKind,'notebook');
});
