import test from 'node:test';
import assert from 'node:assert/strict';
import { panelButtons,runPanelAction } from '../src/xr/interaction';
import { Store,newRoom } from '../src/core/store';
import { roomCatalog } from '../src/core/room-portal';
globalThis.localStorage={getItem:()=>null,setItem(){}} as unknown as Storage;
test('room portal controller menu wires real random, JSON, overworld and customization actions',()=>{
 const store=new Store(newRoom('Mine'),'demo-visit');const rooms=[{name:'extra',data:newRoom('Extra')}];
 const buttons=panelButtons(store,'room-portal',rooms);
 for(const id of ['rooms:random','rooms:save','rooms:load','page:overworld','page:customize'])assert.ok(buttons.some(b=>b.id===id));
 assert.deepEqual(runPanelAction(store,'rooms:save',rooms),{roomFile:'save'});
 assert.deepEqual(runPanelAction(store,'rooms:load',rooms),{roomFile:'load'});
 assert.equal(runPanelAction(store,'page:overworld',rooms).page,'overworld');
 assert.equal(runPanelAction(store,'page:customize',rooms).page,'customize');
 runPanelAction(store,'rooms:random',rooms);assert.ok(store.visiting);runPanelAction(store,'home:return',rooms);assert.equal(store.state.owner,'Mine');
 for(const room of roomCatalog(rooms)) {runPanelAction(store,'island:'+room.id,rooms);if(room.id!=='home')assert.equal(store.visiting,room.id);}
 runPanelAction(store,'island:home',rooms);assert.equal(store.state.owner,'Mine');
 assert.equal(store.roomId,'demo-visit');
});
