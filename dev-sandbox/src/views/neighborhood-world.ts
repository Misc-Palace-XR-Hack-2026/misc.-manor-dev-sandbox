import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CatalogRoom } from '../core/room-portal';
import type { RoomState, ObjectKind } from '../core/types';
import { getLayout, DEFAULT_LAYOUT_ID } from '../core/layout';
import { buildObject } from './objects';
import { surfaceTexture, surfaceGeometry } from './surface-textures';
import { collectIgnite, animateIgniteNodes } from './ignite-objects';
import { neighborhoodPlan, NEIGHBORHOOD_THEMES, NEIGHBORHOOD_CENTERPIECES, NEIGHBORHOOD_COURT_RADIUS, type NeighborhoodTheme } from '../core/neighborhood-plan';

export const NEIGHBORHOOD_SPAWN = new THREE.Vector3(0, 1.65, 33);
export interface Pavilion { id: string; label: string; group: THREE.Group; center: THREE.Vector3; doorway: THREE.Vector3; theme: NeighborhoodTheme }
/** One scene graph, in metres, shared by orthographic, first-person and XR cameras.
 * Preview models are capped, cached by kind and cloned with shared GPU resources.
 * No live RoomViews, media loaders, per-house lights or personal-state mutations. */
export class NeighborhoodWorld {
  readonly group = new THREE.Group();
  readonly pavilions: Pavilion[] = [];
  readonly street = new THREE.PerspectiveCamera(65, 1, .08, 220);
  readonly overview = new THREE.OrthographicCamera(-42, 42, 34, -34, .1, 240);
  mode: 'tactile' | 'dollhouse' = 'dollhouse';
  private controls: OrbitControls | null = null;
  private models = new Map<ObjectKind, THREE.Group>();
  private materials = new Map<number, THREE.MeshStandardMaterial>();
  private box = new THREE.BoxGeometry(1, 1, 1);
  private keys = new Set<string>();
  private drag: { x: number; y: number; startX: number; startY: number } | null = null;
  private destination: THREE.Vector3 | null = null;
  private yaw = 0;
  private pitch = -.03;
  private last = 0;
  private reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private centerpieceNodes: THREE.Object3D[] = [];
  readonly courts: {theme:NeighborhoodTheme;branch:number;center:readonly number[];count:number}[] = [];
  readonly viewerPosition = new THREE.Vector3();
  private courtLights: THREE.PointLight[]=[];
  private surfaceMaterials = new Map<string,THREE.MeshStandardMaterial>();
  surfaceError = false;
  private overviewCenter = new THREE.Vector3();
  private overviewHeight = 59;
  private boundX = 55;
  private boundZ = 52;
  private abort = new AbortController();
  private ray = new THREE.Raycaster();
  constructor(catalog: CatalogRoom[], personal: RoomState, private enter: (id: string) => void) {
    this.group.name = 'shared-neighborhood-world';
    const sky = new THREE.HemisphereLight(0xfff5df, 0x8a7958, 2.2);
    const sun = new THREE.DirectionalLight(0xffead1, 2.5); sun.position.set(-15, 32, 24);
    this.group.add(sky, sun, sun.target);
    this.street.position.copy(NEIGHBORHOOD_SPAWN);
    this.overview.position.set(84, 94, 104);
    this.overview.lookAt(0, 0, 0);
    const plan = neighborhoodPlan(catalog, personal);
    for(const theme of Object.keys(NEIGHBORHOOD_THEMES) as NeighborhoodTheme[]){
      const entries=plan.filter(p=>p.theme===theme);const branches=[...new Set(entries.map(p=>p.branch))];
      for(const branch of branches.length?branches:[0]){const members=entries.filter(p=>p.branch===branch);this.courts.push({theme,branch,center:members[0]?.court??NEIGHBORHOOD_THEMES[theme].center,count:members.length});}
    }
    const xs=plan.map(p=>p.position[0]),zs=plan.map(p=>p.position[1]);
    if(plan.length){this.overviewCenter.set((Math.min(...xs)+Math.max(...xs))/2,0,(Math.min(...zs)+Math.max(...zs))/2);this.overviewHeight=Math.max(59,(Math.max(...xs)-Math.min(...xs))*.52,(Math.max(...zs)-Math.min(...zs))*.7);}
    this.overview.position.copy(this.overviewCenter).add(new THREE.Vector3(84,94,104));this.overview.lookAt(this.overviewCenter);
    this.boundX = Math.max(55, ...plan.map(p => Math.abs(p.position[0]) + 7));
    this.boundZ = Math.max(52, ...plan.map(p => Math.abs(p.position[1]) + 7));
    this.makeBox(this.group, 0, -.48, 0, this.boundX * 2, .9, this.boundZ * 2, 0xa3af78);
    this.makeBox(this.group, 0, -.99, 0, this.boundX * 2 + 1, .25, this.boundZ * 2 + 1, 0x9a7657);
    this.makeBox(this.group, 0, .015, 0, 5, .045, this.boundZ * 2 - 2, 0xcaba9c);
    for (const court of this.courts) {
      const theme=court.theme, area=NEIGHBORHOOD_THEMES[theme], suffix=court.branch?'-'+court.branch:'';
      const radius = NEIGHBORHOOD_COURT_RADIUS;
      const [x,z] = court.center;
      const disk = (r: number, y: number, color: number) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .055, 40), this.mat(color)); mesh.position.set(x,y,z); this.group.add(mesh);
      };
      disk(radius + 5, -.015, area.ground);
      disk(radius - 3.5, .025, 0xd6c7a7);
      disk(Math.max(3, radius - 6.5), .06, area.ground);
      // Each cul-de-sac joins one continuous central promenade via its open mouth.
      this.makeBox(this.group, x / 2, .025, z+24, Math.abs(x), .06, 4, 0xd6c7a7);
      this.makeBox(this.group, x, .035, z+15.5, 4, .06, 17, 0xd6c7a7);
      const light = new THREE.PointLight(area.light, 38, radius + 8, 2); light.position.set(x, 4, z); light.castShadow = false; this.group.add(light); this.courtLights.push(light);
      this.makeBox(this.group,x, .45,z, 2.6,.9,2.6,area.color);
      const centerpiece = buildObject(NEIGHBORHOOD_CENTERPIECES[theme as NeighborhoodTheme]);
      centerpiece.name = 'court-centerpiece-' + theme + suffix;
      centerpiece.position.set(x, .92, z); centerpiece.scale.multiplyScalar(2.1);
      // One bounded court light already exists: remove model lights rather than adding four shadow rigs.
      const lights: THREE.Object3D[]=[];centerpiece.traverse(o=>{if(o instanceof THREE.Light)lights.push(o);});lights.forEach(o=>o.removeFromParent());
      this.group.add(centerpiece); this.centerpieceNodes.push(...collectIgnite(centerpiece));
      const plaque=new THREE.Group();plaque.name='court-sign-'+theme+suffix;plaque.position.set(x,0,z+3);this.group.add(plaque);
      this.makeBox(plaque,0,.66,0,.16,1.32,.16,0x80664e);
      this.sign(plaque,area.label+(court.branch?' · '+(court.branch+1):''),0,1.7,.1,3.8,.65);
    }
    plan.forEach(entry => {
      const room = catalog.find(r => r.id === entry.id)!;
      const [x,z] = entry.position;
      const group = new THREE.Group(); group.position.set(x,.08,z);group.rotation.y=entry.rotation;
      group.name = room.id;group.userData.roomId=room.id;this.group.add(group);
      this.pavilions.push({id:room.id,label:room.label,group,center:new THREE.Vector3(x,1.4,z),doorway:new THREE.Vector3(entry.spawn[0],1.65,entry.spawn[1]),theme:entry.theme});
      this.pavilion(group,room,room.data??personal);
      this.makeBox(group,0,-.04,4.3,2.1,.05,2.5,0xe4d4b5);
    });
    // Faceted trees frame sightlines, never hide the open-front entrances.
    for (let i = 0; i < 28; i++) {
      const x = i < 20 ? (i % 2 ? -this.boundX + 2 : this.boundX - 2) : (i % 2 ? -5 : 5);
      const z = i < 20 ? -32 + Math.floor(i / 2) * 7 : -22 + Math.floor((i - 20) / 2) * 15;
      this.tree(x, z, (i < 20 ? 1 : .68) * (.8 + (i % 4) * .16));
    }
    // Warm low-poly rolling land outside the walkable district.
    const hillGeometry = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 18; i++) {
      const angle = i / 18 * Math.PI * 2;
      const hill = new THREE.Mesh(hillGeometry, this.mat(i % 2 ? 0xc7b086 : 0xbdb98b));
      const square = Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
      hill.position.set(Math.cos(angle) / square * (this.boundX + 30), -1.4, Math.sin(angle) / square * (this.boundZ + 30));
      hill.scale.set(17 + i % 3 * 4, 5 + i % 4 * 2, 15); this.group.add(hill);
    }
    // Benches and warm lamp posts along the promenade, without costly point lights.
    for (const z of [-27, -12, 3, 18, 31]) {
      for (const x of [-3.8, 3.8]) {
        this.makeBox(this.group, x, .38, z, .18, .75, 1.9, 0x645448);
        this.makeBox(this.group, x, .78, z, .65, .16, 1.9, 0xb18b5e);
        this.makeBox(this.group, x, 1.04, z - 1.6, .1, 2.1, .1, 0x55534a);
        this.makeBox(this.group, x, 2.16, z - 1.6, .36, .38, .36, 0xffdd9b);
      }
    }
    const trailhead = new THREE.Group(); trailhead.name = 'neighborhood-home-trailhead';
    trailhead.userData.roomId = 'home'; trailhead.position.set(-3.2, 0, 31);
    this.group.add(trailhead);
    this.makeBox(trailhead, 0, .575, 0, .16, 1.15, .16, 0x80664e);
    this.sign(trailhead, '← My room · select to return', 0, 1.5, .09, 2.5, .6);
    this.group.updateMatrixWorld(true);
  }
  private sign(parent: THREE.Group, text: string, x: number, y: number, z: number, width: number, height: number) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 80;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#f1dfbd'; c.fillRect(0, 0, 512, 80);
    c.fillStyle = '#483e35'; c.font = 'bold 29px sans-serif'; c.textAlign = 'center';
    c.fillText(text.length > 28 ? text.slice(0, 27) + '…' : text, 256, 51);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide }));
    this.makeBox(parent, x, y, z - .075, width + .1, height + .1, .13, 0x80664e);
    sign.name = 'neighborhood-sign-front'; sign.userData.text = text;
    sign.position.set(x, y, z); parent.add(sign);
    // Each side has outward-facing glyph UVs. DoubleSide alone mirrors the back text.
    const back = sign.clone(); back.name = 'neighborhood-sign-back';
    back.rotation.y = Math.PI; back.position.z -= .15; parent.add(back);
  }
  private mat(color: number) {
    let mat = this.materials.get(color);
    if (!mat) { mat = new THREE.MeshStandardMaterial({ color, roughness: .9 }); this.materials.set(color, mat); }
    return mat;
  }
  private makeBox(parent: THREE.Group, x: number, y: number, z: number, w: number, h: number, d: number, color: number) {
    const mesh = new THREE.Mesh(this.box, this.mat(color));
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  private pavilion(g: THREE.Group, room: CatalogRoom, data: RoomState) {
    const layout=getLayout(data.layoutId) ?? getLayout(DEFAULT_LAYOUT_ID)!;
    const interior=new THREE.Group();interior.name='preview-interior';
    interior.userData.layoutId=layout.id;interior.userData.layoutBoxIds=layout.boxes.map(b=>b.id);
    const minX=Math.min(...layout.boxes.map(b=>b.min[0])),maxX=Math.max(...layout.boxes.map(b=>b.min[0]+b.size[0]));
    const minZ=Math.min(...layout.boxes.map(b=>b.min[2])),maxZ=Math.max(...layout.boxes.map(b=>b.min[2]+b.size[2]));
    // Uniform miniature transform only. Every interior coordinate remains the real room coordinate.
    interior.scale.setScalar(.8);interior.position.set(-(minX+maxX)/2*.8,0,-(minZ+maxZ)/2*.8);g.add(interior);
    for(const target of ['wall','floor','accent'] as const){
      const boxes=layout.boxes.filter(b=>b.material===target);if(!boxes.length)continue;
      const selection=target==='accent'?undefined:data.surfaces?.[target];
      const key=target+':'+JSON.stringify(selection??layout.palette[target]);let material=this.surfaceMaterials.get(key);
      if(!material){
        material=new THREE.MeshStandardMaterial({color:selection?0xffffff:layout.palette[target],roughness:.95});
        if(selection&&target!=='accent'&&typeof document!=='undefined'){material.map=surfaceTexture(target,selection,()=>{this.surfaceError=true;});material.map.anisotropy=2;}
        this.surfaceMaterials.set(key,material);
      }
      // Batch actual layout boxes by material, retaining all stairs, loft, railings and structural parts.
      const parts=boxes.map(box=>{const geometry=surfaceGeometry(box.size,box.min);geometry.translate(box.min[0]+box.size[0]/2,box.min[1]+box.size[1]/2,box.min[2]+box.size[2]/2);return geometry;});
      const merged=mergeGeometries(parts,false)!;parts.forEach(part=>part.dispose());
      const mesh=new THREE.Mesh(merged,material);mesh.name='layout-'+target;mesh.receiveShadow=true;
      mesh.userData.layoutBoxIds=boxes.map(b=>b.id);mesh.userData.sourceRoomId=data.id;
      if(target!=='accent'){mesh.userData.surface=target;mesh.userData.surfaceSelection=selection;}
      interior.add(mesh);
    }
    for(const placement of data.placements){
      const rep=data.representations.find(r=>r.id===placement.representationId),slot=layout.slots.find(s=>s.id===placement.slotId);
      if(!rep||!slot)continue;
      let prototype=this.models.get(rep.objectKind);
      if(!prototype){prototype=buildObject(rep.objectKind);const lights:THREE.Object3D[]=[];prototype.traverse(o=>{if(o instanceof THREE.Light)lights.push(o);});lights.forEach(o=>o.removeFromParent());this.models.set(rep.objectKind,prototype);}
      const model=prototype.clone(true);model.name=rep.id;model.userData.repId=rep.id;model.userData.objectKind=rep.objectKind;model.userData.slotId=slot.id;
      model.position.set(...slot.pos);model.rotation.y=Math.PI/4;interior.add(model);
    }
    // This is an exterior address sign, not furniture invented inside the room.
    this.makeBox(g,-2.8,.575,4.15,.12,1.15,.12,0x80664e);
    this.sign(g,room.label,-2.8,1.5,4.2,3,.6);
  }

  private tree(x: number, z: number, scale: number) {
    this.makeBox(this.group, x, 1, z, .3, 2, .3, 0x81664b);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.55, 0), this.mat(z % 2 ? 0x71864e : 0x859b5d));
    crown.position.set(x, 2.65, z); crown.scale.set(scale, scale * 1.2, scale); this.group.add(crown);
  }
  spawnOutside(id: string | null): void {
    const pavilion = this.pavilions.find(p => p.id === (id ?? 'home')) ?? this.pavilions.find(p => p.id === 'home');
    if (pavilion) this.setStreetPose(pavilion.doorway, pavilion.group.rotation.y + Math.PI + Math.PI / 4);
    this.viewerPosition.copy(this.street.position);this.tick(0);
  }
  get camera() { return this.mode === 'dollhouse' ? this.overview : this.street; }
  setStreetPose(position: THREE.Vector3, yaw: number) {
    this.street.position.copy(position).setY(1.65); this.yaw = yaw; this.street.rotation.set(this.pitch, yaw, 0, 'YXZ'); this.destination = null;
  }
  setMode(mode: 'tactile' | 'dollhouse') { this.mode = mode; if (this.controls) this.controls.enabled = mode === 'dollhouse'; }
  resize(w: number, h: number) {
    const aspect = w / Math.max(1, h);
    this.overview.left = -this.overviewHeight * aspect; this.overview.right = this.overviewHeight * aspect;
    this.overview.top = this.overviewHeight; this.overview.bottom = -this.overviewHeight;
    this.overview.far = Math.max(240,this.boundX*4+this.boundZ*2);this.street.far=this.overview.far; this.overview.updateProjectionMatrix();
    this.street.aspect = aspect; this.street.updateProjectionMatrix();
  }
  /** Exterior walkability only: never teleport into a wall, furnishing or off the land. */
  walkable(point: THREE.Vector3): boolean {
    if (this.courts.some(area => Math.hypot(point.x - area.center[0], point.z - area.center[1]) < 3.5)) return false;
    return Math.abs(point.x) < this.boundX - 1 && Math.abs(point.z) < this.boundZ - 1 && !this.pavilions.some(p => { const local = p.group.worldToLocal(point.clone()); return Math.abs(local.x) < 4.7 && Math.abs(local.z) < 3.7; });
  }
  pick(ray: THREE.Raycaster): { id?: string; point: THREE.Vector3 } | null {
    const hit = ray.intersectObject(this.group, true)[0];
    if (!hit) return null;
    let object: THREE.Object3D | null = hit.object;
    while (object && !object.userData.roomId) object = object.parent;
    if (object) return { id: object.userData.roomId, point: hit.point };
    return this.walkable(hit.point) && hit.point.y < .15 ? { point: hit.point } : null;
  }
  visit(id: string) { if (this.pavilions.some(p => p.id === id)) this.enter(id); }
  mount(canvas: HTMLCanvasElement) {
    this.controls = new OrbitControls(this.overview, canvas);
    this.controls.target.copy(this.overviewCenter); this.controls.enableRotate = true;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    this.controls.minZoom = .65; this.controls.maxZoom = 6; this.controls.enabled = this.mode === 'dollhouse';
    this.controls.update();
    const options = { signal: this.abort.signal };
    const blocked = () => Boolean(document.querySelector('dialog[open]'));
    window.addEventListener('keydown', e => {
      if (blocked() || (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
      if (/^(w|a|s|d|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/i.test(e.key)) { this.keys.add(e.key.toLowerCase()); e.preventDefault(); }
    }, options);
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()), options);
    window.addEventListener('blur', () => this.keys.clear(), options);
    canvas.addEventListener('pointerdown', e => { if (blocked()) return; this.drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY }; }, options);
    canvas.addEventListener('pointermove', e => {
      if (!this.drag || this.mode !== 'tactile') return;
      this.yaw -= (e.clientX - this.drag.x) * .004;
      this.pitch = THREE.MathUtils.clamp(this.pitch - (e.clientY - this.drag.y) * .004, -.8, .65);
      this.drag.x = e.clientX; this.drag.y = e.clientY; this.destination = null;
    }, options);
    canvas.addEventListener('pointercancel', () => { this.drag = null; }, options);
    canvas.addEventListener('pointerup', e => {
      const drag = this.drag; this.drag = null;
      if (!drag || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 7 || blocked()) return;
      const rect = canvas.getBoundingClientRect();
      this.ray.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), this.camera);
      const hit = this.pick(this.ray);
      if (hit?.id) this.visit(hit.id);
      else if (hit && this.mode === 'tactile') this.destination = hit.point;
    }, options);
  }
  tick(now: number, immersive = false) {
    animateIgniteNodes(this.centerpieceNodes, now, this.reducedMotion);
    const viewer=immersive?this.viewerPosition:this.street.position;
    const nearby=new Set([...this.courtLights].sort((a,b)=>a.position.distanceToSquared(viewer)-b.position.distanceToSquared(viewer)).slice(0,4));
    for(const light of this.courtLights)light.visible=nearby.has(light);
    const dt = this.last ? Math.min(.05, now - this.last) : 0; this.last = now;
    if (immersive) { this.keys.clear(); return; }
    if (this.mode === 'dollhouse') { this.controls?.update(); return; }
    this.street.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    const forward = Number(this.keys.has('w') || this.keys.has('arrowup')) - Number(this.keys.has('s') || this.keys.has('arrowdown'));
    const side = Number(this.keys.has('d') || this.keys.has('arrowright')) - Number(this.keys.has('a') || this.keys.has('arrowleft'));
    const step = new THREE.Vector3(side, 0, -forward).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    if (forward || side) this.destination = null;
    else if (this.destination) { step.subVectors(this.destination, this.street.position); step.y = 0; if (step.length() < .2) this.destination = null; }
    if (step.lengthSq()) {
      step.normalize().multiplyScalar(dt * 4);
      const next = this.street.position.clone().add(step);
      if (this.walkable(next)) this.street.position.copy(next);
      else this.destination = null;
    }
  }
  dispose() {
    this.abort.abort(); this.controls?.dispose();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    const collect = (o: THREE.Object3D) => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { materials.add(m); for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value); } } };
    this.group.traverse(collect); this.models.forEach(model => model.traverse(collect));
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    this.group.removeFromParent(); this.group.clear(); this.models.clear(); this.materials.clear(); this.surfaceMaterials.clear(); this.centerpieceNodes=[];
  }
}
