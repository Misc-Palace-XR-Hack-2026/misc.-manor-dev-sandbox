import test from 'node:test';
import assert from 'node:assert/strict';
import {Store,newRoom} from '../src/core/store';
const memory=new Map<string,string>();
globalThis.localStorage={getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>{memory.set(k,v);}} as Storage;
test('Preview invalidates async practice work across mode round trips without personal writes',()=>{
 const s=new Store(newRoom(),'guest');s.addItem({title:'Personal',sourceRef:'note',type:'note'});
 const saved=[...memory], personal=s.exportJson();s.beginPractice();
 const pending=s.sessionGuard();s.setMode('preview');s.setMode('edit');
 assert.equal(pending(),false);s.endPractice();assert.equal(s.exportJson(),personal);assert.deepEqual([...memory],saved);
});
test('Preview rejects practice entry and editing commands inside a paused practice session',()=>{
 const s=new Store(newRoom(),'guest');s.setMode('preview');const before=s.exportJson();s.beginPractice();
 assert.equal(s.practicing,false);assert.equal(s.exportJson(),before);
 s.setMode('edit');s.beginPractice();s.addItem({title:'Sample',sourceRef:'note',type:'note'});s.setMode('preview');
 const practice=s.exportJson();s.undo();s.replaceState(newRoom());s.addItem({title:'No',sourceRef:'note',type:'note'});
 assert.equal(s.exportJson(),practice);s.endPractice();assert.equal(s.exportJson(),before);
});
