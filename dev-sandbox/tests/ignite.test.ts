import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Store,newRoom,validateRoom} from '../src/core/store';
import {OBJECT_KINDS,OBJECT_LABELS, type ObjectKind} from '../src/core/types';
import {buildObject} from '../src/views/objects';
import {disposeGroup} from '../src/views/resources';
const kinds = ['arDevice','vrDevice','igniteLogo','fireplace'] as ObjectKind[];
globalThis.localStorage = {getItem:()=>null,setItem:()=>{}} as unknown as Storage;
test('Ignite objects create/reassign/move/stash/undo and roundtrip without changing identity',()=>{
 for(const kind of kinds){
  assert.ok(OBJECT_KINDS.includes(kind),kind);
  assert.ok(OBJECT_LABELS[kind]);
  const s=new Store(newRoom());const id=s.addItem({title:'Ignite',sourceRef:'https://example.com',kind});
  const content=s.state.representations[0].contentItemId;
  s.setKind(id,kind);s.pickUp(id);s.place(id,s.layout.slots[1].id);
  assert.equal(s.slotOf(id),s.layout.slots[1].id);
  s.stash(id);s.undo();assert.equal(s.state.representations[0].contentItemId,content);
  const copy=new Store(JSON.parse(s.exportJson()));assert.equal(validateRoom(copy.state),null);
  assert.equal(copy.state.representations[0].objectKind,kind);
 }
});
test('Ignite models have recognizable named parts and independent geometry/material disposal',()=>{
 for(const kind of kinds){
  assert.ok(OBJECT_KINDS.includes(kind),kind);
  const a=buildObject(kind),b=buildObject(kind);
  const bounds=new THREE.Box3().setFromObject(a),size=bounds.getSize(new THREE.Vector3());
  assert.ok(size.x<1.9 && size.y<1.7 && size.z<1.9 && bounds.min.y>=-.01);
  const resources=new Set<unknown>();a.traverse(o=>{if(o instanceof THREE.Mesh){resources.add(o.material);resources.add(o.geometry);}});
  b.traverse(o=>{if(o instanceof THREE.Mesh){assert.ok(!resources.has(o.material));assert.ok(!resources.has(o.geometry));}});
  if(kind==='arDevice') for(const n of ['ar-lens-left','ar-lens-right','ar-temple-left']) assert.ok(a.getObjectByName(n));
  if(kind==='vrDevice') for(const n of ['vr-visor','vr-strap','vr-lens-left']) assert.ok(a.getObjectByName(n));
  if(kind==='igniteLogo'||kind==='fireplace'){
   const flame=a.getObjectByName('flame') as THREE.Mesh;
   assert.ok(flame);assert.ok((flame.material as THREE.MeshStandardMaterial).emissiveIntensity>1);
   assert.ok(a.getObjectByName('fire-glow'));
   if(kind==='fireplace'){assert.equal(typeof flame.userData.animate,'function');flame.userData.animate(0);const h=flame.scale.y;flame.userData.animate(.5);assert.notEqual(flame.scale.y,h);}
  }
  disposeGroup(a);assert.ok(new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3()).x>0);disposeGroup(b);
 }
});
