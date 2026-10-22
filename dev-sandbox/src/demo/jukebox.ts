import * as THREE from 'three';

// The "magic jukebox": a large retro arch jukebox that floats just outside the open side of the room.
// Not functional yet. It spins a record, glows, and has a mouth (two lips) that stays a subtle closed seam until
// something is fed to it. Built from primitives only, so there is nothing to load.
//
// Size: about 2.2 wide, 3.5 tall, 1.2 deep. Origin is the bottom centre of the feet; the front faces local +Z.

export interface Jukebox {
  group: THREE.Group;
  /** Call every frame. Spins the record, pulses the neon and eases the mouth. Never moves the group itself. */
  update(timeSeconds: number, deltaSeconds: number): void;
  /** Target for the mouth: 0 closed (a subtle seam), 1 fully open. update() eases toward it. */
  setMouthOpen(amount: number): void;
  /** 0..1 neon and halo brightness. Later raised to attract attention to the jukebox. */
  setGlow(amount: number): void;
  /** 0..1 body opacity (1 = solid). The glass, glare and halo keep their own transparency. */
  setOpacity(amount: number): void;
  /** Distance along the ray to the jukebox itself (the halo doesn't count), or null for a miss. */
  hit(raycaster: THREE.Raycaster): number | null;
  dispose(): void;
}

const HALF_W = 1.0; // body half width
const DEPTH = 1.1;
const FRONT = DEPTH / 2; // z of the body's front face
const SPRING_Y = 2.4; // where the arch starts curving
const WINDOW_BOTTOM = 1.95;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A rectangle with a half-circle on top, drawn into any Path (use a Shape for the outline, a Path for a hole). */
function archPath<T extends THREE.Path>(target: T, halfW: number, bottom: number): T {
  target.moveTo(-halfW, bottom);
  target.lineTo(halfW, bottom);
  target.lineTo(halfW, SPRING_Y);
  target.absarc(0, SPRING_Y, halfW, 0, Math.PI, false);
  target.lineTo(-halfW, bottom);
  return target;
}

function haloTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export function buildJukebox(): Jukebox {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const group = new THREE.Group();
  group.name = 'jukebox';

  const geo = <T extends THREE.BufferGeometry>(g: T): T => { geometries.push(g); return g; };
  const mat = <T extends THREE.Material>(m: T): T => { materials.push(m); return m; };
  const mesh = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh => {
    const o = new THREE.Mesh(geo(g), m);
    o.position.set(x, y, z);
    o.castShadow = shadow;
    o.receiveShadow = shadow;
    parent.add(o);
    return o;
  };

  // ---- materials ----
  const plum = mat(new THREE.MeshStandardMaterial({ color: 0x5b2a4f, roughness: 0.55, metalness: 0.05 }));
  const walnut = mat(new THREE.MeshStandardMaterial({ color: 0x6a3b24, roughness: 0.6 }));
  const cream = mat(new THREE.MeshStandardMaterial({ color: 0xf2e4c8, roughness: 0.5 }));
  const slatColor = mat(new THREE.MeshStandardMaterial({ color: 0xcdb892, roughness: 0.6 }));
  const dark = mat(new THREE.MeshStandardMaterial({ color: 0x1b1220, roughness: 0.8 }));
  // No environment map is guaranteed, so chrome is a bright, only partly metallic grey that still reads in plain light.
  const chrome = mat(new THREE.MeshStandardMaterial({ color: 0xe3e9ef, roughness: 0.25, metalness: 0.6 }));
  const lipMat = mat(new THREE.MeshStandardMaterial({ color: 0xd9566c, roughness: 0.3 }));

  // Neon tubes share one pulse and one glow control: each remembers its own base brightness.
  const neon: { m: THREE.MeshStandardMaterial; base: number }[] = [];
  const neonMat = (hex: number, base: number): THREE.MeshStandardMaterial => {
    const m = mat(new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: base, roughness: 0.4 }));
    neon.push({ m, base });
    return m;
  };
  const amber = neonMat(0xffb347, 1.6);
  const pink = neonMat(0xff5fa2, 1.6);
  const teal = neonMat(0x3fe6d0, 1.4);

  // ---- feet, base and body ----
  for (const [x, z] of [[-0.85, -0.4], [0.85, -0.4], [-0.85, 0.4], [0.85, 0.4]] as const) {
    mesh(group, new THREE.CylinderGeometry(0.1, 0.08, 0.15, 16), chrome, x, 0.075, z);
  }
  mesh(group, new THREE.BoxGeometry(2.2, 0.45, 1.2), walnut, 0, 0.375, 0);
  mesh(group, new THREE.BoxGeometry(2.0, 0.05, 0.02), chrome, 0, 0.3, 0.61);

  mesh(group, new THREE.BoxGeometry(2 * HALF_W, 0.9, DEPTH), plum, 0, 1.05, 0); // speaker section
  mesh(group, new THREE.BoxGeometry(2 * HALF_W, 0.45, DEPTH), plum, 0, 1.725, 0); // control strip
  mesh(group, new THREE.BoxGeometry(2 * HALF_W, 0.45, DEPTH), plum, 0, 2.175, 0); // below the arch

  // The arch cap: a half cylinder lying on its side. Its flat front and back caps become the arched faces.
  // theta runs pi/2..3pi/2 so that, after the 90 degree turn, the rounded half is the upper one.
  mesh(group, new THREE.CylinderGeometry(HALF_W, HALF_W, DEPTH, 48, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), plum, 0, SPRING_Y, 0);

  // Chrome bands between the sections, side strips and the arch rim.
  for (const y of [0.6, 1.5, 1.95]) mesh(group, new THREE.BoxGeometry(2 * HALF_W + 0.05, 0.04, DEPTH + 0.04), chrome, 0, y, 0);
  for (const s of [-1, 1]) mesh(group, new THREE.BoxGeometry(0.06, SPRING_Y - 0.6, DEPTH + 0.04), chrome, s * (HALF_W + 0.01), (SPRING_Y + 0.6) / 2, 0);
  for (const z of [FRONT + 0.005, -FRONT - 0.005]) {
    mesh(group, new THREE.TorusGeometry(HALF_W + 0.01, 0.045, 10, 64, Math.PI), chrome, 0, SPRING_Y, z);
  }
  mesh(group, new THREE.CylinderGeometry(0.05, 0.07, 0.1, 12), chrome, 0, SPRING_Y + HALF_W + 0.04, 0);
  neon.push({ m: mat(new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffd27a, emissiveIntensity: 1.8 })), base: 1.8 });
  mesh(group, new THREE.SphereGeometry(0.075, 16, 12), neon[neon.length - 1].m, 0, SPRING_Y + HALF_W + 0.15, 0, false);

  // ---- record window ----
  const frameShape = archPath(new THREE.Shape(), 0.86, WINDOW_BOTTOM - 0.06);
  frameShape.holes.push(archPath(new THREE.Path(), 0.78, WINDOW_BOTTOM));
  mesh(group, new THREE.ExtrudeGeometry(frameShape, { depth: 0.07, bevelEnabled: false, curveSegments: 32 }), chrome, 0, 0, FRONT);
  const interior = mat(new THREE.MeshStandardMaterial({ color: 0x2a1424, emissive: 0x7a3a1a, emissiveIntensity: 0.35, roughness: 0.9 }));
  mesh(group, new THREE.ShapeGeometry(archPath(new THREE.Shape(), 0.78, WINDOW_BOTTOM), 32), interior, 0, 0, FRONT + 0.006, false);

  // The record spins about the Z axis inside a pivot group; a cream notch on the label makes the spin visible.
  const record = new THREE.Group();
  record.position.set(0, 2.45, FRONT + 0.04);
  group.add(record);
  const vinyl = mat(new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.35, metalness: 0.2 }));
  const groove = mat(new THREE.MeshStandardMaterial({ color: 0x23232b, roughness: 0.3, metalness: 0.3 }));
  const labelMat = mat(new THREE.MeshStandardMaterial({ color: 0xe8794f, roughness: 0.5 }));
  mesh(record, new THREE.CylinderGeometry(0.5, 0.5, 0.03, 64).rotateX(Math.PI / 2), vinyl, 0, 0, 0, false);
  for (const [inner, outer] of [[0.22, 0.235], [0.3, 0.312], [0.4, 0.41]] as const) {
    mesh(record, new THREE.RingGeometry(inner, outer, 64), groove, 0, 0, 0.0155, false);
  }
  mesh(record, new THREE.CylinderGeometry(0.17, 0.17, 0.036, 48).rotateX(Math.PI / 2), labelMat, 0, 0, 0, false);
  mesh(record, new THREE.BoxGeometry(0.05, 0.1, 0.04), cream, 0, 0.09, 0, false);
  mesh(record, new THREE.CylinderGeometry(0.02, 0.02, 0.045, 12).rotateX(Math.PI / 2), chrome, 0, 0, 0, false);

  const glass = mat(new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false }));
  mesh(group, new THREE.ShapeGeometry(archPath(new THREE.Shape(), 0.78, WINDOW_BOTTOM), 32), glass, 0, 0, FRONT + 0.1, false);
  const streak = mat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }));
  const streakMesh = mesh(group, new THREE.PlaneGeometry(0.12, 0.9), streak, -0.35, 2.5, FRONT + 0.102, false);
  streakMesh.rotation.z = -0.45;

  // ---- neon trim: two arch tubes, side tubes, a line under the window ----
  mesh(group, new THREE.TorusGeometry(0.95, 0.03, 8, 64, Math.PI), amber, 0, SPRING_Y, FRONT + 0.015, false);
  mesh(group, new THREE.TorusGeometry(0.895, 0.02, 8, 64, Math.PI), pink, 0, SPRING_Y, FRONT + 0.015, false);
  const sideLength = SPRING_Y - 1.55;
  for (const s of [-1, 1]) {
    mesh(group, new THREE.CylinderGeometry(0.03, 0.03, sideLength, 8), amber, s * 0.95, 1.55 + sideLength / 2, FRONT + 0.015, false);
    mesh(group, new THREE.CylinderGeometry(0.02, 0.02, SPRING_Y - 1.9, 8), pink, s * 0.895, 1.9 + (SPRING_Y - 1.9) / 2, FRONT + 0.015, false);
  }
  mesh(group, new THREE.CylinderGeometry(0.02, 0.02, 1.79, 8).rotateZ(Math.PI / 2), pink, 0, 1.9, FRONT + 0.015, false);

  // ---- controls: selector buttons and a coin slot ----
  const buttonColors = [cream, amber, pink, teal];
  for (let i = 0; i < 8; i++) {
    mesh(group, new THREE.CylinderGeometry(0.055, 0.055, 0.05, 16).rotateX(Math.PI / 2), buttonColors[i % buttonColors.length], -0.82 + i * 0.17, 1.72, FRONT + 0.02, false);
  }
  mesh(group, new THREE.BoxGeometry(0.24, 0.34, 0.03), chrome, 0.78, 1.72, FRONT + 0.012);
  mesh(group, new THREE.BoxGeometry(0.03, 0.2, 0.035), dark, 0.78, 1.76, FRONT + 0.02, false);
  mesh(group, new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12).rotateX(Math.PI / 2), dark, 0.78, 1.6, FRONT + 0.02, false);

  // ---- speaker section: slats, an oval plate and the mouth ----
  const MOUTH_Y = 1.05;
  mesh(group, new THREE.BoxGeometry(1.84, 0.74, 0.02), dark, 0, MOUTH_Y, FRONT + 0.005);
  for (let i = 0; i < 9; i++) mesh(group, new THREE.BoxGeometry(1.8, 0.035, 0.03), slatColor, 0, 0.72 + i * 0.0825, FRONT + 0.025, false);
  const plate = mesh(group, new THREE.CylinderGeometry(1, 1, 0.04, 48).rotateX(Math.PI / 2), mat(new THREE.MeshStandardMaterial({ color: 0x2a1226, roughness: 0.7 })), 0, MOUTH_Y, FRONT + 0.06);
  plate.scale.set(0.72, 0.34, 1);
  const rimPoints: THREE.Vector3[] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    rimPoints.push(new THREE.Vector3(Math.cos(a) * 0.78, Math.sin(a) * 0.4, 0));
  }
  mesh(group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPoints, true), 64, 0.011, 8, true), neonMat(0x2a9d90, 0.6), 0, MOUTH_Y, FRONT + 0.075, false);

  // The mouth: an upper and a lower lip made of squashed spheres (a dip in the middle gives the upper lip its shape),
  // over a dark glowing opening that only shows as the lips part.
  const mouth = new THREE.Group();
  mouth.position.set(0, MOUTH_Y, FRONT + 0.1);
  group.add(mouth);
  const upper = new THREE.Group();
  const lower = new THREE.Group();
  mouth.add(upper, lower);
  const lipPiece = (parent: THREE.Group, sx: number, sy: number, sz: number, x: number, y: number, tilt = 0) => {
    const m = mesh(parent, new THREE.SphereGeometry(1, 24, 16), lipMat, x, y, 0);
    m.scale.set(sx, sy, sz);
    m.rotation.z = tilt;
    return m;
  };
  lipPiece(upper, 0.27, 0.05, 0.05, -0.2, 0.03, -0.12);
  lipPiece(upper, 0.27, 0.05, 0.05, 0.2, 0.03, 0.12);
  lipPiece(upper, 0.1, 0.05, 0.05, 0, 0.042);
  lipPiece(lower, 0.5, 0.06, 0.055, 0, -0.035);
  lipPiece(lower, 0.14, 0.045, 0.045, -0.44, -0.012, 0.15);
  lipPiece(lower, 0.14, 0.045, 0.045, 0.44, -0.012, -0.15);
  const inside = mat(new THREE.MeshStandardMaterial({ color: 0x1a0508, emissive: 0xff5a3c, emissiveIntensity: 0.7 }));
  const opening = mesh(mouth, new THREE.CircleGeometry(1, 40), inside, 0, 0, -0.06, false);
  opening.scale.set(0.42, 0.001, 1);

  // ---- halo: a soft additive glow behind the jukebox so it reads as magical from a distance ----
  const halo = haloTexture();
  textures.push(halo);
  const haloMat = mat(new THREE.MeshBasicMaterial({ color: 0xffb46b, map: halo, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  const haloMesh = mesh(group, new THREE.PlaneGeometry(4.6, 4.8), haloMat, 0, 2.0, -0.4, false);
  haloMesh.raycast = () => {};

  // ---- state ----
  let mouthTarget = 0;
  let mouthNow = 0;
  let glowAmount = 0.6;

  const applyMouth = () => {
    const gap = 0.1 * mouthNow;
    upper.position.y = gap;
    lower.position.y = -gap;
    upper.rotation.x = -0.2 * mouthNow;
    opening.scale.y = 0.001 + (0.02 + gap) * 0.95;
    opening.visible = mouthNow > 0.01;
  };
  const applyGlow = (pulse: number) => {
    const k = (0.35 + 1.65 * glowAmount) * pulse;
    for (const n of neon) n.m.emissiveIntensity = n.base * k;
    haloMat.opacity = (0.08 + 0.42 * glowAmount) * pulse;
  };
  applyMouth();
  applyGlow(1);

  return {
    group,
    update(t, dt) {
      record.rotation.z -= dt * 1.2;
      mouthNow += (mouthTarget - mouthNow) * (1 - Math.exp(-9 * dt));
      applyMouth();
      applyGlow(1 + 0.08 * Math.sin(t * 2.2));
    },
    setMouthOpen(amount) { mouthTarget = clamp01(amount); },
    setGlow(amount) { glowAmount = clamp01(amount); },
    hit(raycaster) {
      if (!group.visible) return null;
      return raycaster.intersectObject(group, true)[0]?.distance ?? null;
    },
    setOpacity(amount) {
      const a = clamp01(amount);
      for (const m of materials) {
        if (m.userData.baseOpacity === undefined) {
          m.userData.baseOpacity = m.opacity;
          m.userData.baseTransparent = m.transparent;
        }
        m.opacity = (m.userData.baseOpacity as number) * a;
        m.transparent = a < 1 || Boolean(m.userData.baseTransparent);
        m.needsUpdate = true;
      }
    },
    dispose() {
      group.removeFromParent();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}
