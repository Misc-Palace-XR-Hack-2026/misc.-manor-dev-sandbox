import * as THREE from 'three';

// The save point (Kingdom Hearts save point vibe): a glowing rune circle, a soft column of light rising out of it,
// sparkles drifting up and two wisps circling. It floats off the room (like the jukebox) and bobs gently; its teal
// light reaches the edge of the room's floor, so it shows at the edge of the view before the visitor turns to it.
// Primitives and canvas textures only, nothing to load.
//
// Size: about 1.1 wide, 2.4 tall. Origin is the centre of the rune circle.

export interface SavePoint {
  group: THREE.Group;
  /** Call every frame: turns the runes, pulses the light, lifts the sparkles, circles the wisps. */
  update(timeSeconds: number, deltaSeconds: number): void;
  /** Distance along the ray to the save point, or null if the ray misses it. */
  hit(raycaster: THREE.Raycaster): number | null;
  /** Where to aim a camera or measure distance from (the middle of the column). */
  readonly center: THREE.Vector3;
  dispose(): void;
}

const TEAL = 0x4dffd2;
const MINT = 0xb8fff0;
const RING_R = 0.55;
const COLUMN_R = 0.38;
const COLUMN_H = 2.4;
const SPARKS = 48;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A soft round dot, white in the middle: sparkles, wisps and the floor glow. */
const dotTexture = () => canvasTexture(64, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
});

/** The rune circle: two rings with a band of little marks between them and a star in the middle. */
const runeTexture = () => canvasTexture(512, (ctx, s) => {
  const c = s / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.lineCap = 'round';
  const ring = (r: number, w: number) => { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.stroke(); };
  ring(s * 0.47, 6);
  ring(s * 0.40, 3);
  ring(s * 0.22, 3);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.save();
    ctx.translate(c + Math.cos(a) * s * 0.435, c + Math.sin(a) * s * 0.435);
    ctx.rotate(a + Math.PI / 2);
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (i % 3 === 0) { ctx.arc(0, 0, 6, 0, Math.PI * 2); }
    else if (i % 3 === 1) { ctx.moveTo(-7, -5); ctx.lineTo(0, 6); ctx.lineTo(7, -5); }
    else { ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.moveTo(0, -6); ctx.lineTo(0, 6); }
    ctx.stroke();
    ctx.restore();
  }
  // A six-point star made of two triangles.
  ctx.lineWidth = 3;
  for (const turn of [0, Math.PI / 3]) {
    ctx.beginPath();
    for (let k = 0; k <= 3; k++) {
      const a = turn + (k / 3) * Math.PI * 2 - Math.PI / 2;
      const x = c + Math.cos(a) * s * 0.2, y = c + Math.sin(a) * s * 0.2;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
});

/** The column: bright at the floor, fading out toward the top, with soft vertical streaks. */
const columnTexture = () => canvasTexture(128, (ctx, s) => {
  const g = ctx.createLinearGradient(0, s, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.25 + (i % 3) * 0.15})`;
    ctx.fillRect((i / 9) * s + 3, 0, 4 + (i % 2) * 4, s);
  }
});

export function buildSavePoint(tint = TEAL, highlight = MINT): SavePoint {
  const TEAL = tint, MINT = highlight;
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const group = new THREE.Group();
  group.name = 'save-point';
  // Everything bobs together inside `float`; update() never moves the group itself.
  const float = new THREE.Group();
  group.add(float);
  const geo = <T extends THREE.BufferGeometry>(g: T): T => { geometries.push(g); return g; };
  const mat = <T extends THREE.Material>(m: T): T => { materials.push(m); return m; };
  const tex = <T extends THREE.Texture>(t: T): T => { textures.push(t); return t; };
  const glow = (color: number, map: THREE.Texture, opacity: number, side: THREE.Side = THREE.FrontSide) => mat(new THREE.MeshBasicMaterial({
    color, map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side, toneMapped: false,
  }));

  const dot = tex(dotTexture());

  // ---- at the base: a wide soft aura, the rune circle and an inner counter-turning ring ----
  const floorGlowMat = glow(TEAL, dot, 0.5);
  const floorGlow = new THREE.Mesh(geo(new THREE.PlaneGeometry(RING_R * 4, RING_R * 4).rotateX(-Math.PI / 2)), floorGlowMat);
  floorGlow.position.y = 0.012;
  floorGlow.renderOrder = 5;
  const runeMat = glow(TEAL, tex(runeTexture()), 0.95);
  const runes = new THREE.Mesh(geo(new THREE.PlaneGeometry(RING_R * 2, RING_R * 2).rotateX(-Math.PI / 2)), runeMat);
  runes.position.y = 0.02;
  runes.renderOrder = 6;
  const innerRingMat = mat(new THREE.MeshBasicMaterial({ color: MINT, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const innerRing = new THREE.Mesh(geo(new THREE.RingGeometry(COLUMN_R * 0.92, COLUMN_R, 64).rotateX(-Math.PI / 2)), innerRingMat);
  innerRing.position.y = 0.026;
  innerRing.renderOrder = 6;
  float.add(floorGlow, runes, innerRing);

  // ---- the column of light: an outer veil and a brighter, thinner core ----
  const columnTex = tex(columnTexture());
  columnTex.wrapS = THREE.RepeatWrapping;
  const veilMat = glow(TEAL, columnTex, 0.55, THREE.DoubleSide);
  const veil = new THREE.Mesh(geo(new THREE.CylinderGeometry(COLUMN_R, COLUMN_R, COLUMN_H, 48, 1, true)), veilMat);
  veil.position.y = COLUMN_H / 2;
  veil.renderOrder = 7;
  const coreTex = tex(columnTexture());
  const coreMat = glow(MINT, coreTex, 0.45, THREE.DoubleSide);
  const core = new THREE.Mesh(geo(new THREE.CylinderGeometry(COLUMN_R * 0.4, COLUMN_R * 0.55, COLUMN_H * 0.8, 32, 1, true)), coreMat);
  core.position.y = COLUMN_H * 0.4;
  core.renderOrder = 7;
  float.add(veil, core);

  // ---- sparkles drifting up through the column ----
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkSeed = Array.from({ length: SPARKS }, (_, i) => ({
    a: (i * 2.399) % (Math.PI * 2), // golden-angle spread
    r: COLUMN_R * (0.25 + 0.75 * ((i * 0.618) % 1)),
    speed: 0.25 + ((i * 0.37) % 1) * 0.35,
    y: ((i * 0.53) % 1) * COLUMN_H,
  }));
  const sparkGeo = geo(new THREE.BufferGeometry());
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = mat(new THREE.PointsMaterial({
    color: MINT, map: dot, size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.renderOrder = 8;
  sparks.frustumCulled = false;
  float.add(sparks);

  // ---- two wisps circling the column ----
  const wispMat = mat(new THREE.SpriteMaterial({ color: TEAL, map: dot, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const wisps = [0, Math.PI].map((phase) => {
    const sprite = new THREE.Sprite(wispMat);
    sprite.scale.setScalar(0.38);
    sprite.renderOrder = 8;
    float.add(sprite);
    return { sprite, phase };
  });

  // ---- teal light, reaching the edge of the room's floor ----
  const light = new THREE.PointLight(TEAL, 6, 5.5, 1.6);
  light.position.y = 0.9;
  float.add(light);

  // ---- invisible tap target: the column's volume ----
  const hitMat = mat(new THREE.MeshBasicMaterial({ visible: false }));
  const hitMesh = new THREE.Mesh(geo(new THREE.CylinderGeometry(RING_R, RING_R, COLUMN_H, 16)), hitMat);
  hitMesh.position.y = COLUMN_H / 2;
  float.add(hitMesh);

  const center = new THREE.Vector3();
  const placeSparks = () => {
    for (let i = 0; i < SPARKS; i++) {
      const s = sparkSeed[i];
      sparkPos[i * 3] = Math.cos(s.a) * s.r;
      sparkPos[i * 3 + 1] = s.y;
      sparkPos[i * 3 + 2] = Math.sin(s.a) * s.r;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  };
  const placeWisps = (t: number) => {
    for (const w of wisps) {
      const a = t * 0.7 + w.phase;
      w.sprite.position.set(Math.cos(a) * (RING_R + 0.05), 1.3 + Math.sin(t * 1.1 + w.phase) * 0.45, Math.sin(a) * (RING_R + 0.05));
    }
  };
  placeSparks();
  placeWisps(0);

  return {
    group,
    get center() {
      group.updateMatrixWorld();
      return center.set(0, COLUMN_H * 0.45, 0).applyMatrix4(float.matrixWorld);
    },
    update(t, dt) {
      const still = reduced();
      const pulse = still ? 1 : 1 + 0.12 * Math.sin(t * 2.0);
      veilMat.opacity = 0.5 * pulse;
      coreMat.opacity = 0.42 * (still ? 1 : 1 + 0.18 * Math.sin(t * 3.1 + 1));
      floorGlowMat.opacity = 0.45 * pulse;
      light.intensity = 6 * pulse;
      if (still) return;
      float.position.y = (1 + Math.sin(t * 1.3)) * 0.04; // bobs up from floor level, never below it
      runes.rotation.y += dt * 0.25;
      innerRing.rotation.y -= dt * 0.6;
      columnTex.offset.x = (columnTex.offset.x + dt * 0.04) % 1;
      coreTex.offset.x = (coreTex.offset.x - dt * 0.07) % 1;
      for (let i = 0; i < SPARKS; i++) {
        const s = sparkSeed[i];
        s.y += dt * s.speed;
        s.a += dt * 0.3;
        if (s.y > COLUMN_H) s.y -= COLUMN_H;
      }
      placeSparks();
      sparkMat.opacity = 0.75 + 0.15 * Math.sin(t * 4);
      placeWisps(t);
    },
    hit(raycaster) {
      if (!group.visible) return null;
      return raycaster.intersectObject(hitMesh, false)[0]?.distance ?? null;
    },
    dispose() {
      group.removeFromParent();
      light.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}
