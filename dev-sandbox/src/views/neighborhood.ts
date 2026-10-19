import * as THREE from 'three';
import { disposeGroup, type FixtureRig } from './lounge-fixtures';

// Neighborhood diorama for the closing zoom-out: a grass plate with streets, trees and rows of small houses around the
// room. The group's origin is the center of the room, so the fixture is placed at the room's floor center. Houses are
// kept out of the cells in front of the room (toward the default camera) so they never hide it; those hold trees.

const CELL_X = 9;
const CELL_Z = 8.5;
const ROAD_Z = [-12.5, -4.25, 4.25, 12.5];

const WALLS = [0xe9d8b8, 0xd9a5a0, 0xa8c4d4, 0xc9d6a8, 0xf0c987, 0xb9a7d1, 0xf2e6d0];
const ROOFS = [0xb5523b, 0x5b6770, 0x3f6f73, 0x7a4a3a, 0x8a5a9a];

/** Deterministic pseudo-random in [0, 1) from an integer seed, so the diorama is identical on every build. */
function unit(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function buildNeighborhood(): FixtureRig {
  const group = new THREE.Group();
  group.name = 'neighborhood';

  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (color: number, emissive = 0): THREE.MeshStandardMaterial => {
    const key = `${color}:${emissive}`;
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });
      if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = 0.9; }
      materials.set(key, m);
    }
    return m;
  };
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const box = (parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, emissive = 0) =>
    add(parent, new THREE.BoxGeometry(w, h, d), material(color, emissive), x, y, z);

  // Ground plate: grass over a darker slab of earth, with street strips on top.
  const PLATE = 56;
  box(group, PLATE, 0.1, PLATE, 0x82b565, 0, -0.1, 0);
  box(group, PLATE, 0.6, PLATE, 0x5b4636, 0, -0.45, 0);
  for (const z of ROAD_Z) {
    box(group, PLATE, 0.02, 1.2, 0x5a5d66, 0, -0.04, z);
    box(group, PLATE, 0.021, 0.06, 0xf2e6a0, 0, -0.035, z); // center line
  }

  const house = (i: number, j: number, seed: number): void => {
    const rnd = (n: number): number => unit(seed * 17 + n);
    const w = 4.8 + rnd(1) * 1.4;
    const d = 4 + rnd(2) * 1.0;
    const h = 2.6 + rnd(3) * 1.4;
    const wall = WALLS[Math.floor(rnd(4) * WALLS.length)];
    const roofColor = ROOFS[Math.floor(rnd(5) * ROOFS.length)];

    const g = new THREE.Group();
    g.position.set(i * CELL_X, 0, j * CELL_Z);
    g.rotation.y = j > 0 ? Math.PI : 0; // houses face the street between them and the room
    group.add(g);

    box(g, w, h, d, wall, 0, h / 2, 0);

    // Gable roof: a triangle extruded along the depth, slightly overhanging.
    const roofH = 1.3 + rnd(6) * 0.5;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 - 0.25, 0);
    shape.lineTo(w / 2 + 0.25, 0);
    shape.lineTo(0, roofH);
    shape.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: d + 0.5, bevelEnabled: false });
    roofGeo.translate(0, 0, -(d + 0.5) / 2);
    add(g, roofGeo, material(roofColor), 0, h, 0);

    // Chimney, door and windows on the street side (+z in the house's own frame).
    box(g, 0.5, 1.2, 0.5, 0x8a5a4a, w * 0.25, h + roofH * 0.55, -d * 0.15);
    box(g, 0.8, 1.5, 0.1, 0x6b4a32, (rnd(7) - 0.5) * w * 0.3, 0.75, d / 2 + 0.04);
    for (const sx of [-1, 1]) {
      const lit = rnd(8 + sx) > 0.3;
      box(g, 0.9, 0.9, 0.1, lit ? 0xffd58a : 0x7d94a8, sx * w * 0.3, h * 0.6, d / 2 + 0.04, lit ? 0xffb347 : 0);
    }
    // A little front step and garden hedge.
    box(g, 1.2, 0.12, 0.5, 0xb8b2a6, (rnd(7) - 0.5) * w * 0.3, 0.06, d / 2 + 0.25);
    box(g, w * 0.5, 0.35, 0.4, 0x4f8a45, -w * 0.18, 0.18, d / 2 + 0.9);
  };

  const tree = (x: number, z: number, seed: number): void => {
    const s = 0.8 + unit(seed) * 0.7;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    group.add(g);
    add(g, new THREE.CylinderGeometry(0.14 * s, 0.18 * s, 1.1 * s, 8), material(0x6b4a32), 0, 0.55 * s, 0);
    add(g, new THREE.SphereGeometry(0.9 * s, 12, 8), material(0x3f8a4f), 0, 1.7 * s, 0);
    add(g, new THREE.SphereGeometry(0.62 * s, 12, 8), material(0x4fa05c), 0.3 * s, 2.3 * s, 0.1 * s);
  };

  let n = 0;
  for (let j = -2; j <= 2; j++) {
    for (let i = -2; i <= 2; i++) {
      n++;
      if (i === 0 && j === 0) continue; // the room itself
      const inFront = i >= 0 && j >= 0; // toward the default camera
      if (inFront && (i <= 1 && j <= 1)) {
        // A small park instead of houses, so the room stays in view.
        for (let k = 0; k < 3; k++) {
          tree(i * CELL_X + (unit(n * 5 + k) - 0.5) * 6, j * CELL_Z + (unit(n * 7 + k) - 0.5) * 5, n * 11 + k);
        }
        continue;
      }
      house(i, j, n);
      // A tree beside most houses.
      if (j !== 0 && unit(n * 3) > 0.35) tree(i * CELL_X + 3.9, j * CELL_Z + (j > 0 ? -1 : 1) * 2.8, n * 13);
    }
  }

  const dispose = (): void => {
    disposeGroup(group);
    for (const m of materials.values()) m.dispose();
    materials.clear();
  };
  return { group, update: () => undefined, dispose };
}
