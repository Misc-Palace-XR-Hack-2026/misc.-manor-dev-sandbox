import * as THREE from 'three';
import { surfaceTexture, surfaceGeometry } from './surface-textures';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Store } from '../core/store';
import type { ObjectKind } from '../core/types';
import { buildObject } from './objects';
import { disposeGroup } from './resources';
import { LIGHTING_PRESETS } from '../core/appearance';

// Thin 3D adapter: draws store.state and sends clicks back as store commands. Holds no truth of its own.
// Replaceable later (IWSDK, Babylon) as long as the store contract stays the same.

const VIEW_HEIGHT = 11; // orthographic frustum height, world units
const YAW = Math.PI / 4; // objects face the isometric camera

interface Entry {
  group: THREE.Group;
  kind: ObjectKind;
  contentKey: string;
  target: THREE.Vector3;
}

export class RoomView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private controls: OrbitControls;
  private objectsGroup = new THREE.Group();
  private markerGroup = new THREE.Group();
  private objects = new Map<string, Entry>();
  private markers = new Map<string, THREE.Mesh>();
  private raycaster = new THREE.Raycaster();
  private tooltip: HTMLDivElement;
  private downAt: { x: number; y: number } | null = null;
  private layoutId = '';
  private surfaceKey = '';
  private surfaceError = document.createElement('p');
  private lightingKey: string | null = null;
  private hemi = new THREE.HemisphereLight(0xffffff, 0xd9a47a, 1.7);
  private sun = new THREE.DirectionalLight(0xfff1dc, 2.1);
  private lamp = new THREE.PointLight(0xffd8a8, 0, 6, 2);
  private roomGroup = new THREE.Group();
  private isoOffset = new THREE.Vector3(14, 14, 14);
  private inspectHome: { target: THREE.Vector3; offset: THREE.Vector3; zoom: number } | null = null;
  private inspectGoal = new THREE.Vector3();
  private inspectZoom = 1;

  constructor(private container: HTMLElement, private store: Store) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.surfaceError.className = 'surface-render-error';
    this.surfaceError.setAttribute('role','alert');
    this.surfaceError.hidden = true;
    container.appendChild(this.surfaceError);

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip';
    this.tooltip.hidden = true;
    container.appendChild(this.tooltip);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);
    const target = new THREE.Vector3(3, 1.6, 3);
    this.camera.position.copy(target).add(new THREE.Vector3(14, 14, 14)); // true isometric angle
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(target);
    this.controls.enableDamping = true;
    this.controls.screenSpacePanning = true;
    this.controls.minZoom = 0.6;
    this.controls.maxZoom = 3;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.update();

    this.scene.add(this.roomGroup, this.objectsGroup, this.markerGroup);
    this.addLights();

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => (this.downAt = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => this.onPointerUp(e));
    el.addEventListener('pointermove', (e) => this.onHover(e));
    el.addEventListener('pointerleave', () => (this.tooltip.hidden = true));

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();

    this.store.subscribe(() => this.sync());
    this.sync();
    this.renderer.setAnimationLoop((t) => this.tick(t / 1000));
  }

  // ---- scene setup ------------------------------------------------------
  private addLights(): void {
    this.scene.add(this.hemi, this.lamp);
    this.lamp.position.set(5.6, 1.4, 3.7);
    const sun = this.sun;
    sun.position.set(8, 13, -7); // from behind the right wall so the window frames throw shadows into the room
    sun.target.position.set(3, 0, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -11; c.right = 11; c.top = 11; c.bottom = -11; c.near = 1; c.far = 50;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target);

    // Invisible ground that only shows the room's shadow, like the reference render.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.22 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(3, -1.4, 3);
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  private buildLayout(): void {
    const layout = this.store.layout;
    this.layoutId = layout.id;
    const palette = layout.palette;
    if (this.scene.background instanceof THREE.Texture) this.scene.background.dispose();
    this.surfaceError.hidden = true;
    const surfaces = this.store.state.surfaces;
    const error = () => {
      this.surfaceError.textContent = 'A saved surface image could not be decoded. Choose Original or upload another PNG/JPEG. Your room data is unchanged.';
      this.surfaceError.hidden = false;
    };
    this.scene.background = surfaces?.background ? surfaceTexture('background',surfaces.background,error) : new THREE.Color(palette.background);
    this.fitBackground();
    disposeGroup(this.roomGroup);
    const materials = {
      wall: new THREE.MeshStandardMaterial({ color: palette.wall, roughness: 0.95 }),
      floor: new THREE.MeshStandardMaterial({ color: palette.floor, roughness: 0.95 }),
      accent: new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.9 }),
    };
    for (const target of ['floor','wall'] as const) {
      const selection = surfaces?.[target];
      if (selection) { materials[target].map = surfaceTexture(target,selection,error); materials[target].color.setHex(0xffffff); }
    }
    for (const b of layout.boxes) {
      const mesh = new THREE.Mesh(surfaceGeometry(b.size,b.min), materials[b.material]);
      mesh.position.set(b.min[0] + b.size[0] / 2, b.min[1] + b.size[1] / 2, b.min[2] + b.size[2] / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.roomGroup.add(mesh);
    }
    this.markers.clear();
    disposeGroup(this.markerGroup);
    for (const slot of layout.slots) {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(0.3, 28),
        new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.5, depthWrite: false }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(slot.pos[0], slot.pos[1] + 0.03, slot.pos[2]);
      m.userData.slotId = slot.id;
      this.markers.set(slot.id, m);
      this.markerGroup.add(m);
    }
  }

  // Screen-space cover: never stretch a photo or assume it is a panorama.
  private fitBackground(): void {
    const texture = this.scene.background;
    if (!(texture instanceof THREE.Texture)) return;
    const image = texture.image as {width?:number;height?:number};
    if (!image?.width || !image?.height) return;
    const aspect = this.container.clientWidth / (this.container.clientHeight || 1);
    const imageAspect = image.width / image.height;
    texture.repeat.set(Math.min(1,aspect/imageAspect), Math.min(1,imageAspect/aspect));
    texture.offset.set((1-texture.repeat.x)/2,(1-texture.repeat.y)/2);
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.left = (-VIEW_HEIGHT * aspect) / 2;
    this.camera.right = (VIEW_HEIGHT * aspect) / 2;
    this.camera.top = VIEW_HEIGHT / 2;
    this.camera.bottom = -VIEW_HEIGHT / 2;
    this.camera.updateProjectionMatrix();
  }

  // ---- state -> scene ---------------------------------------------------
  private sync(): void {
    const surfaceKey = JSON.stringify(this.store.state.surfaces ?? {});
    if (this.layoutId !== this.store.layout.id || this.surfaceKey !== surfaceKey) {
      this.surfaceKey = surfaceKey;
      this.buildLayout();
    }
    const key = this.store.state.lighting ?? '';
    if (this.lightingKey !== key) {
      this.lightingKey = key;
      const p = this.store.state.lighting ? LIGHTING_PRESETS[this.store.state.lighting] : null;
      this.sun.color.setHex(p?.sunColor ?? 0xfff1dc); this.sun.intensity=p?.sunIntensity ?? 2.1;
      this.hemi.color.setHex(p?.hemiSky ?? 0xffffff);this.hemi.groundColor.setHex(p?.hemiGround ?? 0xd9a47a);this.hemi.intensity=p?.hemiIntensity ?? 1.7;
      this.lamp.color.setHex(p?.lampColor ?? 0xffd8a8);this.lamp.intensity=p?.lampIntensity ?? 0;
    }
    const { state, layout } = this.store;
    const live = new Set<string>();

    for (const rep of state.representations) {
      const slotId = this.store.slotOf(rep.id);
      const slot = layout.slots.find((s) => s.id === slotId);
      if (!slot) continue; // unplaced: lives in the menu until it is put down
      live.add(rep.id);
      const content=this.store.content(rep.contentItemId);
      const contentKey=JSON.stringify([content?.title,content?.imageData]);
      let entry = this.objects.get(rep.id);
      if (entry && (entry.kind !== rep.objectKind || entry.contentKey !== contentKey)) {
        disposeGroup(entry.group);
        this.objectsGroup.remove(entry.group);
        this.objects.delete(rep.id);
        entry = undefined;
      }
      if (!entry) {
        const group = buildObject(rep.objectKind, content);
        group.rotation.y = YAW;
        group.position.set(slot.pos[0], slot.pos[1], slot.pos[2]);
        group.userData.repId = rep.id;
        this.objectsGroup.add(group);
        entry = { group, kind: rep.objectKind, contentKey, target: new THREE.Vector3() };
        this.objects.set(rep.id, entry);
      }
      entry.target.set(slot.pos[0], slot.pos[1], slot.pos[2]);
    }
    for (const [id, entry] of this.objects) {
      if (!live.has(id)) {
        disposeGroup(entry.group);
        this.objectsGroup.remove(entry.group);
        this.objects.delete(id);
      }
    }

    this.markerGroup.visible = this.store.selectedId !== null && !(this.isPhone() && this.objects.has(this.store.selectedId));
    for (const [slotId, m] of this.markers) {
      const occupant = this.store.repAt(slotId);
      const color = !occupant ? 0xfff2b0 : occupant === this.store.selectedId ? 0x9be39b : 0xff9ec4;
      (m.material as THREE.MeshBasicMaterial).color.setHex(color);
    }
  }

  private tick(t: number): void {
    const selected = this.store.selectedId;
    for (const [id, e] of this.objects) {
      const bob = id === selected ? 0.2 + Math.sin(t * 4) * 0.05 : 0;
      const p = e.group.position;
      p.x += (e.target.x - p.x) * 0.22;
      p.z += (e.target.z - p.z) * 0.22;
      p.y += (e.target.y + bob - p.y) * 0.22;
      e.group.rotation.y = YAW + (id === selected ? Math.sin(t * 2) * 0.25 : 0);
    }
    if (this.markerGroup.visible) {
      const pulse = 0.4 + Math.sin(t * 5) * 0.12;
      for (const m of this.markers.values()) (m.material as THREE.MeshBasicMaterial).opacity = pulse;
    }
    const inspecting = this.isPhone() && Boolean(this.store.selectedId && this.objects.has(this.store.selectedId));
    if (!inspecting) this.controls.update();
    this.frameSelection();
    this.fitBackground();
    this.renderer.render(this.scene, this.camera);
  }

  private isPhone(): boolean {
    return window.matchMedia('(max-width: 720px)').matches;
  }

  private frameSelection(): void {
    const roomEl = this.container;
    const selected = this.store.selectedId;
    const entry = selected ? this.objects.get(selected) : undefined;
    const inspecting = this.isPhone() && Boolean(entry);
    if (!inspecting || !entry) {
      delete roomEl.dataset.inspectX;
      delete roomEl.dataset.inspectY;
      if (this.inspectHome) {
        this.controls.target.lerp(this.inspectHome.target, 0.18);
        this.camera.position.lerp(this.inspectHome.target.clone().add(this.inspectHome.offset), 0.18);
        this.camera.zoom += (this.inspectHome.zoom - this.camera.zoom) * 0.18;
        this.camera.updateProjectionMatrix();
        if (this.controls.target.distanceTo(this.inspectHome.target) < 0.04) {
          this.controls.target.copy(this.inspectHome.target);
          this.camera.position.copy(this.inspectHome.target).add(this.inspectHome.offset);
          this.camera.zoom = this.inspectHome.zoom;
          this.camera.updateProjectionMatrix();
          this.inspectHome = null;
        }
      }
      this.controls.enabled = true;
      return;
    }

    if (!this.inspectHome) {
      this.inspectHome = {
        target: this.controls.target.clone(),
        offset: this.camera.position.clone().sub(this.controls.target),
        zoom: this.camera.zoom,
      };
    }

    const zoom = 1.7;
    this.inspectGoal.copy(entry.group.position);
    this.inspectZoom = zoom;
    this.controls.target.lerp(this.inspectGoal, 0.22);
    this.camera.position.lerp(this.inspectGoal.clone().add(this.isoOffset), 0.22);
    this.camera.zoom += (this.inspectZoom - this.camera.zoom) * 0.22;
    this.camera.updateProjectionMatrix();
    this.controls.enabled = false;

    const ndc = entry.group.position.clone().project(this.camera);
    roomEl.dataset.inspectX = String((ndc.x + 1) / 2);
    roomEl.dataset.inspectY = String((1 - ndc.y) / 2);
  }

  // ---- input ------------------------------------------------------------
  private ray(e: PointerEvent): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  private repIdAt(e: PointerEvent): string | null {
    this.ray(e);
    const hit = this.raycaster.intersectObjects(this.objectsGroup.children, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !o.userData.repId) o = o.parent;
    return (o?.userData.repId as string | undefined) ?? null;
  }

  private slotIdAt(e: PointerEvent): string | null {
    this.ray(e);
    const hit = this.raycaster.intersectObjects(this.markerGroup.children, false)[0];
    return (hit?.object.userData.slotId as string | undefined) ?? null;
  }

  private onPointerUp(e: PointerEvent): void {
    const d = this.downAt;
    this.downAt = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return; // it was an orbit drag
    const selected = this.store.selectedId;
    if (selected) {
      const slotId = this.slotIdAt(e);
      if (slotId) {
        this.store.place(selected, slotId);
        this.store.select(null);
        return;
      }
    }
    const repId = this.repIdAt(e);
    this.store.select(repId && repId !== selected ? repId : null);
  }

  private onHover(e: PointerEvent): void {
    if (this.downAt) return;
    const repId = this.repIdAt(e);
    const rep = repId ? this.store.state.representations.find((r) => r.id === repId) : undefined;
    const content = rep ? this.store.content(rep.contentItemId) : undefined;
    const slotOver = this.store.selectedId ? this.slotIdAt(e) : null;
    this.renderer.domElement.style.cursor = repId || slotOver ? 'pointer' : 'grab';
    if (!content) {
      this.tooltip.hidden = true;
      return;
    }
    const r = this.container.getBoundingClientRect();
    this.tooltip.textContent = `${content.title}  (${content.type})`;
    this.tooltip.style.left = `${e.clientX - r.left + 14}px`;
    this.tooltip.style.top = `${e.clientY - r.top + 14}px`;
    this.tooltip.hidden = false;
  }
}
