import test from 'node:test';
import assert from 'node:assert/strict';
import * as creation from '../src/xr/creation';
import {Store,newRoom} from '../src/core/store';
globalThis.localStorage={getItem:()=>null,setItem:()=>{}} as unknown as Storage;
test('headset draft validates, cancels without orphan, creates once and safely cancels placement',()=>{
 const Draft=(creation as any).XrCreation; assert.equal(typeof Draft,'function');
 const s=new Store(newRoom());const d=new Draft();
 assert.equal(d.create(s),null);assert.match(d.error,/title/i);
 d.title='My link';d.mode='link';d.text='javascript:alert(1)';assert.equal(d.create(s),null);
 d.text='https://example.com';d.kind='fireplace';const id=d.create(s);assert.ok(id);
 assert.equal(d.create(s),null);assert.equal(s.state.contentItems.length,1);
 assert.equal(s.selectedId,id);assert.equal(s.slotOf(id),undefined);
 s.select(null);assert.ok(s.slotOf(id));assert.equal(s.state.representations[0].objectKind,'fireplace');
 const cancelled=new Draft();cancelled.title='discard';assert.equal(s.state.contentItems.length,1);
});
test('keyboard preserves mixed case and every printable URL symbol through creation',()=>{
 const d=new creation.XrCreation(); const s=new Store(newRoom());
 for(const c of 'My Link') d.key(c);
 assert.equal(d.title,'My Link');
 d.field='text';
 const url='https://example.com/Watch?v=AbC_dE&list=PL%2F1#t=1';
 for(const c of url) d.key(c);
 assert.equal(d.text,url);
 assert.ok(d.create(s)); assert.equal(s.state.contentItems[0].sourceRef,url);
 const keys=new creation.XrCreation();
 assert.ok(keys.keys.includes('a'));
 assert.ok(keys.keys.includes('caps'));
 keys.key('caps'); assert.ok(keys.keys.includes('A'));
 for(const c of ':&=?%#_+@.,-/\'!') {
   assert.ok(keys.keys.includes(c),`missing ${c}`);
 }
});
test('link mode rejects malformed URLs without creating a note or changing the save',()=>{
 const s=new Store(newRoom()); const before=JSON.stringify(s.state);
 for(const text of ['', 'not a url', 'https://', 'https://bad host']) {
  const d=new creation.XrCreation(); d.title='Invalid link'; d.text=text;
  assert.equal(d.create(s),null,`reject ${JSON.stringify(text)}`);
  // main rejects blank content ahead of URL parsing with its own message; both refuse to mutate.
  assert.match(d.error,text===''?/enter content/i:/valid.*URL/i); assert.equal(d.created,false);
  assert.equal(JSON.stringify(s.state),before);
 }
});
test('full room creation remains recoverable in Inbox and keyboard supports edit/space/punctuation',()=>{
 const Draft=(creation as any).XrCreation;assert.equal(typeof Draft,'function');
 const s=new Store(newRoom());for(const slot of s.layout.slots)s.addItem({title:slot.id,sourceRef:''});
 const d=new Draft();d.key('A');d.key('space');d.key('B');d.key('backspace');assert.equal(d.title,'A ');
 d.mode='note';d.field='text';for(const c of 'a note!')d.key(c);assert.equal(d.text,'a note!');
 const id=d.create(s);assert.ok(id);const c=s.state.contentItems.at(-1)!;assert.equal(s.repFor(c.id),undefined);assert.match(d.message,/Unpack/);
});
