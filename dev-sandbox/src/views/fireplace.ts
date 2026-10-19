import * as THREE from 'three';

// Procedural fireplace fixture. Local frame: back of the fireplace is the plane z = 0 (it stands flat against a wall),
// the front faces +z, x is centered, y = 0 is the floor. Everything is built from boxes, cylinders and additive
// sprites, so there are no assets to load. All animation happens in update(t) without allocating.

export interface FireplaceRig {
  group: THREE.Group;
  /** Advance flames, embers and light flicker. `t` is seconds. */
  update(t: number): void;
  dispose(): void;
}

// ---- shared textures (drawn once, shared by every rig and renderer) ---------------------------------------------

let brickMap: THREE.CanvasTexture | null = null;
let flameMap: THREE.CanvasTexture | null = null;
let glowMap: THREE.CanvasTexture | null = null;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

/** One tile = 0.5 m x 0.5 m of running-bond brick (bricks 0.25 x 0.125 m). */
function brickTexture(): THREE.CanvasTexture {
  if (brickMap) return brickMap;
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#2e211c'; // mortar
  ctx.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 4; row++) {
    const offset = row % 2 ? -64 : 0;
    for (let i = 0; i < 3; i++) {
      const x = offset + i * 128;
      const shade = 0.78 + rnd() * 0.42;
      const r = Math.round(150 * shade), g = Math.round(72 * shade), b = Math.round(50 * shade);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + 3, row * 64 + 3, 122, 58);
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; // subtle bottom shade for depth
      ctx.fillRect(x + 3, row * 64 + 50, 122, 11);
    }
  }
  brickMap = new THREE.CanvasTexture(c);
  brickMap.wrapS = brickMap.wrapT = THREE.RepeatWrapping;
  brickMap.colorSpace = THREE.SRGBColorSpace;
  brickMap.anisotropy = 4;
  return brickMap;
}

/** Soft teardrop, white on transparent; tinted by the sprite material color. */
function flameTexture(): THREE.CanvasTexture {
  if (flameMap) return flameMap;
  const [c, ctx] = canvas(128, 256);
  ctx.shadowColor = 'white';
  ctx.shadowBlur = 26;
  ctx.beginPath();
  ctx.moveTo(64, 20);
  ctx.bezierCurveTo(78, 90, 104, 130, 96, 180);
  ctx.bezierCurveTo(92, 222, 36, 222, 32, 180);
  ctx.bezierCurveTo(24, 130, 56, 96, 64, 20);
  ctx.closePath();
  const fill = ctx.createRadialGradient(64, 180, 4, 64, 170, 100);
  fill.addColorStop(0, 'rgba(255,255,255,1)');
  fill.addColorStop(0.55, 'rgba(255,255,255,0.7)');
  fill.addColorStop(1, 'rgba(255,255,255,0.05)');
  ctx.fillStyle = fill;
  ctx.fill();
  flameMap = new THREE.CanvasTexture(c);
  flameMap.colorSpace = THREE.SRGBColorSpace;
  return flameMap;
}

function glowTexture(): THREE.CanvasTexture {
  if (glowMap) return glowMap;
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowMap = new THREE.CanvasTexture(c);
  glowMap.colorSpace = THREE.SRGBColorSpace;
  return glowMap;
}

// ---- geometry helpers --------------------------------------------------------------------------------------------

/** A box whose UVs follow its real size, so one brick tile stays 0.5 m on every face. */
function brickBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 vertices each).
  const faces: Array<[number, number]> = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  faces.forEach(([fw, fh], f) => {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * (fw / 0.5), uv.getY(k) * (fh / 0.5));
    }
  });
  return g;
}

function placed<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

interface Flame { sprite: THREE.Sprite; x: number; base: number; width: number; speed: number; phase: number }

const EMBERS = 40;
const LIGHT_BASE = 11;

export function buildFireplace(): FireplaceRig {
  const group = new THREE.Group();
  group.name = 'fireplace';

  const brick = new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.95 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x5b544d, roughness: 0.9 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a2e1c, roughness: 0.75 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x33200f, roughness: 0.8 });
  const soot = new THREE.MeshStandardMaterial({ color: 0x120d0b, roughness: 1, emissive: 0x501400, emissiveIntensity: 0.35 });
  const log = new THREE.MeshStandardMaterial({ color: 0x24160d, roughness: 1, emissive: 0xff4a0a, emissiveIntensity: 0.4 });
  const bed = new THREE.MeshStandardMaterial({ color: 0x2b1a12, roughness: 1, emissive: 0xff3a00, emissiveIntensity: 0.9 });

  const solid = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const m = placed(new THREE.Mesh(geo, mat), x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Structure: hearth slab, two brick piers, lintel beam, mantel board, chimney breast and cap. Opening is 1.0 wide, 0.9 tall.
  solid(new THREE.BoxGeometry(2.4, 0.1, 0.95), stone, 0, 0.05, 0.475);
  solid(brickBox(0.5, 1.1, 0.5), brick, -0.75, 0.65, 0.25);
  solid(brickBox(0.5, 1.1, 0.5), brick, 0.75, 0.65, 0.25);
  solid(new THREE.BoxGeometry(1.0, 0.2, 0.55), darkWood, 0, 1.1, 0.275);
  solid(new THREE.BoxGeometry(2.3, 0.1, 0.7), wood, 0, 1.25, 0.35);
  solid(brickBox(1.6, 0.65, 0.4), brick, 0, 1.625, 0.2);
  solid(new THREE.BoxGeometry(1.7, 0.06, 0.45), stone, 0, 1.98, 0.225);

  // Firebox interior: soot-black back and floor, an ember bed, and three logs.
  const back = placed(new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.9), soot), 0, 0.55, 0.03);
  group.add(back);
  const floor = placed(new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), soot), 0, 0.102, 0.27);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);
  const embersBed = placed(new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.34), bed), 0, 0.115, 0.26);
  embersBed.rotation.x = -Math.PI / 2;
  group.add(embersBed);

  const logGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.72, 10);
  const logs: Array<[number, number, number, number, number]> = [
    // x, y, z, rotation about y, tilt about z
    [0, 0.2, 0.14, 0.05, Math.PI / 2],
    [-0.05, 0.15, 0.3, 0.5, Math.PI / 2 - 0.08],
    [0.06, 0.16, 0.34, -0.45, Math.PI / 2 + 0.06],
  ];
  for (const [x, y, z, ry, rz] of logs) {
    const l = solid(logGeo, log, x, y, z);
    l.rotation.set(0, ry, rz, 'YXZ');
  }

  // Flames: additive teardrop sprites that grow up from their base, orange outside and yellow-white inside.
  const flames: Flame[] = [];
  const addFlame = (color: number, x: number, z: number, base: number, width: number, speed: number, opacity: number) => {
    const mat = new THREE.SpriteMaterial({
      map: flameTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, 0.05);
    sprite.position.set(x, 0.2, z);
    group.add(sprite);
    flames.push({ sprite, x, base, width, speed, phase: flames.length * 1.73 });
  };
  const outerX = [-0.34, -0.2, -0.06, 0.08, 0.22, 0.35, 0.0];
  outerX.forEach((x, i) => addFlame(0xff5a12, x, 0.16 + (i % 3) * 0.07, 0.52 + (i % 4) * 0.07, 0.3, 5.5 + i * 0.7, 0.8));
  [-0.18, 0, 0.17, 0.05].forEach((x, i) => addFlame(0xffc54a, x, 0.3, 0.34 + (i % 2) * 0.1, 0.2, 7.5 + i * 0.9, 0.9));
  addFlame(0xfff2c0, 0, 0.34, 0.2, 0.14, 9, 0.9);

  // Glows: a dim bed under the logs, a haze behind the flames, and a faint halo in front that warms the stonework.
  const glow = (color: number, x: number, y: number, z: number, w: number, h: number, opacity: number): THREE.Sprite => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    s.position.set(x, y, z);
    s.scale.set(w, h, 1);
    group.add(s);
    return s;
  };
  const bedGlow = glow(0xff4a10, 0, 0.22, 0.28, 1.0, 0.4, 0.8);
  const hazeGlow = glow(0xff7a20, 0, 0.55, 0.1, 1.5, 1.3, 0.4);
  const haloGlow = glow(0xff8a30, 0, 0.5, 0.8, 3.4, 2.6, 0.1);

  // Sparks: one Points object, positions and colors rewritten in place every frame.
  const pos = new Float32Array(EMBERS * 3);
  const col = new Float32Array(EMBERS * 3);
  const vel = new Float32Array(EMBERS * 3);
  const age = new Float32Array(EMBERS);
  const life = new Float32Array(EMBERS);
  const spawn = (i: number, stagger: boolean) => {
    life[i] = 0.8 + Math.random() * 0.8;
    age[i] = stagger ? Math.random() * life[i] : 0;
    pos[i * 3] = (Math.random() - 0.5) * 0.6;
    pos[i * 3 + 1] = 0.24 + Math.random() * 0.1;
    pos[i * 3 + 2] = 0.1 + Math.random() * 0.25;
    vel[i * 3] = (Math.random() - 0.5) * 0.12;
    vel[i * 3 + 1] = 0.25 + Math.random() * 0.3;
    vel[i * 3 + 2] = (Math.random() - 0.5) * 0.06;
    if (stagger) { // pre-advance so the first frame already looks lived-in
      pos[i * 3] += vel[i * 3] * age[i];
      pos[i * 3 + 1] += vel[i * 3 + 1] * age[i];
    }
  };
  for (let i = 0; i < EMBERS; i++) spawn(i, true);
  const sparkGeo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3);
  const colAttr = new THREE.BufferAttribute(col, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  colAttr.setUsage(THREE.DynamicDrawUsage);
  sparkGeo.setAttribute('position', posAttr);
  sparkGeo.setAttribute('color', colAttr);
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    size: 5, sizeAttenuation: false, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sparks.frustumCulled = false; // positions move; the initial bounding sphere would be stale
  group.add(sparks);

  // Light: sits just outside the opening so the piers do not shadow the room; furniture throws warm shadows.
  const light = new THREE.PointLight(0xff7a2a, LIGHT_BASE, 11, 2);
  light.position.set(0, 0.55, 0.62);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.camera.near = 0.15;
  light.shadow.camera.far = 12;
  light.shadow.bias = -0.002;
  light.shadow.normalBias = 0.03;
  group.add(light);

  let last = -1;
  const update = (t: number): void => {
    const dt = last < 0 ? 0.016 : Math.min(Math.max(t - last, 0), 0.1);
    last = t;

    const flicker = 0.84 + 0.1 * Math.sin(t * 11) + 0.06 * Math.sin(t * 23.7 + 1.3) + 0.05 * Math.sin(t * 5.1 + 2);
    light.intensity = LIGHT_BASE * flicker;
    log.emissiveIntensity = 0.35 + 0.25 * flicker;
    bed.emissiveIntensity = 0.7 + 0.5 * flicker;
    bedGlow.material.opacity = 0.55 + 0.35 * flicker;
    hazeGlow.material.opacity = 0.25 + 0.2 * flicker;
    haloGlow.material.opacity = 0.05 + 0.07 * flicker;

    for (const f of flames) {
      const s = t * f.speed + f.phase;
      const h = f.base * (0.82 + 0.22 * Math.sin(s) + 0.1 * Math.sin(s * 2.3 + 1));
      const w = f.width * (0.92 + 0.12 * Math.sin(s * 1.4 + 2));
      f.sprite.scale.set(w, h, 1);
      f.sprite.position.x = f.x + 0.03 * Math.sin(t * 3 + f.phase);
      f.sprite.material.rotation = 0.1 * Math.sin(s * 0.7);
    }

    for (let i = 0; i < EMBERS; i++) {
      age[i] += dt;
      if (age[i] >= life[i]) spawn(i, false);
      const k = i * 3;
      pos[k] += vel[k] * dt + Math.sin(t * 6 + i) * 0.02 * dt;
      pos[k + 1] += vel[k + 1] * dt;
      pos[k + 2] += vel[k + 2] * dt;
      const u = age[i] / life[i];
      const fade = (1 - u) * (1 - u);
      col[k] = fade;
      col[k + 1] = fade * (0.6 - 0.35 * u);
      col[k + 2] = fade * 0.15;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  };

  const dispose = (): void => {
    // Textures are shared module-level caches and are intentionally kept.
    group.traverse((o) => {
      const any = o as THREE.Mesh | THREE.Points | THREE.Sprite;
      if ('geometry' in any && any.geometry) any.geometry.dispose();
      const m = (any as { material?: THREE.Material | THREE.Material[] }).material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      if (o instanceof THREE.PointLight) o.shadow.dispose();
    });
    group.clear();
  };

  update(0);
  return { group, update, dispose };
}
