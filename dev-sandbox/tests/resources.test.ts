import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as resources from '../src/views/resources';
test('replacing a group disposes shared geometries, materials and textures once',()=>{
 const g=new THREE.Group(), geo=new THREE.BoxGeometry(), texture=new THREE.Texture();
 const mat=new THREE.MeshStandardMaterial({map:texture});
 g.add(new THREE.Mesh(geo,mat),new THREE.Mesh(geo,mat));
 const counts=[0,0,0];
 [geo,mat,texture].forEach((r,i)=>r.addEventListener('dispose',()=>counts[i]++));
 assert.equal(typeof resources.disposeGroup,'function');
 resources.disposeGroup(g); assert.deepEqual(counts,[1,1,1]); assert.equal(g.children.length,0);
});
