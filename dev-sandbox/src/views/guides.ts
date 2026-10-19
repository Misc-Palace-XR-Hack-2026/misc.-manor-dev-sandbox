import * as THREE from 'three';

// Guides are composition aids that exist only in the Scenes preview. They are never part of a capture or a recording:
// RoomView hides the whole guides group while it renders a frame.

/**
 * A translucent seated person, built in the ARMCHAIR's local frame (chair raw units, +z = the way the chair faces) so it can
 * simply copy the chair's position, rotation and scale. Proportions follow a ~1.75 m adult in a ~0.9 m-per-unit chair.
 */
export function buildSeatedGuide(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'GuideSeatedPerson';
  const material = new THREE.MeshBasicMaterial({
    color: 0x7fe3ff, transparent: true, opacity: 0.38, depthWrite: false,
  });
  const shape = (geometry: THREE.BufferGeometry) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 10;
    group.add(mesh);
    return mesh;
  };
  const limb = (a: THREE.Vector3Tuple, b: THREE.Vector3Tuple, radius: number) => {
    const from = new THREE.Vector3(...a);
    const to = new THREE.Vector3(...b);
    const length = from.distanceTo(to);
    const mesh = shape(new THREE.CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 4, 10));
    mesh.position.copy(from).lerp(to, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  };

  const hip: THREE.Vector3Tuple = [0, 0.56, -0.02];
  const shoulder: THREE.Vector3Tuple = [0, 1.12, -0.13];
  limb(hip, shoulder, 0.2); // torso
  const head = shape(new THREE.SphereGeometry(0.115, 16, 12));
  head.position.set(0, 1.32, -0.12);
  limb([0, 1.18, -0.14], [0, 1.24, -0.13], 0.055); // neck
  for (const side of [-1, 1]) {
    limb([side * 0.12, 0.56, 0], [side * 0.13, 0.6, 0.5], 0.085); // thigh
    limb([side * 0.13, 0.6, 0.5], [side * 0.14, 0.1, 0.55], 0.065); // shin
    limb([side * 0.14, 0.06, 0.55], [side * 0.14, 0.04, 0.72], 0.05); // foot
    limb([side * 0.24, 1.08, -0.12], [side * 0.3, 0.82, 0.06], 0.055); // upper arm
    limb([side * 0.3, 0.82, 0.06], [side * 0.3, 0.7, 0.3], 0.045); // forearm resting on the armrest
  }
  return group;
}

export function disposeGuide(group: THREE.Group): void {
  const materials = new Set<THREE.Material>();
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    materials.add(mesh.material as THREE.Material);
  });
  for (const m of materials) m.dispose();
}
