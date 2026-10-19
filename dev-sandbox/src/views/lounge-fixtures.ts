import * as THREE from 'three';

// Lounge fixtures for the trailer: a reclined lounge chair and a blocky avatar in it, wearing headphones.
// Local frame (both): x is centered, y = 0 is the floor, the sitter faces +z, the chair back is toward -z.
// Built from boxes only, so there are no assets to load. The avatar sits at the same origin as the chair.

export interface FixtureRig {
  group: THREE.Group;
  /** Advance idle animation. `t` is seconds. */
  update(t: number): void;
  dispose(): void;
}

const std = (color: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0 });

/** Box by CENTER. */
function box(name: string, w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(color));
  m.name = name;
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function disposeGroup(group: THREE.Object3D): void {
  group.traverse((o) => {
    const any = o as THREE.Mesh;
    if (any.geometry) any.geometry.dispose();
    const m = any.material;
    if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
  });
}

// ---- lounge chair ----------------------------------------------------------------------------------------------

const CHAIR_SEAT_TOP = 0.42;
const CHAIR_RECLINE = -0.35; // radians about x: negative leans the top of the back toward -z

export function buildLoungeChair(): FixtureRig {
  const group = new THREE.Group();
  group.name = 'lounge-chair';
  const frame = 0x3b2a20;
  const leather = 0xb5623a;
  const leatherDark = 0x8f4a2b;

  // Wooden frame and legs.
  group.add(box('chair-frame', 0.96, 0.1, 0.96, frame, 0, 0.17, 0));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) group.add(box('chair-leg', 0.07, 0.12, 0.07, frame, sx * 0.4, 0.06, sz * 0.4));
  }
  // Seat cushion.
  group.add(box('chair-seat', 0.74, 0.14, 0.86, leather, 0, CHAIR_SEAT_TOP - 0.07, 0.02));
  // Side panels with padded arm rests.
  for (const sx of [-1, 1]) {
    group.add(box('chair-side', 0.1, 0.4, 0.84, leatherDark, sx * 0.48, 0.3, 0));
    group.add(box('chair-arm', 0.15, 0.08, 0.84, leather, sx * 0.48, 0.54, 0));
  }
  // Reclined back with a headrest pillow.
  const back = new THREE.Group();
  back.position.set(0, CHAIR_SEAT_TOP - 0.02, -0.4);
  back.rotation.x = CHAIR_RECLINE;
  back.add(box('chair-back', 0.78, 0.8, 0.14, leather, 0, 0.4, 0));
  back.add(box('chair-pillow', 0.4, 0.2, 0.1, leatherDark, 0, 0.74, 0.1));
  group.add(back);
  // Footrest ottoman.
  group.add(box('chair-ottoman', 0.62, 0.3, 0.42, leather, 0, 0.2, 0.78));
  group.add(box('chair-ottoman-base', 0.5, 0.06, 0.32, frame, 0, 0.03, 0.78));

  const dispose = (): void => disposeGroup(group);
  return { group, update: () => undefined, dispose };
}

// ---- avatar ----------------------------------------------------------------------------------------------------

export function buildAvatar(): FixtureRig {
  const group = new THREE.Group();
  group.name = 'avatar';
  const skin = 0xe0b08a;
  const hair = 0x2a1d1a;
  const shirt = 0x3f7fb5;
  const pants = 0x2f3a55;
  const shoe = 0xf2efe6;
  const phones = 0xe85d75;
  const phonesDark = 0x2b2b30;

  const hip = new THREE.Group();
  hip.position.set(0, CHAIR_SEAT_TOP + 0.04, -0.25);
  group.add(hip);

  // Torso leans back with the chair: pivot at the hip, so the head and arms ride along.
  const torso = new THREE.Group();
  torso.rotation.x = CHAIR_RECLINE;
  hip.add(torso);
  torso.add(box('avatar-torso', 0.38, 0.52, 0.2, shirt, 0, 0.26, 0));

  // Arms rest forward along the chair arms.
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(sx * 0.26, 0.46, 0);
    arm.rotation.x = 1.0 - CHAIR_RECLINE; // undo the torso lean, then point the arm forward and down onto the lap
    arm.add(box('avatar-arm', 0.1, 0.1, 0.4, shirt, 0, 0, 0.18));
    arm.add(box('avatar-hand', 0.09, 0.09, 0.09, skin, 0, 0, 0.4));
    torso.add(arm);
  }

  // Head with hair, closed eyes and headphones. The head pivots at the neck for the music bob.
  const head = new THREE.Group();
  head.position.set(0, 0.54, 0.02);
  torso.add(head);
  head.add(box('avatar-head', 0.28, 0.28, 0.28, skin, 0, 0.16, 0));
  head.add(box('avatar-hair', 0.3, 0.1, 0.3, hair, 0, 0.3, -0.01));
  head.add(box('avatar-hair-back', 0.3, 0.22, 0.08, hair, 0, 0.2, -0.12));
  for (const sx of [-1, 1]) {
    head.add(box('avatar-eye', 0.06, 0.015, 0.02, hair, sx * 0.07, 0.18, 0.145));
    head.add(box('avatar-ear-cup', 0.07, 0.15, 0.17, phones, sx * 0.175, 0.16, 0));
    head.add(box('avatar-ear-pad', 0.03, 0.12, 0.13, phonesDark, sx * 0.21, 0.16, 0));
  }
  head.add(box('avatar-band', 0.38, 0.04, 0.05, phones, 0, 0.35, 0));
  for (const sx of [-1, 1]) head.add(box('avatar-band-side', 0.04, 0.22, 0.05, phones, sx * 0.175, 0.27, 0));

  // Legs go forward over the seat and rest on the ottoman.
  const feet: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    group.add(box('avatar-thigh', 0.15, 0.15, 0.6, pants, sx * 0.1, CHAIR_SEAT_TOP + 0.1, 0.06));
    group.add(box('avatar-shin', 0.14, 0.14, 0.4, pants, sx * 0.1, CHAIR_SEAT_TOP - 0.01, 0.58));
    const foot = box('avatar-foot', 0.14, 0.1, 0.2, shoe, sx * 0.1, CHAIR_SEAT_TOP + 0.0, 0.86);
    group.add(foot);
    feet.push(foot);
  }

  const baseHeadY = head.position.y;
  const update = (t: number): void => {
    // A slow nod to the beat (about 2.2 beats per second), a little side tilt, and one foot tapping.
    const beat = t * 2.2 * Math.PI;
    head.rotation.x = Math.sin(beat) * 0.07;
    head.rotation.z = Math.sin(beat * 0.5) * 0.06;
    head.position.y = baseHeadY + Math.abs(Math.sin(beat)) * 0.012;
    feet[1].rotation.x = Math.max(0, Math.sin(beat)) * -0.25;
  };
  update(0);

  const dispose = (): void => disposeGroup(group);
  return { group, update, dispose };
}
