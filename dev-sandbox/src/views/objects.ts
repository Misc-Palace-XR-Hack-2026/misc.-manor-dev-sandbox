import * as THREE from 'three';
import { buildArmchair, buildSideTable, buildTurntable, buildRug, buildLeafyPlant } from './study-decor';
import type { ObjectKind, ContentItem } from '../core/types';
import { validPhotoData, photoDimensions } from '../core/photos';

// Placeholder objects built from primitives. Origin = base center, +z = front face.
// Swap any of these for a GLB later; saved rooms only store the kind name.

const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0 });

function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y + h / 2, z);
  return m;
}

function cyl(rTop: number, rBottom: number, h: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 20), mat(color));
  m.position.set(x, y + h / 2, z);
  return m;
}

const BUILDERS: Record<ObjectKind, () => THREE.Object3D[]> = {
  // Standing book, cover toward the camera, with a cream page block behind it.
  book: () => [
    box(0.34, 0.46, 0.07, 0xc0463b, 0, 0, 0.06),
    box(0.3, 0.42, 0.1, 0xf1e6cf, 0, 0.02, -0.02),
    box(0.04, 0.44, 0.2, 0x9a2f2a, -0.17, 0.01, -0.01),
  ],
  photoFrame: () => {
    const back = box(0.5, 0.6, 0.05, 0xb8793f);
    const photo = box(0.38, 0.48, 0.02, 0x7fb0c9, 0, 0.06, 0.03);
    const stand = box(0.3, 0.04, 0.2, 0x9a6232, 0, 0, -0.08);
    return [back, photo, stand];
  },
  record: () => [
    box(0.62, 0.12, 0.5, 0x9b9a98),
    cyl(0.2, 0.2, 0.02, 0x1b1b1f, -0.05, 0.12, 0),
    cyl(0.06, 0.06, 0.025, 0xe9a23b, -0.05, 0.12, 0),
    box(0.04, 0.03, 0.22, 0x2b2b2e, 0.22, 0.12, 0),
  ],
  tv: () => [
    box(0.62, 0.46, 0.46, 0x56575c),
    box(0.4, 0.32, 0.02, 0x9fc7cf, -0.04, 0.07, 0.235),
    box(0.06, 0.28, 0.02, 0x2a2a2e, 0.2, 0.09, 0.235),
  ],
  boombox: () => {
    const s1 = cyl(0.09, 0.09, 0.03, 0x1e1e22, -0.18, 0.08, 0.1);
    const s2 = cyl(0.09, 0.09, 0.03, 0x1e1e22, 0.18, 0.08, 0.1);
    s1.rotation.x = s2.rotation.x = Math.PI / 2;
    return [box(0.62, 0.34, 0.2, 0xcf3f3a), s1, s2, box(0.4, 0.04, 0.05, 0x2b2b2e, 0, 0.34, 0)];
  },
  box: () => [box(0.58, 0.36, 0.46, 0xb98b57), box(0.5, 0.02, 0.38, 0xe3c58f, 0, 0.36, 0)],
  plant: () => [buildLeafyPlant()],
  armchair: () => [buildArmchair()],
  sideTable: () => [buildSideTable()],
  turntable: () => [buildTurntable()],
  rug: () => [buildRug()],
  mug: () => {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 14), mat(0xf3efe6));
    handle.position.set(0.09, 0.07, 0);
    return [cyl(0.075, 0.075, 0.14, 0xf3efe6), handle, cyl(0.065, 0.065, 0.005, 0x5b3a29, 0, 0.135, 0)];
  },
  notebook: () => [box(0.34, 0.05, 0.44, 0xc9a96e), box(0.03, 0.052, 0.44, 0x7e5b36, -0.15, 0, 0), box(0.04, 0.054, 0.44, 0xd1584a, 0.1, 0, 0)],
  trophy: () => [
    box(0.22, 0.06, 0.22, 0x2b2b2e),
    cyl(0.025, 0.04, 0.16, 0xe6b73c, 0, 0.06, 0),
    cyl(0.12, 0.05, 0.18, 0xf2c94c, 0, 0.22, 0),
  ],
  cat: () => {
    const fur = mat(0xf3d2a4);
    const pink = mat(0xefb0a0);
    const dark = mat(0x3a281c);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), fur);
    body.name = 'cat-body';
    body.scale.set(1.55, 0.68, 1.15);
    body.position.set(0, 0.122, -0.02);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), fur);
    head.name = 'cat-head';
    head.scale.set(1.15, 0.95, 1);
    head.position.set(0, 0.145, 0.16);
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4), fur);
    earL.name = 'cat-ear-l';
    earL.position.set(-0.055, 0.25, 0.13);
    earL.rotation.set(0.2, 0.15, 0.42);
    const earR = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4), mat(0xf3d2a4));
    earR.name = 'cat-ear-r';
    earR.position.set(0.055, 0.25, 0.13);
    earR.rotation.set(0.2, -0.15, -0.42);
    const innerL = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.055, 4), pink);
    innerL.position.set(-0.055, 0.242, 0.138);
    innerL.rotation.copy(earL.rotation);
    const innerR = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.055, 4), mat(0xefb0a0));
    innerR.position.set(0.055, 0.242, 0.138);
    innerR.rotation.copy(earR.rotation);
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.028, 6, 12, Math.PI), fur);
    tail.name = 'cat-tail';
    tail.position.set(0.16, 0.1, -0.12);
    tail.rotation.set(0.2, 1.1, 0.9);
    const eye = (x: number) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), dark);
      e.scale.set(1.6, 0.25, 0.7);
      e.position.set(x, 0.155, 0.25);
      return e;
    };
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), pink);
    nose.position.set(0, 0.125, 0.265);
    const paw = (x: number, z: number) => {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.038, 6, 5), fur);
      p.scale.set(1.1, 0.5, 1.25);
      p.position.set(x, 0.03, z);
      return p;
    };
    return [
      body, head, earL, earR, innerL, innerR, tail,
      eye(-0.038), eye(0.038), nose,
      paw(-0.08, 0.13), paw(0.08, 0.13), paw(-0.1, -0.08), paw(0.1, -0.08),
    ];
  },
  teapot: () => {
    const ceramic = 0xf3efe6;
    const lid = 0xc46a4a;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, 0.12, 8), mat(ceramic));
    spout.position.set(0.12, 0.12, 0);
    spout.rotation.z = -Math.PI / 2.6;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 10), mat(ceramic));
    handle.position.set(-0.1, 0.12, 0);
    handle.rotation.y = Math.PI / 2;
    return [
      cyl(0.09, 0.07, 0.14, ceramic, 0, 0.02, 0),
      cyl(0.04, 0.04, 0.03, lid, 0, 0.16, 0),
      cyl(0.012, 0.012, 0.03, lid, 0, 0.19, 0),
      spout,
      handle,
    ];
  },
  lantern: () => {
    const paper = mat(0xf6e2b8);
    paper.emissive = new THREE.Color(0xffcc77);
    paper.emissiveIntensity = 0.35;
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.18, 8), paper);
    shade.position.set(0, 0.16, 0);
    return [
      cyl(0.04, 0.04, 0.04, 0x6f4e37),
      shade,
      cyl(0.035, 0.035, 0.02, 0x6f4e37, 0, 0.25, 0),
      cyl(0.008, 0.008, 0.05, 0xc2a17d, 0, 0.27, 0),
    ];
  },
  headphones: () => {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.016, 6, 12, Math.PI), mat(0x5c4033));
    band.rotation.z = Math.PI;
    band.position.set(0, 0.16, 0);
    const cup = (x: number) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 10), mat(0x3d2b22));
      c.rotation.z = Math.PI / 2;
      c.position.set(x, 0.09, 0);
      return c;
    };
    const pad = (x: number) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.018, 10), mat(0xc9a96e));
      p.rotation.z = Math.PI / 2;
      p.position.set(x * 0.72, 0.09, 0);
      return p;
    };
    return [band, cup(-0.11), cup(0.11), pad(-0.11), pad(0.11)];
  },
  cassette: () => [
    box(0.34, 0.04, 0.22, 0xd9c4a0),
    box(0.3, 0.01, 0.16, 0x5b3a29, 0, 0.04, 0),
    cyl(0.035, 0.035, 0.02, 0x2b2b2e, -0.07, 0.04, 0),
    cyl(0.035, 0.035, 0.02, 0x2b2b2e, 0.07, 0.04, 0),
    box(0.12, 0.018, 0.06, 0xc0463b, 0, 0.01, 0.09),
  ],
  cushion: () => {
    const pillow = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 8), mat(0xc46a4a));
    pillow.position.set(0, 0.04, 0);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 8), mat(0xe8dbc2));
    top.position.set(0, 0.085, 0);
    return [pillow, top];
  },
};

// Objects are drawn at ~half a unit; scale up so they read clearly next to a 6-unit room.
const OBJECT_SCALE = 1.6;

// Adapted from study.js titleTexture: local canvas text, never imported HTML.
function titleTexture(title: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 640;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#f8efdb';
  c.fillRect(0, 0, 512, 640);
  c.strokeStyle = '#48533c';
  c.lineWidth = 10;
  c.strokeRect(18, 18, 476, 604);
  c.fillStyle = '#2f3828';
  c.font = 'bold 56px Georgia, serif';
  c.textAlign = 'center';
  const words = title.slice(0, 180).split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    for (const chunk of word.match(/.{1,12}/g) ?? []) {
      const next = line ? `${line} ${chunk}` : chunk;
      if (c.measureText(next).width > 430 && line) {
        lines.push(line);
        line = chunk;
      } else line = next;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, 6).forEach((text, i) =>
    c.fillText(i === 5 && lines.length > 6 ? `${text.slice(0, 10)}…` : text, 256, 150 + i * 70, 430),
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildObject(kind: ObjectKind, content?: Pick<ContentItem,'title'|'imageData'>): THREE.Group {
  const g = new THREE.Group();
  g.scale.setScalar(OBJECT_SCALE);
  for (const part of BUILDERS[kind]()) {
    part.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    g.add(part);
  }
  if (kind === 'book' && content) {
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.30, 0.42),
      new THREE.MeshStandardMaterial({ map: titleTexture(content.title), roughness: 0.85 }),
    );
    face.name = 'book-title';
    face.position.set(0, 0.23, 0.096);
    g.add(face);
  }
  if (kind === 'notebook' && content) {
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.38),
      new THREE.MeshStandardMaterial({ map: titleTexture(content.title), roughness: 0.85 }),
    );
    face.name = 'book-title';
    face.rotation.x = -Math.PI / 2;
    face.position.set(0, 0.06, 0);
    g.add(face);
  }
  if (kind === 'photoFrame' && validPhotoData(content?.imageData)) {
    const data = content!.imageData!;
    const d = photoDimensions(data)!;
    const ratio = d.width / d.height;
    const w = Math.min(0.38, 0.48 * ratio);
    const h = w / ratio;
    const img = new Image();
    const texture = new THREE.Texture(img);
    texture.colorSpace = THREE.SRGBColorSpace;
    img.onload = () => {
      texture.needsUpdate = true;
    };
    img.src = data;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
    face.name = 'photo-image';
    face.position.set(0, 0.30, 0.041);
    g.add(face);
  }
  return g;
}
