import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Store, newRoom } from '../src/core/store';
import { panelButtons, runPanelAction } from '../src/xr/interaction';
globalThis.localStorage={getItem:()=>null,setItem(){}} as unknown as Storage;
test('rooms pillar uses the exact random label and owns the Dev sandbox navigation action',()=>{
 const store=new Store(newRoom('Mine'),'demo-visit');
 const buttons=panelButtons(store,'room-portal',[]);
 assert.equal(buttons.find(b=>b.id==='rooms:random')?.label,'Visit a random room');
 assert.equal(buttons.find(b=>b.id==='rooms:dev')?.label,'Dev sandbox');
 assert.deepEqual(runPanelAction(store,'rooms:dev',[]),{devSandbox:true});
});
test('production pillar is unlabeled and no floating Rooms shortcut is constructed',()=>{
 const model=readFileSync('src/demo/room-portal-model.ts','utf8');
 assert.ok(!model.includes('fillText')&&!model.includes('Sprite'));
 const menu=readFileSync('src/demo/room-portal.ts','utf8');
 assert.ok(!menu.includes('production-rooms'));
 assert.ok(menu.includes("'Visit a random room'"));
 assert.ok(menu.includes("'Dev sandbox'"));
});
