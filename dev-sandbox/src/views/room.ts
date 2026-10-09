import * as THREE from 'three';
import { surfaceTexture, surfaceGeometry } from './surface-textures';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Store } from '../core/store';
import type { ObjectKind } from '../core/types';
import type { RoomLayout } from '../core/layout';
import { buildObject } from './objects';
import { disposeGroup } from './resources';
import { LIGHTING_PRESETS } from '../core/appearance';
import { buildPreview, type Preview } from '../core/preview';
import { PreviewCardView } from './preview-card';
import { mediaArt, type MediaArt } from '../core/media-art';

// Thin 3D adapter: draws store.state and sends clicks back as store commands. Holds no truth of its own.
// Replaceable later (IWSDK, Babylon) as long as the store contract stays the same.

const YAW = Math.PI / 4; // objects face the isometric camera
const HOVER_DWELL_MS = 400; // tooltip appears only after the pointer rests on an object

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
  private viewHeight = 11; // orthographic frustum height, world units; set per layout
  private ground!: THREE.Mesh;
  private hoverTimer: number | undefined;
  private hoverRep: string | null = null;
  private card: PreviewCardView;
  private cardAnchor = new THREE.Vector3();
  private cardKey = '';
  private cardPreview: Preview | null = null;
  private cardArt: MediaArt | null = null;

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
    // On the body, not inside the room: the item sheet and menus are body-level siblings of the room and would
    // otherwise paint over the card. The room fills the viewport, so room pixels and viewport pixels are the same.
    this.card = new PreviewCardView(document.body);

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
    el.addEventListener('pointerleave', () => this.hideTooltip());
    // Esc backs out of whatever is in hand; a held object returns to where it came from.
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || this.store.selectedId === null) return;
      const t = e.target;
      if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      this.store.select(null);
    });

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();

    this.store.subscribe(() => this.sync());
    this.sync();
    this.renderer.setAnimationLoop((t) => this.tick(t / 1000));
    // The card follows the item sheet on its own frame loop, not the 3D one. The sheet's size changes as its content
    // fills in, and a hiccup in rendering must never leave the card stuck at a stale spot over the sheet.
    const followSheet = () => {
      try { this.updatePreviewCard(); } catch (err) { console.error('preview card', err); }
      requestAnimationFrame(followSheet);
    };
    requestAnimationFrame(followSheet);
  }

  /** Render and copy synchronously before WebGL discards its drawing buffer. */
  capturePhoto(): Promise<Blob> {
    const visible = this.markerGroup.visible;
    this.markerGroup.visible = false;
    const copy = document.createElement('canvas');
    try {
      this.renderer.render(this.scene, this.camera);
      copy.width = this.renderer.domElement.width;
      copy.height = this.renderer.domElement.height;
      const context = copy.getContext('2d');
      if (!context) throw new Error('PNG capture is unavailable.');
      context.drawImage(this.renderer.domElement, 0, 0);
    } finally {
      this.markerGroup.visible = visible;
    }
    return new Promise((resolve, reject) => copy.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed.')), 'image/png'));
  }

  // ---- scene setup ------------------------------------------------------
  private addLights(): void {
    this.scene.add(this.hemi, this.lamp);
    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -14; c.right = 14; c.top = 14; c.bottom = -14; c.near = 1; c.far = 60;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target);

    // Invisible ground that only shows the room's shadow, like the reference render.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.22 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.ground = ground;
    this.scene.add(ground);
  }

  /** Aim camera, lights and shadow ground at a layout's focus point and size the frustum to its room. */
  private frameLayout(layout: RoomLayout): void {
    const [fx, fy, fz] = layout.focus;
    const focus = new THREE.Vector3(fx, fy, fz);
    this.viewHeight = layout.viewHeight;
    this.inspectHome = null;
    this.camera.zoom = 1;
    this.controls.target.copy(focus);
    this.camera.position.copy(focus).add(this.isoOffset);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.lamp.distance = 10;
    this.lamp.position.set(fx + 1, 1.4, fz);
    this.sun.position.set(fx + 5, 13, fz - 10); // from behind the right wall so window frames throw shadows into the room
    this.sun.target.position.set(fx, 0, fz);
    this.ground.position.set(fx, -1.4, fz);
    this.resize();
  }

  private buildLayout(): void {
    const layout = this.store.layout;
    if (this.layoutId !== layout.id) this.frameLayout(layout);
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
    this.camera.left = (-this.viewHeight * aspect) / 2;
    this.camera.right = (this.viewHeight * aspect) / 2;
    this.camera.top = this.viewHeight / 2;
    this.camera.bottom = -this.viewHeight / 2;
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

    const held = this.store.holding !== null;
    this.markerGroup.visible = held || (this.store.selectedId !== null && !this.objects.has(this.store.selectedId));
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
    const inspecting = Boolean(this.store.selectedId && this.objects.has(this.store.selectedId));
    if (!inspecting) this.controls.update();
    this.frameSelection();
    this.fitBackground();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Floating preview above the selected object. It is anchored to the object's slot, not its animated position,
   * so it stays steady while the object bobs and turns. Needs the camera matrices from this frame's render.
   */
  private updatePreviewCard(): void {
    const id = this.store.selectedId;
    const entry = id ? this.objects.get(id) : undefined;
    const rep = id ? this.store.state.representations.find((r) => r.id === id) : undefined;
    const content = rep ? this.store.content(rep.contentItemId) : undefined;
    // Every preview kind docks above the item sheet (bottom right) so it sits still and is easy to reach. Without the
    // sheet it floats over the object. An object that is selected but not placed yet has nowhere to float, so it
    // only shows when the sheet is there.
    const sheet = document.querySelector<HTMLElement>('.item-sheet:not([hidden])');
    if (!content || (!entry && !sheet)) { this.card.show(null); return; }
    // Rebuild the preview only when the content changed. The card swaps DOM on a new preview object, and an iframe
    // must not reload every frame.
    const key = [content.id, content.type, content.title, content.sourceKind, content.sourceRef,
      content.imageData?.length ?? 0, content.imageData?.slice(-32) ?? ''].join('\u0001');
    if (key !== this.cardKey || !this.cardPreview || !this.cardArt) {
      this.cardKey = key;
      this.cardPreview = buildPreview(content);
      this.cardArt = mediaArt(content);
    }
    this.card.show(this.cardPreview, this.cardArt);
    if (sheet) {
      // The card lives in the same flex column as the sheet, directly above it. Layout does the stacking, so there is
      // no measured position that could go stale.
      const dock = sheet.parentElement;
      if (dock && this.card.root.parentElement !== dock) dock.insertBefore(this.card.root, sheet);
      this.card.dock();
      return;
    }
    // Floating mode: back to a plain fixed-position card. It stays in the dock (moving it would reload an iframe).
    this.cardAnchor.copy(entry!.target).y += 2;
    this.camera.updateMatrixWorld();
    const ndc = this.cardAnchor.project(this.camera);
    this.card.moveTo(((ndc.x + 1) / 2) * this.container.clientWidth, ((1 - ndc.y) / 2) * this.container.clientHeight);
  }

  private frameSelection(): void {
    const roomEl = this.container;
    const selected = this.store.selectedId;
    const entry = selected ? this.objects.get(selected) : undefined;
    const inspecting = Boolean(entry);
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
    // OrbitControls is suspended during inspection, so explicitly orient the
    // camera toward the animated target after a prior user orbit/pan.
    this.camera.lookAt(this.controls.target);
    this.camera.updateMatrixWorld();
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
    const slotOver = this.store.selectedId ? this.slotIdAt(e) : null;
    this.renderer.domElement.style.cursor = repId || slotOver ? 'pointer' : 'grab';
    if (!repId || this.store.selectedId) {
      this.hideTooltip();
      return;
    }
    const r = this.container.getBoundingClientRect();
    const x = e.clientX - r.left + 14;
    const y = e.clientY - r.top + 14;
    if (this.hoverRep === repId) {
      // Already resting on this object: follow the pointer once the tip is showing.
      if (!this.tooltip.hidden) { this.tooltip.style.left = `${x}px`; this.tooltip.style.top = `${y}px`; }
      return;
    }
    this.hideTooltip();
    this.hoverRep = repId;
    this.hoverTimer = window.setTimeout(() => {
      const rep = this.store.state.representations.find((o) => o.id === repId);
      const content = rep ? this.store.content(rep.contentItemId) : undefined;
      if (!content || this.hoverRep !== repId) return;
      this.tooltip.textContent = `${content.title}  (${content.type})`;
      this.tooltip.style.left = `${x}px`;
      this.tooltip.style.top = `${y}px`;
      this.tooltip.hidden = false;
    }, HOVER_DWELL_MS);
  }

  private hideTooltip(): void {
    window.clearTimeout(this.hoverTimer);
    this.hoverRep = null;
    this.tooltip.hidden = true;
  }
}
