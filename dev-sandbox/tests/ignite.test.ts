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

const bounds = (o: THREE.Object3D) => { o.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(o); };
const named = (g: THREE.Object3D, name: string) => {
  const o = g.getObjectByName(name);
  assert.ok(o, name);
  return o!;
};

test('fireplace jambs rest on the hearth and hold up the mantel with the fireback filling the opening', () => {
  const g = buildObject('fireplace');
  const hearth = bounds(named(g, 'hearth'));
  const mantel = bounds(named(g, 'mantel'));
  const fireback = bounds(named(g, 'fireback'));
  const left = bounds(named(g, 'jamb-left'));
  const right = bounds(named(g, 'jamb-right'));
  for (const jamb of [left, right]) {
    assert.ok(jamb.intersectsBox(hearth), 'jamb sits on hearth');
    assert.ok(jamb.intersectsBox(mantel), 'jamb holds up mantel');
    assert.ok(jamb.intersectsBox(fireback), 'fireback meets jamb');
  }
  assert.ok(Math.abs(left.max.y - mantel.min.y) < 0.02, `mantel rests on jambs, gap ${mantel.min.y - left.max.y}`);
  assert.ok(Math.abs(left.min.y - hearth.max.y) < 0.02, `jambs rest on hearth, gap ${left.min.y - hearth.max.y}`);
});

test('AR glasses rest on the stand and have glass on both the front and back of each frame', () => {
  const g = buildObject('arDevice');
  const stand = bounds(named(g, 'ar-stand'));
  for (const side of ['left', 'right'] as const) {
    const frame = bounds(named(g, `ar-frame-${side}`));
    const front = bounds(named(g, `ar-lens-${side}`));
    const back = bounds(named(g, `ar-lens-${side}-back`));
    assert.ok(frame.intersectsBox(stand), `${side} frame sits on the stand`);
    assert.ok(frame.intersectsBox(front), `${side} front glass sits in the frame`);
    assert.ok(frame.intersectsBox(back), `${side} back glass sits in the frame`);
    assert.ok(back.max.z < front.min.z, `${side} back glass is behind the front glass`);
  }
});

test('VR strap attaches to the visor without a stick poking out the back', () => {
  const g = buildObject('vrDevice');
  const visor = bounds(named(g, 'vr-visor'));
  const strap = named(g, 'vr-strap') as THREE.Mesh<THREE.TorusGeometry>;
  assert.ok(bounds(strap).intersectsBox(visor), 'strap meets visor');
  assert.equal(g.getObjectByName('vr-top-strap'), undefined, 'no leftover top stick');
  const geom = strap.geometry;
  assert.ok(geom instanceof THREE.TorusGeometry, 'strap is a loop, not a box rod');
  assert.ok(geom.parameters.arc <= Math.PI + 0.01, 'strap is an open rear loop, not a full donut');
  strap.updateWorldMatrix(true, false);
  const r = geom.parameters.radius;
  const visorPad = visor.clone().expandByScalar(0.03);
  for (const theta of [0, geom.parameters.arc]) {
    const end = strap.localToWorld(new THREE.Vector3(r * Math.cos(theta), r * Math.sin(theta), 0));
    assert.ok(visorPad.containsPoint(end), `strap end ${theta} enters the visor`);
  }
  const extra = visor.min.z - bounds(strap).min.z;
  assert.ok(extra > 0.04, 'strap goes behind the visor like a head strap');
  assert.ok(extra < visor.getSize(new THREE.Vector3()).z * 1.15, `strap depth behind visor is a loop, not a rod (${extra})`);
  for (const side of ['left', 'right'] as const) {
    const lens = bounds(named(g, `vr-lens-${side}`));
    assert.ok(lens.intersectsBox(visor), `${side} lens sits in the visor`);
    assert.ok(lens.max.z >= visor.max.z - 0.01, `${side} lens is on the front face`);
  }
});

test('fireplace flame stays in the opening under the mantel', () => {
  const g = buildObject('fireplace');
  const flame = bounds(named(g, 'flame'));
  const mantel = bounds(named(g, 'mantel'));
  const left = bounds(named(g, 'jamb-left'));
  const right = bounds(named(g, 'jamb-right'));
  assert.ok(flame.max.y < mantel.min.y + 0.02, `flame does not poke through the mantel (top ${flame.max.y} vs mantel ${mantel.min.y})`);
  assert.ok(flame.min.x > left.max.x - 0.08 && flame.max.x < right.min.x + 0.08, 'flame stays between the jambs');
});
