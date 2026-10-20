import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { toyBuilders } from '../src/views/toy-objects';
import { animateIgnite } from '../src/views/ignite-objects';
const build = (kind: keyof typeof toyBuilders) => { const g=new THREE.Group();g.add(...toyBuilders[kind]());g.updateWorldMatrix(true,true);return g; };
test('fish tail apex attaches toward body, fan opens away from nose',()=>{
 const g=build('fishBowl'), tail=g.getObjectByName('fish-tail')!;
 const apex=new THREE.Vector3(0,.03,0).applyEuler(tail.rotation).add(tail.position);
 const fan=new THREE.Vector3(0,-.03,0).applyEuler(tail.rotation).add(tail.position);
 assert.ok(apex.x>fan.x,'narrow end faces body');
 assert.ok(apex.x>-.0612 && apex.x<-.04,'tail joins body');
});
test('rocket fins are radial swept plates with roots inside hull and feet at floor',()=>{
 const g=build('rocket');
 for(let i=0;i<3;i++) {
  const holder=g.getObjectByName(`rocket-fin-${i}`)!;
  assert.ok(Math.abs(holder.rotation.y-(i*2*Math.PI/3+Math.PI/2))<1e-9);
  const blade=g.getObjectByName(`rocket-fin-blade-${i}`) as THREE.Mesh;
  const p=blade.geometry.getAttribute('position');
  const vertices=Array.from({length:p.count},(_,j)=>new THREE.Vector3().fromBufferAttribute(p,j).applyMatrix4(blade.matrix));
  assert.ok(vertices.some(v=>v.x<.06&&v.y>.14),'fin root enters lower hull');
  assert.ok(vertices.some(v=>v.x>.1&&Math.abs(v.y)<1e-6),'outer foot rests at floor');
  assert.ok(vertices.every(v=>v.y>=-1e-6&&Math.abs(v.z)<=.007),'thin radial plate above floor');
 }
});
test('fish and lava animate deterministically in shared render lifecycle, bounded inside water/glass',()=>{
 for(const kind of ['fishBowl','lavaLamp'] as const) {
  const g=build(kind), moving=kind==='fishBowl'?[g.getObjectByName('fishbowl-fish')!]:g.children.filter(o=>o.name.startsWith('lava-blob'));
  animateIgnite(g,0);const initial=moving.map(o=>o.position.clone());
  animateIgnite(g,3);assert.ok(moving.some((o,i)=>o.position.distanceTo(initial[i])>.005),'visible motion');
  const sample=moving.map(o=>o.position.toArray());animateIgnite(g,100);animateIgnite(g,3);
  assert.deepEqual(moving.map(o=>o.position.toArray()),sample,'absolute time, no frame accumulation');
  const ids: string[]=[];g.traverse(o=>ids.push(o.uuid));
  for(let t=0;t<180;t+=.37) {
   animateIgnite(g,t);g.updateWorldMatrix(true,true);
   for(const part of moving) part.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;
    const positions=o.geometry.getAttribute('position');
    for(let j=0;j<positions.count;j++) {
     const v=new THREE.Vector3().fromBufferAttribute(positions,j).applyMatrix4(o.matrixWorld);
     if(kind==='fishBowl') {assert.ok(v.distanceTo(new THREE.Vector3(0,.24,0))<.185);assert.ok(v.y<.24+.185*Math.cos(.9));}
     else {assert.ok(v.y>.1&&v.y<.37);assert.ok(Math.hypot(v.x,v.z)<.07-(v.y-.1)*(.035/.27));}
    }
   });
  }
  const after: string[]=[];g.traverse(o=>after.push(o.uuid));assert.deepEqual(after,ids);
  animateIgnite(g,123,true);assert.deepEqual(moving.map(o=>o.position.toArray()),initial.map(v=>v.toArray()),'reduced motion frozen at time zero');
 }
});
const box = (g: THREE.Object3D, name:string) => new THREE.Box3().setFromObject(g.getObjectByName(name)!);

test('skateboard wheels clear deck and axle reaches both wheel hubs through attached supports',()=>{
 const g=build('skateboard'), deck=box(g,'skate-deck');
 for(const end of ['lo','hi']) {
  const hanger=box(g,`skate-truck-hanger-${end}`);
  for(const side of ['l','r']) {
   const wheel=box(g,`skate-wheel-${end}-${side}`);
   assert.ok(wheel.min.z>deck.max.z+.004,'wheel tread must clear deck');
   const hub=wheel.getCenter(new THREE.Vector3());
   assert.ok(hanger.containsPoint(hub),'axle reaches hub');
  }
  const support=box(g,`skate-truck-support-${end}`);
  assert.ok(support.intersectsBox(hanger)&&support.intersectsBox(box(g,`skate-truck-plate-${end}`)));
 }
});

const geo = (lat: number, lon: number) => {
 const a=lat*Math.PI/180, b=lon*Math.PI/180;
 return new THREE.Vector3(Math.cos(a)*Math.cos(b), Math.sin(a), Math.cos(a)*Math.sin(b));
};
test('globe land reads as Earth: continents cover real interiors, open ocean stays water',()=>{
 const g=build('globe');g.updateWorldMatrix(true,true);
 const tilt=g.getObjectByName('globe-tilt')!, land: THREE.Mesh[]=[];
 tilt.traverse(o=>{if(o instanceof THREE.Mesh&&o.name.startsWith('globe-land'))land.push(o);});
 assert.ok(land.length>=6,'a mesh per major landmass');
 const centre=tilt.getWorldPosition(new THREE.Vector3()), q=tilt.getWorldQuaternion(new THREE.Quaternion());
 for(const m of land) {
  const p=m.geometry.getAttribute('position');
  for(let j=0;j<p.count;j++) {
   const r=new THREE.Vector3().fromBufferAttribute(p,j).applyMatrix4(m.matrixWorld).distanceTo(centre);
   assert.ok(r>0.1305&&r<0.134,`land hugs the sphere, got ${r}`);
  }
 }
 const ray=new THREE.Raycaster();
 const isLand=(lat: number,lon: number)=>{
  const d=geo(lat,lon).applyQuaternion(q);
  ray.set(d.clone().multiplyScalar(0.4).add(centre),d.clone().negate());
  return ray.intersectObjects(land,true).length>0;
 };
 for(const [name,lat,lon] of [['Congo basin',0,20],['Sahara',20,8],['southern Africa',-25,25],
  ['Russia',55,38],['Mongolia',45,100],['India',25,78],['Great Plains',40,-100],['Canada',60,-110],
  ['Amazon',-10,-55],['outback',-25,133],['Greenland',75,-42],['Antarctica',-85,10]] as const)
  assert.ok(isLand(lat,lon),`${name} must be land`);
 for(const [name,lat,lon] of [['mid Pacific',0,-150],['south east Pacific',-30,-120],['north Pacific',40,-150],
  ['mid Atlantic',20,-40],['south Atlantic',-25,-15],['Indian ocean',-25,80],['Arctic ocean',88,0]] as const)
  assert.ok(!isLand(lat,lon),`${name} must be open water`);
 let hits=0;const N=600;
 for(let i=0;i<N;i++) {
  const y=1-2*(i+0.5)/N, lat=Math.asin(y)*180/Math.PI, lon=(i*137.508)%360-180;
  if(isLand(lat,lon))hits++;
 }
 const frac=hits/N;
 assert.ok(frac>0.2&&frac<0.4,`land covers about a third of the sphere, got ${frac}`);
});

test('lava glass does not write depth, so moving blobs behind it never disappear',()=>{
 const g=build('lavaLamp');
 const glass=g.getObjectByName('lava-glass') as THREE.Mesh, m=glass.material as THREE.MeshStandardMaterial;
 assert.equal(m.transparent,true);
 assert.equal(m.depthWrite,false,'a depth-writing shell culls the wax it contains');
});
