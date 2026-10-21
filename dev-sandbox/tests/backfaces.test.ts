import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildObject } from '../src/views/objects';

function ray(root: THREE.Object3D, x:number,y:number, rear=true, originZ=2) {
  root.scale.setScalar(1); // Probe catalog-local dimensions, independent of display scale.
  root.updateWorldMatrix(true,true);
  return new THREE.Raycaster(new THREE.Vector3(x,y,rear?-originZ:originZ),new THREE.Vector3(0,0,rear?1:-1)).intersectObject(root,true)[0];
}

test('guitar rear is continuous opaque wood including behind the front soundhole',()=>{
  const g=buildObject('guitar');
  // Probe the soundhole and the surrounding rear panel, not just an object name.
  for(const y of [.315,.335,.355,.375,.395]) for(const x of [-.04,-.02,0,.02,.04]) {
    const hit=ray(g,x,y);
    assert.ok(hit,`rear coverage ${x},${y}`);
    assert.ok(Math.abs(hit.point.z+.05)<1e-5,`rear must be flush wood, not a deep hole: ${hit.point.z}`);
    const mat=(hit.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
    assert.equal(mat.color.getHex(),0xc88e4f);
    assert.equal(mat.opacity,1);
    assert.ok(hit.face!.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize().z<-.99);
  }
  // Between the strings, the front must retain an opening with a recessed interior.
  const opening=ray(g,.025,.355,false)!;
  assert.ok(opening.point.z<.04 && opening.point.z>-.04);
  assert.ok(Math.abs(ray(g,.09,.355,false)!.point.z-.05)<1e-5);
});

test('VR optics face the wearer (-Z) and sit recessed inside connected eyecups',()=>{
  const g=buildObject('vrDevice');
  // Eye rays start inside the head strap: an external axial rear ray hits the
  // preserved strap first. The rear/isometric visual harness checks that occlusion.
  for(const x of [-.13,.13]) {
    for(const dx of [-.025,0,.025]) for(const dy of [-.02,0,.02]) {
      const hit=ray(g,x+dx,.13+dy,true,.09)!;
      assert.ok(hit && hit.point.z<-.025,'wearer rays must reach optics behind the shell');
      const mat=(hit.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
      assert.ok(mat.roughness<.3,'actual optical material, not cream shell or foam');
      assert.ok(hit.face!.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize().z<-.7,'optics normal faces wearer, not exterior');
    }
    const center=ray(g,x,.13,true,.09)!;
    const lensBounds=new THREE.Box3().setFromObject(center.object);
    assert.ok(lensBounds.max.z>=-.02,'lens rear seat intersects the visor rather than floating');
    const rim=ray(g,x+.075,.13,true,.09)!;
    assert.ok(rim.point.z<center.point.z-.015,'optics recessed inside a raised eyecup');
    const housing=ray(g,x+.09,.13,true,.09)!;
    assert.ok(housing.point.z<-.02,'eyecup integrated into rear facial interface');
  }
  // Exterior design stays on +Z; optics are a separate wearer-facing assembly.
  assert.ok(ray(g,.13,.13,false)!.point.z>.18);
});
