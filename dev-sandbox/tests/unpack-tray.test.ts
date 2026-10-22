import test from 'node:test';
import assert from 'node:assert/strict';
import { Store,newRoom } from '../src/core/store';
import { packedItems,unpackItem } from '../src/core/packed-items';
import { LESSONS } from '../src/core/onboarding';
import { panelButtons,runPanelAction } from '../src/xr/interaction';
test('visible tutorial copy says Pack item/Unpack while compatibility IDs remain unchanged',()=>{
 for(const step of Object.values(LESSONS).flat())assert.doesNotMatch(step.title+' '+step.prompt,/stash|inbox/i);
 const step=LESSONS.move.find(s=>s.id==='move-stash')!;assert.equal(step.event,'stashed');assert.match(step.target,/data-action="stash"/);assert.match(step.title,/Pack item/);
});
const saved=new Map<string,string>();
globalThis.localStorage={getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>saved.set(k,v)} as Storage;
test('Pack item then Unpack restores the same content and chosen model, with no duplicate and persisted state',()=>{
 const store=new Store(newRoom('Mine'),'unpack-proof');const id=store.addItem({title:'My guitar',sourceRef:'https://example.com/guitar',kind:'guitar'});
 const content=store.state.representations.find(r=>r.id===id)!.contentItemId;store.stash(id);
 assert.equal(packedItems(store).length,1);assert.equal(unpackItem(store,content),'unpacked');
 assert.equal(store.repFor(content)?.objectKind,'guitar');assert.ok(store.slotOf(store.repFor(content)!.id));
 assert.equal(unpackItem(store,content),'already');assert.equal(store.state.representations.filter(r=>r.contentItemId===content).length,1);
 const reloaded=new Store(Store.loadSaved('unpack-proof')!,'unpack-proof');assert.equal(reloaded.repFor(content)?.objectKind,'guitar');assert.equal(packedItems(reloaded).length,0);
});
test('full rooms leave packed content intact with feedback instead of creating a duplicate or losing its model',()=>{
 const store=new Store(newRoom('Full'));const id=store.addItem({title:'Keep me',sourceRef:'https://example.com/full',kind:'book'});const content=store.state.representations.find(r=>r.id===id)!.contentItemId;store.stash(id);
 for(const [i,slot] of store.layout.slots.entries()){store.state.representations.push({id:'filled-'+i,contentItemId:'other-'+i,objectKind:'book'});store.state.placements.push({representationId:'filled-'+i,slotId:slot.id});}
 assert.equal(unpackItem(store,content),'full');assert.equal(store.repFor(content),undefined);assert.equal(packedItems(store).some(c=>c.id===content),true);assert.equal(store.content(content)?.lastObjectKind,'book');
});
test('XR item pillar exposes Unpack tray, empty feedback, Pack item action and real restore status',()=>{
 const store=new Store(newRoom('Mine'));assert.ok(panelButtons(store,'portal').some(b=>b.id==='page:inbox'&&b.label==='Unpack'));
 assert.ok(panelButtons(store,'inbox').some(b=>b.label.includes('No packed items')));
 const id=store.addItem({title:'Packed note',sourceRef:'hello',type:'note'});store.select(id);runPanelAction(store,'stash:'+id);const c=packedItems(store)[0];
 assert.ok(panelButtons(store,'inbox').some(b=>b.id==='out:'+c.id&&b.label.includes('Unpack')));
 assert.match(runPanelAction(store,'out:'+c.id).status!,/Unpacked/);
});
