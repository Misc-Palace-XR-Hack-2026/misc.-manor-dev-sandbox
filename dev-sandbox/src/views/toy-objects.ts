import * as THREE from 'three';
import { glowIndicator, budgetedLight, pulseBudgetedLight } from './glow';

// Toys, curios and desk clutter: base-centered (origin = middle of the footprint on the floor), +Z faces the camera.
// Everything is plain primitives with per-build materials, no textures and no DOM, so these build anywhere.
// Layered decals are offset from the surface under them so no two same-facing faces share a plane.

type Extra = THREE.MeshStandardMaterialParameters;
const std = (color: number, extra: Extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, ...extra });
const GLASS: Extra = { transparent: true, opacity: 0.3, roughness: 0.1, depthWrite: false };

function mesh(name: string, geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, extra?: Extra): THREE.Mesh {
  const m = new THREE.Mesh(geo, std(color, extra));
  m.name = name;
  m.position.set(x, y, z);
  return m;
}

/** Box by CENTER. */
const bx = (name: string, w: number, h: number, d: number, color: number, x: number, y: number, z: number, extra?: Extra) =>
  mesh(name, new THREE.BoxGeometry(w, h, d), color, x, y, z, extra);

/** Sphere by center, optionally squashed per axis. */
function sph(name: string, r: number, color: number, x: number, y: number, z: number,
  scale: [number, number, number] = [1, 1, 1], extra?: Extra, segs: [number, number] = [12, 8]): THREE.Mesh {
  const m = mesh(name, new THREE.SphereGeometry(r, segs[0], segs[1]), color, x, y, z, extra);
  m.scale.set(...scale);
  return m;
}

/** Cylinder / frustum by CENTER whose length runs along the given axis (+axis is the "top" radius). */
function cyl(name: string, rTop: number, rBottom: number, h: number, color: number, x: number, y: number, z: number,
  axis: 'x' | 'y' | 'z' = 'y', extra?: Extra, segs = 20): THREE.Mesh {
  const m = mesh(name, new THREE.CylinderGeometry(rTop, rBottom, h, segs), color, x, y, z, extra);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  if (axis === 'x') m.rotation.z = -Math.PI / 2;
  return m;
}

/** Flat plate with semicircular ends ("stadium"), `straight` long between the cap centres, `w` wide,
 *  extruded `depth` along +Z from `zBack`. One mesh, so no cap face shares a plane with a body face. */
function stadium(name: string, w: number, straight: number, depth: number, color: number,
  x: number, y: number, zBack: number, extra?: Extra): THREE.Mesh {
  const r = w / 2, h = straight / 2;
  const s = new THREE.Shape();
  s.moveTo(r, h);
  s.absarc(0, h, r, 0, Math.PI, false);
  s.lineTo(-r, -h);
  s.absarc(0, -h, r, Math.PI, Math.PI * 2, false);
  s.closePath();
  return mesh(name, new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 12 }), color, x, y, zBack, extra);
}

/** Turn a +Y-built part so its +Y points along `normal`. */
function orient(part: THREE.Object3D, normal: THREE.Vector3): void {
  part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize());
}

// ---- individual objects ----------------------------------------------------

function fishBowl(): THREE.Object3D[] {
  const cy = 0.24;
  const parts: THREE.Object3D[] = [
    cyl('fishbowl-stand', 0.1, 0.11, 0.045, 0x8a5a36, 0, 0.0225, 0),
    sph('fishbowl-glass', 0.2, 0xcfeaf2, 0, cy, 0, [1, 1, 1], GLASS, [20, 14]),
  ];
  // Water: a sphere with its top cut off at ~62% of the radius, closed by a flat surface disc.
  const water = new THREE.Mesh(
    new THREE.SphereGeometry(0.185, 18, 12, 0, Math.PI * 2, 0.9, Math.PI - 0.9),
    std(0x5fc3e8, { transparent: true, opacity: 0.5, depthWrite: false, roughness: 0.15 }),
  );
  water.name = 'fishbowl-water';
  water.position.set(0, cy, 0);
  const surface = new THREE.Mesh(
    new THREE.CircleGeometry(0.185 * Math.sin(0.9), 18),
    std(0x8fdcf5, { transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.1 }),
  );
  surface.name = 'fishbowl-surface';
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(0, cy + 0.185 * Math.cos(0.9), 0);
  parts.push(water, surface);

  // Goldfish, nose toward +X.
  const orange = 0xf28a2e;
  const fish = new THREE.Group();
  fish.name = 'fishbowl-fish';
  fish.position.set(0, 0.255, 0.01);
  fish.rotation.y = -0.5;
  fish.add(
    sph('fish-body', 0.036, orange, 0, 0, 0, [1.7, 1, 0.7]),
    (() => {
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.06, 4), std(0xff9d4a));
      tail.name = 'fish-tail';
      tail.rotation.z = -Math.PI / 2; // narrow attachment toward +X, fan trails behind
      tail.scale.set(1, 1, 0.35);
      tail.position.set(-0.085, 0, 0);
      return tail;
    })(),
    (() => {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.04, 4), std(0xff9d4a));
      fin.name = 'fish-fin';
      fin.scale.set(1, 1, 0.35);
      fin.position.set(-0.01, 0.04, 0);
      return fin;
    })(),
    sph('fish-eye-l', 0.008, 0x1d1d22, 0.05, 0.01, 0.022, [1, 1, 1], undefined, [8, 6]),
    sph('fish-eye-r', 0.008, 0x1d1d22, 0.05, 0.01, -0.022, [1, 1, 1], undefined, [8, 6]),
  );
  // Swims a closed Lissajous loop well inside the water sphere, nose always along the path. The amplitudes
  // leave the fish's 0.12 m reach clear of the 0.185 m water radius and keep the dorsal fin under the surface.
  fish.userData.animate = (t: number) => {
    const x = 0.035 * Math.cos(t * 0.45), z = 0.03 * Math.sin(t * 0.57);
    fish.position.set(x, 0.25 + 0.018 * Math.sin(t * 0.31), z);
    fish.rotation.y = Math.atan2(-0.03 * 0.57 * Math.cos(t * 0.57), -0.035 * 0.45 * Math.sin(t * 0.45));
  };
  parts.push(fish);

  // Weed and pebbles on the bottom.
  const weed = (name: string, x: number, z: number, tilt: number, h: number) => {
    const w = bx(name, 0.012, h, 0.012, 0x3fa05a, x, 0.07 + h / 2, z);
    w.rotation.z = tilt;
    return w;
  };
  parts.push(weed('fishbowl-weed-a', -0.06, -0.04, 0.12, 0.1), weed('fishbowl-weed-b', 0.065, 0.05, -0.15, 0.085));
  const pebbleColors = [0xe85d75, 0xf2c94c, 0x7a5cc8, 0x4cc2b0, 0xf2f0e6, 0xff8a3d];
  pebbleColors.forEach((c, i) => {
    const a = (i / pebbleColors.length) * Math.PI * 2;
    parts.push(sph(`fishbowl-pebble-${i}`, 0.014, c, Math.cos(a) * 0.045, 0.072, Math.sin(a) * 0.045, [1, 0.8, 1], undefined, [8, 6]));
  });
  return parts;
}

function yoyo(): THREE.Object3D[] {
  const cy = 0.125;
  const red = 0xd9382f;
  return [
    // Two flared halves standing on their rim, wide ends outward (the front half's wide end is +Z).
    cyl('yoyo-front', 0.125, 0.04, 0.055, red, 0, cy, 0.04, 'z'),
    cyl('yoyo-back', 0.04, 0.125, 0.055, red, 0, cy, -0.04, 'z'),
    cyl('yoyo-front-ring', 0.082, 0.082, 0.004, 0xf6d14a, 0, cy, 0.0695, 'z'),
    cyl('yoyo-front-star', 0.05, 0.05, 0.004, 0x2f6fd6, 0, cy, 0.0735, 'z'),
    cyl('yoyo-axle', 0.018, 0.018, 0.14, 0xc6a264, 0, cy, 0, 'z', undefined, 12),
    // String hanging from the hub, running across the floor to a loop. The two runs meet end to end at
    // y = 0.011 / z = 0.003 instead of crossing, so their side faces never share a plane and z-fight.
    bx('yoyo-string-down', 0.006, cy - 0.0135, 0.006, 0xf1e6cf, 0, (cy + 0.0085) / 2, 0),
    bx('yoyo-string-floor', 0.006, 0.006, 0.12, 0xf1e6cf, 0, 0.008, 0.063),
    (() => {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 14), std(0xf1e6cf));
      loop.name = 'yoyo-loop';
      loop.rotation.x = Math.PI / 2;
      loop.position.set(0, 0.008, 0.15);
      return loop;
    })(),
  ];
}

function skateboard(): THREE.Object3D[] {
  // Stands on its tail in a little rack with the BOTTOM facing the camera, so the graphic and trucks show.
  const L = 0.35, W = 0.15, yc = 0.29;
  const parts: THREE.Object3D[] = [
    bx('skate-rack-base', 0.2, 0.04, 0.16, 0x8a5a36, 0, 0.02, 0),
    bx('skate-rack-front', 0.17, 0.07, 0.016, 0x9b6a42, 0, 0.075, 0.0205),
    bx('skate-rack-back', 0.17, 0.07, 0.016, 0x9b6a42, 0, 0.075, -0.0195),
    // Deck and grip tape: one rounded-end (stadium) outline each, extruded. A rectangle plus two discs
    // would put a disc face in the same plane as the deck face and z-fight across the overlap.
    stadium('skate-deck', W, L, 0.016, 0x1b9a9a, 0, yc, -0.008),
    stadium('skate-grip', W, L, 0.003, 0x1e1e22, 0, yc, -0.011),
    // The graphic: a sunset, stripes and diamonds, each layer a hair above the last.
    cyl('skate-art-sun-1', 0.062, 0.062, 0.002, 0xf6d14a, 0, 0.3, 0.009, 'z'),
    cyl('skate-art-sun-2', 0.046, 0.046, 0.002, 0xff8a3d, 0, 0.3, 0.011, 'z'),
    cyl('skate-art-sun-3', 0.03, 0.03, 0.002, 0xe8384f, 0, 0.3, 0.013, 'z'),
    cyl('skate-art-sun-4', 0.014, 0.014, 0.002, 0xb02fd0, 0, 0.3, 0.015, 'z'),
    bx('skate-art-stripe-a', W, 0.022, 0.002, 0xff4f9a, 0, 0.17, 0.009),
    bx('skate-art-stripe-b', W, 0.022, 0.002, 0x3fd0e0, 0, 0.196, 0.009),
    bx('skate-art-stripe-c', W, 0.022, 0.002, 0xb8e04a, 0, 0.222, 0.009),
  ];
  // Spaced wider than one diamond's diagonal (0.0453) so the rotated corners never overlap.
  [[-0.05, 0xffffff], [0, 0xff4f9a], [0.05, 0xf6d14a]].forEach(([x, c], i) => {
    const d = bx(`skate-art-diamond-${i}`, 0.032, 0.032, 0.002, c as number, x as number, 0.415, 0.009);
    d.rotation.z = Math.PI / 4;
    parts.push(d);
  });
  // Trucks and wheels under (in front of) the deck.
  for (const [name, y] of [['lo', 0.135], ['hi', 0.445]] as const) {
    parts.push(
      bx(`skate-truck-plate-${name}`, 0.06, 0.045, 0.005, 0xb9c0c8, 0, y, 0.0105),
      bx(`skate-truck-support-${name}`, 0.024, 0.024, 0.035, 0xb9c0c8, 0, y, 0.028),
      bx(`skate-truck-hanger-${name}`, 0.14, 0.016, 0.016, 0xb9c0c8, 0, y, 0.045),
      cyl(`skate-wheel-${name}-l`, 0.028, 0.028, 0.02, 0xff8a3d, -0.068, y, 0.045, 'x', undefined, 14),
      cyl(`skate-wheel-${name}-r`, 0.028, 0.028, 0.02, 0xff8a3d, 0.068, y, 0.045, 'x', undefined, 14),
    );
  }
  return parts;
}

function soccerBall(): THREE.Object3D[] {
  const r = 0.16;
  const parts: THREE.Object3D[] = [];
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), std(0xf4f4ef, { flatShading: true }));
  ball.name = 'soccer-ball';
  ball.position.set(0, r, 0);
  parts.push(ball);
  // Black pentagons sit on the 12 icosahedron corners, exactly where a real ball has them.
  const phi = (1 + Math.sqrt(5)) / 2;
  const dirs: THREE.Vector3[] = [];
  for (const a of [-1, 1]) for (const b of [-phi, phi]) {
    dirs.push(new THREE.Vector3(0, a, b), new THREE.Vector3(a, b, 0), new THREE.Vector3(b, 0, a));
  }
  dirs.forEach((d, i) => {
    const n = d.clone().normalize();
    const patch = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.01, 5), std(0x1c1c20, { flatShading: true }));
    patch.name = `soccer-patch-${i}`;
    orient(patch, n);
    patch.position.copy(n).multiplyScalar(r - 0.003).add(new THREE.Vector3(0, r, 0));
    parts.push(patch);
  });
  return parts;
}

function flyingSaucer(): THREE.Object3D[] {
  const profile = [[0, 0.03], [0.07, 0.025], [0.16, 0.04], [0.2, 0.062], [0.16, 0.082], [0.08, 0.095], [0, 0.1]];
  const hull = new THREE.Mesh(
    new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 20),
    std(0xaab4be, { metalness: 0.35, roughness: 0.4, side: THREE.DoubleSide }),
  );
  hull.name = 'saucer-hull';
  const parts: THREE.Object3D[] = [hull];
  // Glass dome with a small green pilot.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    std(0x9ff0ff, { transparent: true, opacity: 0.4, roughness: 0.1, depthWrite: false }),
  );
  dome.name = 'saucer-dome';
  dome.position.set(0, 0.092, 0);
  parts.push(dome);
  parts.push(
    sph('saucer-pilot-head', 0.03, 0x6fdc6f, 0, 0.12, 0, [1, 1.2, 1]),
    sph('saucer-pilot-eye-l', 0.008, 0x14141a, -0.012, 0.128, 0.026, [1, 1.5, 0.5], undefined, [8, 6]),
    sph('saucer-pilot-eye-r', 0.008, 0x14141a, 0.012, 0.128, 0.026, [1, 1.5, 0.5], undefined, [8, 6]),
  );
  // Rim lights: a chase around the ring, each lamp one tenth of a cycle behind the last.
  const lightColors = [0xffe14a, 0xff5fa8];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const c = lightColors[i % 2];
    const bulb = sph(`saucer-light-${i}`, 0.012, c, Math.cos(a) * 0.19, 0.062, Math.sin(a) * 0.19, [1, 1, 1],
      { emissive: new THREE.Color(c), emissiveIntensity: 0.7 }, [8, 6]);
    parts.push(glowIndicator(bulb, { color: c, base: 0.35, amp: 1.5, speed: 0.55, phase: -i / 10, wave: 'blink' }));
  }
  // Three landing legs.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const dx = Math.cos(a), dz = Math.sin(a);
    const from = new THREE.Vector3(dx * 0.09, 0.034, dz * 0.09);
    const to = new THREE.Vector3(dx * 0.14, 0.008, dz * 0.14);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, from.distanceTo(to), 8), std(0x6f737a));
    leg.name = `saucer-leg-${i}`;
    leg.position.copy(from).add(to).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(to).normalize());
    parts.push(leg, bx(`saucer-foot-${i}`, 0.034, 0.008, 0.034, 0x4a4d54, to.x, 0.004, to.z));
  }
  return parts;
}

function lavaLamp(): THREE.Object3D[] {
  // depthWrite:false so the wax behind this shell is never depth-culled as the blobs move.
  const glow: Extra = { transparent: true, opacity: 0.8, depthWrite: false, emissive: new THREE.Color(0xff4f8a), emissiveIntensity: 0.55 };
  // The vessel is a frustum from r 0.07 at y 0.1 to r 0.035 at y 0.37. Each blob's rise is capped so its
  // whole silhouette stays inside that cone at the TOP of its travel, where the glass is narrowest.
  const wax = (name: string, r: number, midY: number, riseY: number, xMid: number, xSway: number, speed: number, phase: number) => {
    const m = sph(name, r, 0xffa63a, xMid, midY, 0, [1, 1.25, 1],
      { emissive: new THREE.Color(0xff8a1a), emissiveIntensity: 0.8 }, [10, 8]);
    const mat = m.material as THREE.MeshStandardMaterial;
    // One animate per blob: it both moves the wax and breathes its glow, so there is no second
    // traversal and no per-frame allocation.
    m.userData.animate = (t: number) => {
      m.position.set(xMid + xSway * Math.sin(t * speed * 1.7 + phase), midY + riseY * Math.sin(t * speed + phase), 0);
      mat.emissiveIntensity = 0.75 + 0.55 * (0.5 + 0.5 * Math.sin(t * speed * 0.9 + phase));
    };
    m.userData.animate(0);
    return m;
  };
  // A real, moody pool of light in the wax column. It joins the existing lamp-light budget, so a
  // room full of lava lamps and table lamps still only ever lights LAMP_LIGHT.maxCount of them.
  const light = budgetedLight(0xff5f7a, 0.5, 2.2);
  light.position.set(0, 0.24, 0);
  pulseBudgetedLight(light, { base: 0.34, amp: 0.3, speed: 0.11, wave: 'sine' });
  return [
    cyl('lava-base', 0.05, 0.09, 0.11, 0xd9382f, 0, 0.055, 0),
    cyl('lava-glass', 0.035, 0.07, 0.27, 0xff7aa8, 0, 0.235, 0, 'y', glow),
    wax('lava-blob-a', 0.035, 0.195, 0.045, -0.004, 0.004, 0.21, 0),
    wax('lava-blob-b', 0.028, 0.235, 0.065, 0.004, 0.003, 0.29, 1.9),
    wax('lava-blob-c', 0.02, 0.27, 0.07, -0.004, 0.004, 0.37, 3.6),
    cyl('lava-cap', 0.012, 0.04, 0.07, 0xd9382f, 0, 0.405, 0),
    sph('lava-finial', 0.016, 0xc6a264, 0, 0.45, 0, [1, 1, 1], undefined, [10, 8]),
    light,
  ];
}

function rubiksCube(): THREE.Object3D[] {
  const s = 0.06, pitch = 0.064, half = s / 2;
  const body = std(0x17171a, { roughness: 0.55 });
  const faceColors = {
    px: std(0xd9382f), nx: std(0xff8a3d), py: std(0xf4f4ef), ny: std(0xf6d14a), pz: std(0x2f6fd6), nz: std(0x2fa84f),
  };
  const sticker = new THREE.BoxGeometry(s - 0.01, s - 0.01, 0.004);
  const cube = new THREE.Group();
  cube.name = 'cube-root';
  cube.rotation.y = 0.5;
  const topLayer = new THREE.Group();
  topLayer.name = 'cube-top-layer';
  topLayer.rotation.y = 0.45; // mid-turn, mid-solve
  topLayer.position.y = 0.1 + pitch * 1.5 - 0.0; // pivot at the layer's height (cubies are placed relative to it below)
  for (let ix = -1; ix <= 1; ix++) for (let iy = -1; iy <= 1; iy++) for (let iz = -1; iz <= 1; iz++) {
    const cubie = new THREE.Group();
    cubie.add(new THREE.Mesh(new THREE.BoxGeometry(s, s, s), body));
    const add = (key: keyof typeof faceColors, nx: number, ny: number, nz: number) => {
      const m = new THREE.Mesh(sticker, faceColors[key]);
      m.name = `cube-sticker-${key}`;
      m.position.set(nx * (half + 0.0021), ny * (half + 0.0021), nz * (half + 0.0021));
      if (nx) m.rotation.y = Math.PI / 2;
      if (ny) m.rotation.x = Math.PI / 2;
      cubie.add(m);
    };
    if (ix === 1) add('px', 1, 0, 0);
    if (ix === -1) add('nx', -1, 0, 0);
    if (iy === 1) add('py', 0, 1, 0);
    if (iy === -1) add('ny', 0, -1, 0);
    if (iz === 1) add('pz', 0, 0, 1);
    if (iz === -1) add('nz', 0, 0, -1);
    cubie.name = `cube-cubie-${ix}-${iy}-${iz}`;
    if (iy === 1) {
      cubie.position.set(ix * pitch, 0, iz * pitch);
      topLayer.add(cubie);
    } else {
      cubie.position.set(ix * pitch, 0.1 + iy * pitch, iz * pitch);
      cube.add(cubie);
    }
  }
  topLayer.position.set(0, 0.1 + pitch, 0);
  cube.add(topLayer);
  return [cube];
}

function rubberDuck(): THREE.Object3D[] {
  const yellow = 0xffd23a;
  return [
    sph('duck-body', 0.1, yellow, 0, 0.085, 0, [1, 0.8, 1.25]),
    sph('duck-tail', 0.04, yellow, 0, 0.13, -0.12, [1, 1.1, 1]),
    sph('duck-head', 0.068, yellow, 0, 0.2, 0.075),
    bx('duck-beak', 0.05, 0.018, 0.045, 0xff8a1f, 0, 0.19, 0.14),
    sph('duck-eye-l', 0.01, 0x1d1d22, -0.036, 0.215, 0.12, [1, 1, 1], undefined, [8, 6]),
    sph('duck-eye-r', 0.01, 0x1d1d22, 0.036, 0.215, 0.12, [1, 1, 1], undefined, [8, 6]),
    sph('duck-wing-l', 0.05, 0xf2b705, -0.098, 0.1, -0.01, [0.35, 0.6, 1]),
    sph('duck-wing-r', 0.05, 0xf2b705, 0.098, 0.1, -0.01, [0.35, 0.6, 1]),
  ];
}

// Coarse continent outlines as closed [lon, lat] degree rings, west-to-east. They are filled on a
// latitude/longitude cell grid (below) rather than triangulated directly, so every land vertex lands
// exactly on the sphere instead of chording through the ocean shell.
const CONTINENTS: Record<string, Array<[number, number]>> = {
  africa: [[-6, 36], [10, 37], [33, 31], [43, 12], [51, 12], [41, -2], [40, -15], [35, -24], [20, -35],
    [14, -23], [12, -5], [9, 4], [-5, 5], [-17, 15], [-13, 28]],
  eurasia: [[-9, 38], [-9, 43], [-2, 48], [4, 52], [8, 55], [18, 59], [30, 60], [28, 70], [40, 68], [60, 70],
    [80, 74], [105, 77], [130, 73], [160, 70], [180, 66], [170, 60], [160, 58], [142, 54], [135, 44], [127, 38],
    [122, 31], [110, 21], [105, 10], [100, 7], [97, 16], [90, 22], [80, 8], [72, 21], [62, 25], [57, 25],
    [48, 30], [56, 25], [52, 15], [43, 13], [38, 22], [34, 29], [36, 36], [27, 40], [23, 40], [19, 42],
    [13, 45], [3, 43], [-3, 36]],
  northAmerica: [[-168, 65], [-165, 71], [-130, 70], [-95, 68], [-80, 62], [-64, 60], [-56, 51], [-66, 44],
    [-75, 36], [-81, 25], [-91, 29], [-97, 26], [-95, 18], [-88, 15], [-83, 9], [-92, 15], [-105, 20],
    [-110, 25], [-117, 32], [-124, 40], [-124, 48], [-135, 57], [-150, 59], [-165, 60]],
  southAmerica: [[-77, 8], [-60, 10], [-50, 0], [-35, -6], [-39, -18], [-48, -25], [-58, -35], [-62, -40],
    [-65, -50], [-68, -55], [-75, -50], [-73, -40], [-71, -30], [-70, -18], [-75, -10], [-80, -4], [-79, 2]],
  australia: [[113, -22], [114, -34], [129, -32], [138, -35], [146, -39], [151, -34], [153, -27], [145, -15],
    [136, -12], [130, -11], [125, -14], [118, -20]],
  greenland: [[-45, 60], [-20, 70], [-20, 76], [-30, 82], [-55, 82], [-70, 78], [-55, 68]],
  antarctica: [[-180, -90], [180, -90], [180, -70], [-180, -70]],
  antarcticPeninsula: [[-62, -63], [-55, -64], [-58, -72], [-66, -72]],
  madagascar: [[44, -16], [50, -16], [48, -25], [44, -22]],
};

/** Even-odd point-in-ring test in flat lon/lat degrees. */
function inRing(ring: Array<[number, number]>, lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < xi + ((lat - yi) / (yj - yi)) * (xj - xi)) inside = !inside;
  }
  return inside;
}

/** One mesh per landmass: every filled grid cell becomes two outward-wound triangles on radius `r`. */
function landShell(r: number): THREE.Mesh[] {
  const CELL = 5;
  const point = (lon: number, lat: number, out: number[]) => {
    const a = (lat * Math.PI) / 180, b = (lon * Math.PI) / 180, c = Math.cos(a) * r;
    out.push(c * Math.cos(b), Math.sin(a) * r, c * Math.sin(b));
  };
  return Object.entries(CONTINENTS).map(([name, ring]) => {
    const verts: number[] = [];
    for (let lat = -90; lat < 90; lat += CELL) {
      for (let lon = -180; lon < 180; lon += CELL) {
        if (!inRing(ring, lon + CELL / 2, lat + CELL / 2)) continue;
        const a: number[] = [], b: number[] = [], c: number[] = [], d: number[] = [];
        point(lon, lat, a); point(lon + CELL, lat, b); point(lon + CELL, lat + CELL, c); point(lon, lat + CELL, d);
        verts.push(...a, ...c, ...b, ...a, ...d, ...c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, std(0x4f9d58, { roughness: 0.85 }));
    m.name = `globe-land-${name}`;
    return m;
  });
}

function globe(): THREE.Object3D[] {
  const tilt = new THREE.Group();
  tilt.name = 'globe-tilt';
  tilt.position.set(0, 0.25, 0);
  tilt.rotation.z = 0.4;
  tilt.add(
    // Enough segments that the faceted ocean never sags below the land shell draped 1.8 mm above it.
    sph('globe-ocean', 0.13, 0x3a7fc4, 0, 0, 0, [1, 1, 1], undefined, [48, 32]),
    (() => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.147, 0.007, 6, 24, Math.PI), std(0xc6a264));
      m.name = 'globe-meridian';
      m.rotation.z = Math.PI / 2;
      return m;
    })(),
    bx('globe-axis', 0.012, 0.33, 0.012, 0xc6a264, 0, 0, 0),
  );
  tilt.add(...landShell(0.1318));
  return [
    cyl('globe-base', 0.07, 0.085, 0.035, 0x6f4a2d, 0, 0.0175, 0),
    cyl('globe-stem', 0.012, 0.012, 0.05, 0xc6a264, 0, 0.06, 0),
    tilt,
  ];
}

function cactus(): THREE.Object3D[] {
  const green = 0x4f9a5a;
  const arm = (name: string, side: number, y: number) => [
    cyl(`${name}-out`, 0.026, 0.026, 0.07, green, side * 0.062, y, 0, 'x', undefined, 12),
    cyl(`${name}-up`, 0.026, 0.026, 0.1, green, side * 0.095, y + 0.05, 0, 'y', undefined, 12),
    sph(`${name}-cap`, 0.026, green, side * 0.095, y + 0.1, 0, [1, 1, 1], undefined, [12, 8]),
  ];
  return [
    cyl('cactus-pot', 0.08, 0.06, 0.09, 0xc4623a, 0, 0.045, 0),
    cyl('cactus-pot-rim', 0.088, 0.088, 0.025, 0xd4724a, 0, 0.1, 0),
    cyl('cactus-soil', 0.074, 0.074, 0.006, 0x4a3426, 0, 0.1155, 0),
    cyl('cactus-body', 0.05, 0.052, 0.2, green, 0, 0.215, 0, 'y', undefined, 14),
    sph('cactus-top', 0.05, green, 0, 0.315, 0, [1, 1, 1], undefined, [14, 8]),
    ...arm('cactus-arm-l', -1, 0.2),
    ...arm('cactus-arm-r', 1, 0.17),
    sph('cactus-flower', 0.02, 0xff5fa8, 0, 0.368, 0, [1, 0.8, 1], undefined, [8, 6]),
  ];
}

function dice(): THREE.Object3D[] {
  const patterns: Record<number, Array<[number, number]>> = {
    1: [[0, 0]],
    2: [[-1, 1], [1, -1]],
    3: [[-1, 1], [0, 0], [1, -1]],
    4: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
    5: [[-1, -1], [-1, 1], [1, -1], [1, 1], [0, 0]],
    6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
  };
  const faces: Array<{ n: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3; value: number }> = [
    { n: new THREE.Vector3(0, 1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1), value: 1 },
    { n: new THREE.Vector3(0, -1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1), value: 6 },
    { n: new THREE.Vector3(1, 0, 0), u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0), value: 2 },
    { n: new THREE.Vector3(-1, 0, 0), u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0), value: 5 },
    { n: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0), value: 3 },
    { n: new THREE.Vector3(0, 0, -1), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0), value: 4 },
  ];
  const die = (name: string, size: number, color: number, pip: number, x: number, z: number, yaw: number) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, size / 2, z);
    g.rotation.y = yaw;
    g.add(bx(`${name}-body`, size, size, size, color, 0, 0, 0, { roughness: 0.4 }));
    for (const f of faces) {
      patterns[f.value].forEach(([a, b], i) => {
        const p = cyl(`${name}-pip-${f.value}-${i}`, size * 0.085, size * 0.085, 0.004, pip, 0, 0, 0, 'y', undefined, 10);
        orient(p, f.n);
        p.position.copy(f.n).multiplyScalar(size / 2 + 0.001)
          .addScaledVector(f.u, a * size * 0.27).addScaledVector(f.v, b * size * 0.27);
        g.add(p);
      });
    }
    return g;
  };
  return [
    die('die-ivory', 0.1, 0xf4efe0, 0x1c1c20, -0.07, 0.015, 0.5),
    die('die-red', 0.09, 0xd9382f, 0xf4efe0, 0.08, -0.025, -0.4),
  ];
}

function rocket(): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [
    cyl('rocket-nozzle', 0.03, 0.045, 0.035, 0x3a3a40, 0, 0.0575, 0),
    cyl('rocket-body', 0.062, 0.062, 0.24, 0xf4f4ef, 0, 0.195, 0, 'y', undefined, 16),
    cyl('rocket-band', 0.064, 0.064, 0.03, 0xd9382f, 0, 0.11, 0, 'y', undefined, 16),
    (() => {
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.12, 16), std(0xd9382f));
      nose.name = 'rocket-nose';
      nose.position.set(0, 0.375, 0);
      return nose;
    })(),
    cyl('rocket-window-rim', 0.034, 0.034, 0.012, 0xc6a264, 0, 0.23, 0.058, 'z', undefined, 14),
    cyl('rocket-window', 0.025, 0.025, 0.012, 0x7fd6f0, 0, 0.23, 0.0645, 'z', undefined, 14),
  ];
  // Three fins at 120 degrees, bottoms on the floor.
  for (let i = 0; i < 3; i++) {
    const holder = new THREE.Group();
    holder.name = `rocket-fin-${i}`;
    holder.rotation.y = (i / 3) * Math.PI * 2 + Math.PI / 2;
    // A swept silhouette with a full root embedded in the hull, not a rotated detached box.
    const outline = new THREE.Shape();
    outline.moveTo(0.052, 0.17);
    outline.lineTo(0.12, 0.045);
    outline.lineTo(0.12, 0);
    outline.lineTo(0.086, 0);
    outline.lineTo(0.052, 0.085);
    outline.closePath();
    const fin = mesh(`rocket-fin-blade-${i}`,
      new THREE.ExtrudeGeometry(outline, { depth: 0.012, bevelEnabled: false }),
      0xd9382f, 0, 0, -0.006);
    holder.add(fin);
    parts.push(holder);
  }
  return parts;
}

export const toyBuilders = {
  fishBowl, yoyo, skateboard, soccerBall, flyingSaucer, lavaLamp,
  rubiksCube, rubberDuck, globe, cactus, dice, rocket,
};
