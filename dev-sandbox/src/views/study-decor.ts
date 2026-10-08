import * as THREE from 'three';
// Selected procedural geometry from DataMemoryPalace study-visuals.js; see PROVENANCE.md.
const material = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
function mesh(geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Group, scale?: number[]) {
  const m = new THREE.Mesh(geometry, mat); m.position.set(x,y,z);
  if(scale) m.scale.set(scale[0],scale[1],scale[2]);
  m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
function block(w: number,h: number,d: number,mat: THREE.Material,x: number,y: number,z: number,parent: THREE.Group) {
  return mesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z,parent);
}
function rod(a: number[],b: number[],radius: number,mat: THREE.Material,parent: THREE.Group) {
 const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
 const delta = end.clone().sub(start), mid = start.add(end).multiplyScalar(0.5);
 const m=mesh(new THREE.CylinderGeometry(radius,radius,delta.length(),7),mat,mid.x,mid.y,mid.z,parent);
 m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()); return m;
}
function woodTexture() {
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;const c=canvas.getContext('2d')!;
 let seed=731;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    c.fillStyle = '#b98a59'; c.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 1500; i++) {
      const y = rand() * 1024;
      c.strokeStyle = `rgba(${rand() > 0.4 ? '63,32,17' : '255,218,159'},${0.04 + rand() * 0.14})`;
      c.lineWidth = 0.4 + rand() * 2;
      c.beginPath(); c.moveTo(0, y);
      for (let x = 0; x <= 1024; x += 16) {
        c.lineTo(x, y + Math.sin(x / 100 + y / 71) * 3 + Math.sin(x / 38 + y) * 0.8);
      }
      c.stroke();
    }
    for (let i = 0; i < 9; i++) {
      const x = rand() * 1024, y = rand() * 1024;
      for (let r = 1; r < 13; r++) {
        c.strokeStyle = `rgba(72,39,21,${0.2 - r * 0.011})`;
        c.beginPath(); c.ellipse(x, y, r * 8, r * 1.5, 0, 0, Math.PI * 2); c.stroke();
      }
    }

 const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function rugTexture() {
 const canvas=document.createElement('canvas'); canvas.width=canvas.height=1024;
 const c=canvas.getContext('2d')!;
    c.fillStyle = '#984d38'; c.fillRect(0, 0, 1024, 1024);
    const bands: [number, string][] = [[32, '#d4b181'], [47, '#3f5350'], [65, '#c59966'], [86, '#793f32'], [122, '#d2ab79'], [147, '#445754']];
    for (const [inset, color] of bands) {
      c.strokeStyle = color; c.lineWidth = inset === 122 ? 34 : 9;
      c.strokeRect(inset, inset, 1024 - 2 * inset, 1024 - 2 * inset);
    }
    for (let y = 195; y < 870; y += 104) for (let x = 196; x < 880; x += 104) {
      c.save(); c.translate(x, y); c.rotate(Math.PI / 4);
      c.fillStyle = '#bc8a5c'; c.fillRect(-20, -20, 40, 40);
      c.fillStyle = '#e0c395'; c.fillRect(-10, -10, 20, 20); c.restore();
    }
    c.save(); c.translate(512, 512); c.rotate(Math.PI / 4);
    c.fillStyle = '#d0aa79'; c.fillRect(-133, -133, 266, 266);
    c.fillStyle = '#753d32'; c.fillRect(-119, -119, 238, 238);
    c.fillStyle = '#415753'; c.fillRect(-88, -88, 176, 176);
    c.strokeStyle = '#d6b589'; c.lineWidth = 6; c.strokeRect(-72, -72, 144, 144);
    c.fillStyle = '#d6b589'; c.fillRect(-24, -24, 48, 48); c.restore();
    for (let i = 0; i < 1024; i += 3) {
      c.fillStyle = i % 2 ? '#fff5da13' : '#241c181c';
      c.fillRect(i, 0, 1, 1024); c.fillRect(0, i, 1024, 1);
    }

 const t=new THREE.CanvasTexture(canvas); t.colorSpace=THREE.SRGBColorSpace; return t;
}
export function buildArmchair(): THREE.Group {
 const decor = new THREE.Group(); decor.name="Armchair";
 const wood=woodTexture();
 const walnut=material(0x806349,{map:wood});
 const brass=material(0xb99552,{metalness:.72,roughness:.29});
  const chairFabric = material(0x8c4b37, { roughness: 0.88 });
  const pillowFabric = material(0xd6ceb8, { roughness: 0.92 });
  for (const [lx, lz] of [[-0.27, -0.27], [0.27, -0.27], [-0.27, 0.27], [0.27, 0.27]]) {
    rod([lx, 0, lz], [lx * 0.85, 0.25, lz * 0.85], 0.022, walnut, decor);
    block(0.048, 0.05, 0.048, brass, lx, 0.025, lz, decor);
  }
  block(0.72, 0.08, 0.70, walnut, 0, 0.26, 0, decor);
  block(0.68, 0.16, 0.64, chairFabric, 0, 0.38, 0, decor);
  const back = block(0.68, 0.54, 0.12, chairFabric, 0, 0.68, -0.28, decor);
  back.rotation.x = -0.16;
  block(0.12, 0.24, 0.64, chairFabric, -0.34, 0.50, 0, decor);
  block(0.12, 0.24, 0.64, chairFabric, 0.34, 0.50, 0, decor);
  block(0.13, 0.02, 0.65, walnut, -0.34, 0.625, 0, decor);
  block(0.13, 0.02, 0.65, walnut, 0.34, 0.625, 0, decor);
  for (const bx of [-0.18, 0, 0.18]) {
    for (const by of [0.58, 0.74, 0.88]) {
      mesh(new THREE.SphereGeometry(0.015, 8, 6), brass, bx, by, -0.21, decor);
    }
  }
  const pillow = block(0.26, 0.26, 0.09, pillowFabric, 0.14, 0.46, -0.16, decor);
  pillow.rotation.set(-0.25, 0.2, 0.1);

 return decor;
}

export function buildSideTable(): THREE.Group {
 const decor = new THREE.Group(); decor.name="SideTable";
 const wood=woodTexture();
 const walnut=material(0x806349,{map:wood});
 const brass=material(0xb99552,{metalness:.72,roughness:.29});
 const cream=material(0xe8dbc2);
  const marbleMat = material(0xf2eee6, { roughness: 0.35, metalness: 0.05 });
  mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.032, 28), marbleMat, 0, 0.56, 0, decor);
  mesh(new THREE.CylinderGeometry(0.246, 0.246, 0.012, 28), brass, 0, 0.55, 0, decor);
  mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.44, 18), walnut, 0, 0.32, 0, decor);
  mesh(new THREE.SphereGeometry(0.065, 16, 12), brass, 0, 0.22, 0, decor);
  for (let i = 0; i < 3; i++) {
    const angle = i * (Math.PI * 2 / 3);
    const ex = Math.sin(angle) * 0.22, ez = Math.cos(angle) * 0.22;
    rod([0, 0.18, 0], [ex, 0.02, ez], 0.018, walnut, decor);
    block(0.035, 0.03, 0.035, brass, ex, 0.015, ez, decor);
  }
  mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.008, 18), cream, -0.06, 0.58, 0.04, decor);
  mesh(new THREE.CylinderGeometry(0.042, 0.03, 0.05, 18), cream, -0.06, 0.605, 0.04, decor);
  mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.004, 16), material(0x381f0d), -0.06, 0.626, 0.04, decor);
  rod([-0.09, 0.582, 0.08], [-0.02, 0.582, 0.01], 0.003, brass, decor);
  mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.018, 18), brass, 0.08, 0.585, -0.05, decor);
  mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.035, 16), brass, 0.08, 0.608, -0.05, decor);
  mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 14), material(0xfcf8ee, { roughness: 0.6 }), 0.08, 0.68, -0.05, decor);
  const flame = mesh(new THREE.SphereGeometry(0.012, 10, 8), material(0xffd56b, { emissive: 0xffaa22, emissiveIntensity: 2.2 }), 0.08, 0.755, -0.05, decor);
  flame.scale.set(0.65, 1.4, 0.65);
  const candleLight = new THREE.PointLight(0xffb866, 0.35, 2.0, 2);
  candleLight.position.set(0.08, 0.76, -0.05);
  decor.add(candleLight);

 return decor;
}

export function buildTurntable(): THREE.Group {
 const decor = new THREE.Group(); decor.name="Turntable";
 const wood=woodTexture();
 const walnut=material(0x806349,{map:wood});
 const brass=material(0xb99552,{metalness:.72,roughness:.29});
 const oak=material(0xc2a17d,{map:wood});
 const silver=material(0xd0d5d6,{metalness:.85,roughness:.25}),vinyl=material(0x181818,{roughness:.35});
  block(0.72, 0.44, 0.44, walnut, 0, 0.58, 0, decor);
  for (const [lx, lz] of [[-0.30, -0.16], [0.30, -0.16], [-0.30, 0.16], [0.30, 0.16]]) {
    rod([lx, 0, lz], [lx * 0.85, 0.36, lz * 0.85], 0.018, walnut, decor);
    block(0.038, 0.045, 0.038, brass, lx, 0.022, lz, decor);
  }
  block(0.38, 0.02, 0.38, material(0x2d3136), -0.14, 0.805, 0, decor);
  mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.012, 28), silver, -0.14, 0.82, 0, decor);
  mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.005, 28), vinyl, -0.14, 0.828, 0, decor);
  mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.006, 20), material(0xd9534f), -0.14, 0.83, 0, decor);
  rod([-0.14, 0.828, 0], [-0.14, 0.845, 0], 0.0035, silver, decor);
  mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.032, 14), silver, 0.02, 0.83, -0.12, decor);
  rod([0.02, 0.84, -0.12], [-0.07, 0.834, -0.02], 0.0035, brass, decor);
  block(0.015, 0.01, 0.025, material(0x222222), -0.07, 0.832, -0.02, decor);
  mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.015, 14), brass, -0.26, 0.82, 0.14, decor);
  mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.015, 14), brass, -0.21, 0.82, 0.14, decor);
  block(0.28, 0.28, 0.38, oak, 0.18, 0.72, 0, decor);
  const albumColors = [0x9e2a2b, 0x335c67, 0xe09f3e, 0x540b0e, 0x283618, 0x3d5a80, 0x6b705c];
  for (let i = 0; i < 7; i++) {
    const albMat = material(albumColors[i]);
    const sleeve = block(0.012, 0.31, 0.31, albMat, 0.08 + i * 0.032, 0.77, 0, decor);
    sleeve.rotation.z = (i - 3) * 0.025;
  }

 return decor;
}

export function buildLeafyPlant(): THREE.Group {
 const decor = new THREE.Group(); decor.name="LeafyPlant";
const leafShape = new THREE.Shape();
leafShape.moveTo(0, 0);
leafShape.bezierCurveTo(-0.09, 0.07, -0.085, 0.19, 0, 0.25);
leafShape.bezierCurveTo(0.085, 0.19, 0.09, 0.07, 0, 0);
const leafGeometry = new THREE.ShapeGeometry(leafShape, 5);
// A slightly cupped blade catches light differently from a flat cutout.
const leafPositions = leafGeometry.attributes.position;
for (let i = 0; i < leafPositions.count; i++) {
  leafPositions.setZ(i, Math.sin(leafPositions.getY(i) * Math.PI / 0.25) * 0.025);
}
leafGeometry.computeVertexNormals();

 const terra=material(0xaf7354),soil=material(0x352a20),stem=material(0x64713b);
 const leaf=material(0x476a37,{side:THREE.DoubleSide}),lightLeaf=material(0x738944,{side:THREE.DoubleSide});
 let seed=731; const rand=()=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296; };
  function plant(x: number, y: number, z: number, size = 1) {
    mesh(new THREE.CylinderGeometry(0.105 * size, 0.078 * size, 0.18 * size, 18), terra, x, y + 0.09 * size, z, decor);
    mesh(new THREE.CylinderGeometry(0.112 * size, 0.112 * size, 0.026 * size, 18), terra, x, y + 0.177 * size, z, decor);
    mesh(new THREE.CylinderGeometry(0.094 * size, 0.094 * size, 0.01, 18), soil, x, y + 0.182 * size, z, decor);
    for (let branch = 0; branch < 9; branch++) {
      const angle = branch * 2.4;
      const top = [x + Math.cos(angle) * 0.16 * size, y + (0.38 + rand() * 0.2) * size, z + Math.sin(angle) * 0.16 * size];
      rod([x, y + 0.17 * size, z], top, 0.005 * size, stem, decor);
      for (let j = 0; j < 3; j++) {
        const m = mesh(leafGeometry, branch % 2 ? leaf : lightLeaf, top[0], top[1] - j * 0.07 * size, top[2], decor, [size * 0.8, size * 0.8, size * 0.8]);
        m.rotation.set(0.6 + j * 0.3, angle + j * 1.7, 0.45 + j * 0.5);
      }
    }
  }

 plant(0,0,0,1.25);
 return decor;
}

export function buildRug(): THREE.Group {
 const decor = new THREE.Group(); decor.name="Rug";
 const rug=mesh(new THREE.PlaneGeometry(1.1,0.86),new THREE.MeshStandardMaterial({map:rugTexture(),roughness:1,side:THREE.DoubleSide}),0,.012,0,decor);
 rug.rotation.x=-Math.PI/2; rug.castShadow=false;
 return decor;
}
