import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OBJECT_KINDS, OBJECT_LABELS, type ObjectKind } from '../src/core/types';
import { Store, newRoom, validateRoom } from '../src/core/store';
import { buildObject } from '../src/views/objects';
import { panelButtons, runPanelAction, xrSelect } from '../src/xr/interaction';
import { kindThumbnail } from '../src/views/kind-thumbnail';

const saved = new Map<string,string>();
globalThis.localStorage = { getItem: (k:string) => saved.get(k) ?? null, setItem: (k:string,v:string) => saved.set(k,v) } as Storage;
globalThis.document = {createElement: () => ({dataset:{},setAttribute(){},getContext:()=>new Proxy({}, {get:()=>()=>{}})})} as unknown as Document;

test('guitar strings meet a bridge and nut and the soundhole has a recessed back', () => {
  const g = buildObject('guitar');
  const bridge = g.getObjectByName('guitar-bridge')!;
  const nut = g.getObjectByName('guitar-nut');
  assert.ok(nut, 'strings need a nut at the neck/headstock junction');
  g.updateMatrixWorld(true);
  const bounds = (o:THREE.Object3D) => new THREE.Box3().setFromObject(o);
  for(let i=0;i<6;i++) {
    const string = bounds(g.getObjectByName(`guitar-string-${i}`)!);
    assert.ok(string.intersectsBox(bounds(bridge)), 'string touches bridge');
    assert.ok(string.intersectsBox(bounds(nut)), 'string touches nut');
  }
  const back = g.getObjectByName('guitar-soundhole-back');
  assert.ok(back, 'soundhole shows the inside of a body, not daylight through a plank');
  assert.ok(bounds(back).max.z < bounds(g.getObjectByName('guitar-body')!).max.z - .01, 'soundhole backing is recessed behind the soundboard');
});

for (const requested of ['clock','guitar','synthesizer','drum','lamp','coffeeMaker']) test(`${requested}: assignable, built, thumbnailed, XR movable and save compatible`, () => {
  const kind = requested as ObjectKind;
  assert.ok((OBJECT_KINDS as readonly string[]).includes(kind), `${kind} in shared catalog`);
  assert.ok(OBJECT_LABELS[kind]);
  assert.notEqual(kindThumbnail(kind).textContent, OBJECT_LABELS[kind].slice(0,1), 'dedicated thumbnail, not fallback initial');
  const g = buildObject(kind);
  const b = new THREE.Box3().setFromObject(g), size = b.getSize(new THREE.Vector3());
  assert.ok(Math.abs(b.min.y) < .025, `${kind} grounded: ${b.min.y}`);
  assert.ok(size.x > .2 && size.y > .15 && size.z > .08 && Math.max(size.x,size.y,size.z) < 2);
  let meshes = 0; g.traverse(o => { if(o instanceof THREE.Mesh) meshes++; });
  assert.ok(meshes >= 5, 'recognizable multipart model');
  const store = new Store(newRoom());
  const id = store.addItem({title:'Cozy note',sourceRef:'Keep my content',type:'note',kind:'book'});
  const original = structuredClone(store.state.contentItems);
  store.select(id);
  assert.ok(panelButtons(store,'object').some(b=>b.id===`kind:${kind}`));
  runPanelAction(store,`kind:${kind}`);
  runPanelAction(store,'move');
  assert.equal(store.slotOf(id),undefined);
  xrSelect(store,{kind:'destination',id:'floor-3'});
  assert.equal(store.slotOf(id),'floor-3');
  const loaded = new Store(JSON.parse(store.exportJson()));
  assert.equal(validateRoom(loaded.state),null);
  assert.equal(loaded.state.representations[0].objectKind,kind);
  assert.deepEqual(loaded.state.contentItems,original);
  assert.equal(loaded.slotOf(id),'floor-3');
  assert.deepEqual(Store.loadSaved(),loaded.state);
});
