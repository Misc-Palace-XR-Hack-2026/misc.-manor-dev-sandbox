import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { NeighborhoodWorld } from '../src/views/neighborhood-world';
import { newRoom } from '../src/core/store';

test('all 16 furnished pavilions share connected terrain and safe exterior teleport space', () => {
 const personal=newRoom('Exact personal data'); const before=JSON.stringify(personal);
 const rooms=Array.from({length:16},(_,i)=>({id:i===0?'home':`room:${i}`,label:`Room ${i}`,data:personal}));
 const visits:string[]=[];const world=new NeighborhoodWorld(rooms,personal,id=>visits.push(id));
 assert.equal(world.pavilions.length,16);
 assert.equal(new Set(world.pavilions.map(p=>p.id)).size,16);
 for(const p of world.pavilions){
  assert.ok(p.group.getObjectByName('preview-interior')?.userData.layoutBoxIds.length,'each pavilion contains its real complete layout');
  assert.equal(world.walkable(p.center),false,'no teleport inside furniture or walls');
  assert.equal(world.walkable(p.doorway),true,'connected doorstep street');
  world.spawnOutside(p.id);assert.ok(world.street.position.distanceTo(p.doorway)<.001);
  const outward=p.doorway.clone().sub(p.center).setY(0).normalize();
  const forward=world.street.getWorldDirection(new THREE.Vector3()).setY(0).normalize();assert.ok(forward.dot(outward)>.65,'spawn faces away from room along street');
  const ray=new THREE.Raycaster(p.doorway.clone().setY(1.4),outward.negate());
  assert.equal(world.pick(ray)?.id,p.id,JSON.stringify(ray.intersectObject(world.group,true).slice(0,3).map(h=>({name:h.object.parent?.name,position:h.point.toArray()}))));
 }
 world.spawnOutside(null);assert.ok(world.street.position.distanceTo(world.pavilions.find(p=>p.id==='home')!.doorway)<.001);
 const localLights:THREE.PointLight[]=[];world.group.traverse(o=>{if(o instanceof THREE.PointLight)localLights.push(o);});assert.equal(localLights.length,world.courts.length);assert.ok(localLights.filter(l=>l.visible).length<=4);assert.ok(localLights.every(l=>l.distance>0&&!l.castShadow));
 assert.equal(world.walkable(new THREE.Vector3(0,0,33)),true);
 assert.equal(world.walkable(new THREE.Vector3(9999,0,0)),false);
 world.visit('room:15');world.visit('invalid');assert.deepEqual(visits,['room:15']);
 const group=world.group;world.setMode('tactile');assert.equal(world.camera,world.street);world.setMode('dollhouse');assert.equal(world.camera,world.overview);assert.equal(world.group,group);
 assert.equal(JSON.stringify(personal),before);
 assert.ok(group.getObjectByName('neighborhood-home-trailhead'),'physical home return within XR reach');
 for(const theme of ['daylight','warm','garden','electric']){
   const centerpiece=group.getObjectByName('court-centerpiece-'+theme);assert.ok(centerpiece,'themed grounded centerpiece '+theme);assert.equal(centerpiece.userData.roomId,undefined);
 }
 const counts=new Map<THREE.BufferGeometry|THREE.Material,number>();
 world.group.traverse(o=>{if(o instanceof THREE.Mesh){for(const resource of [o.geometry,...(Array.isArray(o.material)?o.material:[o.material])])if(!counts.has(resource)){counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)!+1));}}});
 world.dispose();assert.equal(world.group.children.length,0);
 for(const count of counts.values())assert.equal(count,1,'shared GPU resource disposed exactly once');
});
import { getLayout } from '../src/core/layout';

test('preview contains every actual layout box including loft/stairs and only actual placed objects at exact local transforms',()=>{
 const room=newRoom('Faithful');const layout=getLayout(room.layoutId)!;
 room.representations=[{id:'real-book',contentItemId:'a',objectKind:'book'},{id:'real-plant',contentItemId:'b',objectKind:'plant'}];room.placements=[{representationId:'real-book',slotId:'floor-1'},{representationId:'real-plant',slotId:'loft-1'}];
 const world=new NeighborhoodWorld([{id:'home',label:'Mine'}],room,()=>{});const interior=world.pavilions[0].group.getObjectByName('preview-interior');assert.ok(interior,'actual layout interior');
 const ids=interior.userData.layoutBoxIds;assert.deepEqual(ids,layout.boxes.map(b=>b.id));assert.ok(ids.some((id:string)=>id.includes('loft')));assert.ok(ids.includes('step-1')&&ids.includes('step-4'));
 const objects=interior.children.filter(o=>o.userData.repId);assert.equal(objects.length,room.placements.length);
 for(const placement of room.placements){const model=objects.find(o=>o.userData.repId===placement.representationId)!;const rep=room.representations.find(r=>r.id===placement.representationId)!;const slot=layout.slots.find(s=>s.id===placement.slotId)!;assert.equal(model.userData.objectKind,rep.objectKind);assert.deepEqual(model.position.toArray(),slot.pos);assert.equal(model.rotation.y,Math.PI/4);assert.deepEqual(model.scale.toArray(),[1.6,1.6,1.6]);}
 assert.ok(interior.children.every(o=>o.userData.repId||o.userData.layoutBoxIds),'no invented room furniture or shell geometry');world.dispose();
});

test('pavilion shell preserves the actual room wall/floor finish identity',()=>{
 const room=newRoom('Mine');room.surfaces={wall:{preset:'brick'},floor:{preset:'stone'}};
 const before=JSON.stringify(room);const world=new NeighborhoodWorld([{id:'home',label:'Mine'}],room,()=>{});
 const meshes:THREE.Mesh[]=[];world.pavilions[0].group.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.surface)meshes.push(o);});
 assert.ok(meshes.some(m=>m.userData.surface==='wall'));assert.ok(meshes.some(m=>m.userData.surface==='floor'));
 for(const mesh of meshes)assert.deepEqual(mesh.userData.surfaceSelection,room.surfaces[mesh.userData.surface as 'wall'|'floor']);
 assert.equal(JSON.stringify(room),before);world.dispose();
});

test('production neighborhood is a shared world rather than a card menu', () => {
 const portal=readFileSync('src/demo/room-portal.ts','utf8');
 assert.doesNotMatch(portal,/drawRoomDiorama|room-island/);
 assert.match(portal,/openNeighborhood/);
});
