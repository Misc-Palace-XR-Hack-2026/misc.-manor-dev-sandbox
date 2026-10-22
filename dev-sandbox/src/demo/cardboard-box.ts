import * as THREE from 'three';

// An open cardboard box full of packing stuffing (the Unpacking look). Its contents are hidden: whoever owns it
// decides what comes out. The stuffing sits in layers and one layer clears per object taken out. Reusable for any
// "box of objects" (the tutorial's starters now, random drops later).

export interface CardboardBox {
  group: THREE.Group;
  /** True when the ray hits the box or its stuffing. */
  hit(raycaster: THREE.Raycaster): boolean;
  /** How many layers of stuffing are left (0 = empty). Animates. */
  setFill(level: number): void;
  /** A quick squash, as something comes out. */
  pop(): void;
  /** Shrink and sink away, then hide. */
  vanish(): void;
  /** Idle wiggle that invites a tap. */
  cue(on: boolean): void;
  update(t: number, dt: number): void;
}

const W = 0.9, D = 0.7, H = 0.5, T = 0.03, FLAP = 0.26;
const CARDBOARD = 0xc49a6c, INSIDE = 0x9c7449, TAPE = 0xd8c39a;
const PAPER = [0xf1ead9, 0xe4d6b8, 0xd2bd93, 0xf6f1e6];

const mat = (color: number, flat = false) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, flatShading: flat });

function panel(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A flap hinged on a top edge, folded open: `out` is the unit x or z direction away from the box. */
function flap(length: number, x: number, z: number, out: { x: number; z: number }, angle: number): THREE.Group {
  const hinge = new THREE.Group();
  hinge.position.set(x, H, z);
  const along = out.x ? D : W;
  hinge.add(panel(out.x ? length : along, T, out.x ? along : length, CARDBOARD, out.x * length / 2, 0, out.z * length / 2));
  // `angle` lifts the flap above horizontal, still leaning out.
  if (out.x) hinge.rotation.z = out.x * angle;
  else hinge.rotation.x = -out.z * angle;
  return hinge;
}

function stuffingLayer(index: number, layers: number, seed: number): THREE.Group {
  const layer = new THREE.Group();
  const band = (H - 0.04) / layers;
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const count = 14;
  for (let i = 0; i < count; i++) {
    const r = 0.06 + rand() * 0.05;
    const piece = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat(PAPER[Math.floor(rand() * PAPER.length)], true));
    piece.position.set((rand() - 0.5) * (W - 2 * T - r), 0.03 + band * (index + 0.35 + rand() * 0.6), (rand() - 0.5) * (D - 2 * T - r));
    piece.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    piece.scale.set(1, 0.6 + rand() * 0.3, 1);
    piece.castShadow = true;
    layer.add(piece);
  }
  return layer;
}

export function buildCardboardBox(layers = 3): CardboardBox {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const group = new THREE.Group();
  group.name = 'cardboard-box';
  const body = new THREE.Group();
  group.add(body);

  body.add(
    panel(W, T, D, INSIDE, 0, T / 2, 0),
    panel(W, H, T, CARDBOARD, 0, H / 2, D / 2 - T / 2),
    panel(W, H, T, CARDBOARD, 0, H / 2, -D / 2 + T / 2),
    panel(T, H, D - 2 * T, CARDBOARD, W / 2 - T / 2, H / 2, 0),
    panel(T, H, D - 2 * T, CARDBOARD, -W / 2 + T / 2, H / 2, 0),
    panel(0.08, H * 0.5, 0.004, TAPE, 0, H * 0.75, D / 2 + 0.002),
    flap(FLAP, 0, D / 2, { x: 0, z: 1 }, Math.PI * 0.2),
    flap(FLAP, 0, -D / 2, { x: 0, z: -1 }, Math.PI * 0.3),
    flap(FLAP * 0.9, W / 2, 0, { x: 1, z: 0 }, Math.PI * 0.24),
    flap(FLAP * 0.9, -W / 2, 0, { x: -1, z: 0 }, Math.PI * 0.27),
  );

  const stuffing = Array.from({ length: layers }, (_, i) => stuffingLayer(i, layers, 7 + i * 131));
  body.add(...stuffing);
  const shown = stuffing.map(() => 1);
  let fill = layers;
  let cueing = false;
  let popAt = -Infinity;
  let vanishAt = -Infinity;
  let now = 0;

  return {
    group,
    hit(raycaster) {
      return group.visible && raycaster.intersectObject(group, true).length > 0;
    },
    setFill(level) {
      fill = Math.max(0, Math.min(layers, Math.round(level)));
      if (reduced) stuffing.forEach((l, i) => { shown[i] = i < fill ? 1 : 0; l.scale.setScalar(shown[i]); l.visible = shown[i] > 0; });
    },
    pop() { popAt = now; },
    vanish() {
      if (vanishAt !== -Infinity) return;
      vanishAt = now;
      if (reduced) group.visible = false;
    },
    cue(on) { cueing = on; },
    update(t, dt) {
      now = t;
      stuffing.forEach((layer, i) => {
        const target = i < fill ? 1 : 0;
        shown[i] += (target - shown[i]) * Math.min(1, dt * 10);
        if (Math.abs(target - shown[i]) < 0.01) shown[i] = target;
        layer.scale.setScalar(Math.max(0.001, shown[i]));
        layer.visible = shown[i] > 0;
      });
      if (reduced) return;

      // Every 2.6s a short wiggle, like something inside is shuffling.
      const phase = t % 2.6;
      body.rotation.z = cueing && phase < 0.5 ? Math.sin(phase * Math.PI * 8) * 0.05 * (1 - phase / 0.5) : 0;

      const p = t - popAt;
      const squash = p >= 0 && p < 0.35 ? Math.sin((p / 0.35) * Math.PI) * 0.12 : 0;
      body.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);

      if (vanishAt !== -Infinity) {
        const v = Math.min(1, (t - vanishAt) / 0.5);
        const k = v * v * (3 - 2 * v);
        group.scale.setScalar(Math.max(0.001, 1 - k));
        group.position.y = -0.2 * k;
        if (v >= 1) group.visible = false;
      }
    },
  };
}
