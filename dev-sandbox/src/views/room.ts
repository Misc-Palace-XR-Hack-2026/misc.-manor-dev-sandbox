import * as THREE from 'three';
import { surfaceTexture, surfaceGeometry } from './surface-textures';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Store } from '../core/store';
import type { ObjectKind } from '../core/types';
import type { RoomLayout } from '../core/layout';
import { animateIgnite } from './ignite-objects';
import { buildObject } from './objects';
import { applyLampLightBudget } from './cozy-objects';
import { disposeGroup } from './resources';
import { LIGHTING_PRESETS } from '../core/appearance';
import { buildPreview, previewOpenUrl, type Preview } from '../core/preview';
import { PreviewCardView } from './preview-card';
import { mediaArt, type MediaArt } from '../core/media-art';
import { canEnterVr, enterReason, type NeighborhoodRoom } from '../xr/interaction';
import { XrSession } from '../xr/session';

// Thin 3D adapter: draws store.state and sends clicks back as store commands. Holds no truth of its own.
// Replaceable later (IWSDK, Babylon) as long as the store contract stays the same.

const YAW = Math.PI / 4; // objects face the isometric camera
const HOVER_DWELL_MS = 400; // tooltip appears only after the pointer rests on an object

/**
 * Opt-in hooks for the curated demo. The sandbox never sets them. With a camera the view renders through it and the
 * orbit controls are off; with slots only those slots show markers and accept a drop.
 */
export interface DemoHooks {
  camera?: THREE.PerspectiveCamera;
  slots?: ReadonlySet<string>;
  /** Which way objects face (radians). Defaults to facing the isometric camera. */
  yaw?: number;
  /** Called every rendered frame with time in seconds. */
  frame?: (t: number) => void;
  /** A fixed panel (bottom right) the preview card always docks above, in place of the menu's item sheet. */
  dock?: HTMLElement;
  /** Sees every tap (not drags) before the default select/place behaviour. Return true to consume it. */
  tap?: (tap: DemoTap) => boolean;
  /** Keep an object selected after it is placed, so its preview stays up until the visitor taps elsewhere. */
  keepSelectionOnPlace?: boolean;
  /** False: a selected object stays put on its slot instead of lifting toward the isometric camera. */
  liftSelected?: boolean;
}

/** What a tap landed on, as seen through the active camera. */
export interface DemoTap {
  /** Already aimed through the active camera at the tap point. */
  raycaster: THREE.Raycaster;
  repId: string | null;
  /** A slot marker under the tap that the current hooks allow. */
  slotId: string | null;
  /** First hit on the room shell (walls, floors, built-ins). Floor meshes have `userData.surface === 'floor'`. */
  room: THREE.Intersection | null;
  event: PointerEvent;
}

interface Entry {
  group: THREE.Group;
  kind: ObjectKind;
  contentKey: string;
  target: THREE.Vector3;
  selectedState?: { originalPos: THREE.Vector3; targetRotation: number };
}

export class RoomView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private controls: OrbitControls;
  private objectsGroup = new THREE.Group();
  private practiceOutline = new THREE.BoxHelper(new THREE.Object3D(), 0xffe9a0);
  private practicePad = document.createElement('div');
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
  private viewHeight = 11; // orthographic frustum height, world units; set per layout
  private ground!: THREE.Mesh;
  private hoverTimer: number | undefined;
  private hoverRep: string | null = null;
  private card: PreviewCardView;
  private cardAnchor = new THREE.Vector3();
  private cardKey = '';
  private cardPreview: Preview | null = null;
  private cardArt: MediaArt | null = null;
  private xr: XrSession | null = null;
  private vrButton = document.createElement('button');
  private demo: DemoHooks | null = null;

  constructor(private container: HTMLElement, private store: Store, rooms: NeighborhoodRoom[] = []) {
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
    this.controls.dampingFactor = 0.15; // Higher damping = stops faster after drag
    this.controls.update();

    this.practicePad.dataset.tutorial='place-pad';
    this.practicePad.className='practice-pad'; this.practicePad.hidden=true; document.body.append(this.practicePad);
    this.scene.add(this.practiceOutline);
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
    this.xr = new XrSession(this.renderer, this.scene, this.store, this.objectsGroup, this.markerGroup, this.roomGroup, rooms, (event) => {
      document.dispatchEvent(new CustomEvent('palace-tutorial', { detail: event }));
    });
    this.vrButton.type = 'button';
    this.vrButton.className = 'vr-enter';
    this.vrButton.textContent = 'Enter VR';
    this.vrButton.hidden = true;
    this.vrButton.disabled = true;
    container.appendChild(this.vrButton);
    this.vrButton.addEventListener('click', () => void this.enterVr());
    void this.refreshVrButton();
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
      this.renderer.render(this.scene, this.activeCamera);
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

  // ---- demo hooks ---------------------------------------------------------
  setDemo(hooks: DemoHooks | null): void {
    this.demo = hooks;
    this.resize();
    this.sync();
  }

  /** Extra scenery that is not part of the saved room (the demo's crate and jukebox). */
  addToScene(...objects: THREE.Object3D[]): void {
    this.scene.add(...objects);
  }

  removeFromScene(...objects: THREE.Object3D[]): void {
    this.scene.remove(...objects);
  }

  get activeCamera(): THREE.Camera {
    return this.demo?.camera ?? this.camera;
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** The default isometric camera and the point it orbits, for a demo camera that starts from the overview. */
  get overview(): { camera: THREE.OrthographicCamera; target: THREE.Vector3 } {
    return { camera: this.camera, target: this.controls.target };
  }

  private get yaw(): number {
    return this.demo?.yaw ?? YAW;
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
      mesh.userData.surface = b.material;
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

  private fitBackground(immersive = false): void {
    const texture = this.scene.background;
    if (!(texture instanceof THREE.Texture)) return;
    // A UV background is a screen-space quad: it ignores even XR eye rotation.
    // In VR wrap the image around the world; Three.js renders its cached cubemap
    // with each eye's orientation (and no translation). Disposal follows the source.
    texture.mapping = immersive ? THREE.EquirectangularReflectionMapping : THREE.UVMapping;
    if (immersive) {
      texture.repeat.set(1, 1);
      texture.offset.set(0, 0);
      return;
    }
    // Desktop remains screen-space cover, including ordinary non-panoramic photos.
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
    const cam = this.demo?.camera;
    if (cam) { cam.aspect = aspect; cam.updateProjectionMatrix(); }
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
        group.rotation.y = this.yaw;
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
    applyLampLightBudget(this.objectsGroup);

    const held = this.store.holding !== null;
    const restricted = this.demo?.slots;
    this.markerGroup.visible = restricted
      ? held || this.store.selectedId !== null
      : held || (this.store.selectedId !== null && !this.objects.has(this.store.selectedId));
    for (const [slotId, m] of this.markers) {
      m.visible = !restricted || restricted.has(slotId);
      const occupant = this.store.repAt(slotId);
      const color = !occupant ? 0xfff2b0 : occupant === this.store.selectedId ? 0x9be39b : 0xff9ec4;
      (m.material as THREE.MeshBasicMaterial).color.setHex(color);
    }
  }

  private tick(t: number): void {
    const tutorial=(window as unknown as {tutorial?:{targetRepresentationId:string|null}}).tutorial;
    const practice=tutorial?.targetRepresentationId ? this.objects.get(tutorial.targetRepresentationId) : null;
    this.practiceOutline.visible=Boolean(practice && this.store.practicing);
    if(practice) this.practiceOutline.setFromObject(practice.group);
    this.practicePad.hidden = true;
    if (this.store.practicing && this.store.holding && !this.xr?.presenting) {
      const rect=this.renderer.domElement.getBoundingClientRect();
      for (const [id,marker] of this.markers) {
        if (this.store.repAt(id)) continue;
        const point=marker.getWorldPosition(new THREE.Vector3()).project(this.camera);
        const x=rect.left+(point.x+1)*rect.width/2, y=rect.top+(1-point.y)*rect.height/2;
        if (point.z>1 || x<40 || x>innerWidth-40 || y<110 || y>innerHeight-100) continue;
        this.raycaster.setFromCamera(new THREE.Vector2(point.x,point.y),this.camera);
        if(this.raycaster.intersectObjects(this.objectsGroup.children,true).length) continue;
        if(this.raycaster.intersectObjects(this.markerGroup.children,false)[0]?.object.userData.slotId!==id) continue;
        this.practicePad.hidden=false;
        Object.assign(this.practicePad.style,{left:`${x-18}px`,top:`${y-18}px`});
        break;
      }
    }
    animateIgnite(this.objectsGroup, t, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const selected = this.demo?.liftSelected === false ? null : this.store.selectedId;
    for (const [id, e] of this.objects) {
      const presenting = Boolean(this.xr?.presenting);
      const bob = presenting || id !== selected ? 0 : 0.2 + Math.sin(t * 4) * 0.05;

      // On selection: save original position and calculate minimal clockwise rotation to face camera
      if (id === selected && !e.selectedState) {
        e.selectedState = {
          originalPos: e.target.clone(),
          targetRotation: this.minimalClockwiseRotation(e.group.rotation.y, this.yaw),
        };
      }
      if (id !== selected && e.selectedState) {
        delete e.selectedState;
      }

      // Animate position: adaptive to zoom level and camera angle
      // When selected: pull toward center (varies per object), and push toward camera to prevent clipping
      const targetPos = (() => {
        if (presenting || id !== selected || !e.selectedState) return e.target;

        const originalPos = e.selectedState.originalPos;
        const roomCenter = this.controls.target;
        const zoom = this.camera.zoom;
        const isSuperZoomed = zoom >= 2.5;

        // 1. Pull toward room center: scales with zoom, applied to all axes
        // At zoom 0.6: ~0.23, at zoom 1.0: ~0.25, at zoom 2.0: ~0.30, at zoom 3.0: ~0.35
        const centerLerpAmount = 0.20 + zoom * 0.05;
        const centerPull = originalPos.clone().lerp(roomCenter, centerLerpAmount).sub(originalPos);

        // 2. Push toward camera: prevents clipping with walls/furniture, scales at higher zoom
        let cameraPush = new THREE.Vector3(0, 0, 0);
        if (zoom >= 1.5) {
          const distToCamera = this.camera.position.distanceTo(originalPos);
          if (distToCamera > 0.5) {
            const dirToCamera = this.camera.position.clone().sub(originalPos).normalize();
            // At super zoom (>= 2.5), increase push multiplier to ensure visibility
            const pushMultiplier = isSuperZoomed ? 1.25 : 1.0;
            const pushDistance = Math.min(distToCamera * 0.1, 1.5) * (zoom - 1.0) * pushMultiplier;
            cameraPush = dirToCamera.multiplyScalar(pushDistance);
          }
        }

        // 3. Additional vertical boost: scales with zoom, ensures clearance above ground/low positions
        // This is ADAPTIVE: objects already high up get less boost, objects low get more
        const objectHeightAboveGround = originalPos.y - roomCenter.y;
        const heightNormalized = Math.max(0, objectHeightAboveGround / 3.0); // normalize to 0-1 range
        const boostFactor = Math.max(0.4, 1.0 - heightNormalized * 0.3); // high objects boost less
        const verticalBoost = Math.max(0.5, (zoom - 0.6) * 0.6) * boostFactor;

        // 4. Combine all forces
        const offset = centerPull.add(cameraPush).add(new THREE.Vector3(0, verticalBoost, 0));
        return originalPos.clone().add(offset);
      })();

      const p = e.group.position;
      p.x += (targetPos.x - p.x) * 0.22;
      p.z += (targetPos.z - p.z) * 0.22;
      p.y += (targetPos.y + bob - p.y) * 0.22;

      // Animate rotation: face camera with minimal clockwise rotation when selected
      if (!presenting && id === selected && e.selectedState) {
        const targetRot = e.selectedState.targetRotation + Math.sin(t * 2) * 0.25;
        e.group.rotation.y += (targetRot - e.group.rotation.y) * 0.18;
        // Scale up 25% from original (1.6 → 2.0)
        const targetScale = 1.6 * 1.25; // OBJECT_SCALE * 1.25
        e.group.scale.x += (targetScale - e.group.scale.x) * 0.15;
        e.group.scale.y += (targetScale - e.group.scale.y) * 0.15;
        e.group.scale.z += (targetScale - e.group.scale.z) * 0.15;
      } else {
        // Return to rest state: face isometric camera (YAW), scale to original 1.6
        e.group.rotation.y = this.yaw;
        const restScale = 1.6; // OBJECT_SCALE
        e.group.scale.x += (restScale - e.group.scale.x) * 0.15;
        e.group.scale.y += (restScale - e.group.scale.y) * 0.15;
        e.group.scale.z += (restScale - e.group.scale.z) * 0.15;
      }
    }
    if (this.markerGroup.visible) {
      const pulse = 0.4 + Math.sin(t * 5) * 0.12;
      for (const m of this.markers.values()) (m.material as THREE.MeshBasicMaterial).opacity = pulse;
    }
    this.demo?.frame?.(t);
    const xrCamera = this.xr?.tick() ?? null;
    if (xrCamera) {
      this.controls.enabled = false;
      this.fitBackground(true);
      this.renderer.render(this.scene, xrCamera);
      return;
    }
    const inspecting = Boolean(this.store.selectedId && this.objects.has(this.store.selectedId));
    if (!inspecting && !this.demo?.camera) this.controls.update();
    this.frameSelection();
    this.fitBackground();
    this.renderer.render(this.scene, this.activeCamera);
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
    const sheet = this.demo?.dock && !this.demo.dock.hidden
      ? this.demo.dock
      : document.querySelector<HTMLElement>('.item-sheet:not([hidden])');
    if (!content || (!entry && !sheet) || (this.demo?.dock && !sheet)) { this.card.show(null); return; }
    // Rebuild the preview only when the content changed. The card swaps DOM on a new preview object, and an iframe
    // must not reload every frame.
    const key = [content.id, content.type, content.title, content.sourceKind, content.sourceRef,
      content.imageData?.length ?? 0, content.imageData?.slice(-32) ?? ''].join('\u0001');
    if (key !== this.cardKey || !this.cardPreview || !this.cardArt) {
      this.cardKey = key;
      this.cardPreview = buildPreview(content);
      this.cardArt = mediaArt(content);
    }
    this.card.show(this.cardPreview, this.cardArt, content.sourceKind === 'url' ? previewOpenUrl(content.sourceRef) : null);
    if (sheet) {
      // Position the card with its bottom-right corner 10px above and aligned with the sheet's top-right.
      // dockBottomRight handles viewport clamping so the card never goes off-page.
      const s = sheet.getBoundingClientRect();
      this.card.dockBottomRight(s.right, s.top - 10);
      return;
    }
    // Floating mode: anchor the card above the selected object, projected through the camera.
    this.cardAnchor.copy(entry!.target).y += 2;
    const cam = this.activeCamera;
    cam.updateMatrixWorld();
    const ndc = this.cardAnchor.project(cam);
    this.card.moveTo(((ndc.x + 1) / 2) * this.container.clientWidth, ((1 - ndc.y) / 2) * this.container.clientHeight);
  }

  private frameSelection(): void {
    // Camera no longer moves to face selected objects. Objects instead rotate to face the camera and scale up,
    // avoiding jarring view jumps. Camera stays enabled for free panning/orbiting at all times.
    this.controls.enabled = !this.demo?.camera;
  }

  /**
   * Calculate the target rotation angle for an object to face the camera viewer directly.
   * Takes the current rotation and finds the shortest clockwise rotation to reach the target.
   * Returns a normalized angle in [-PI, PI].
   */
  private minimalClockwiseRotation(current: number, target: number): number {
    let diff = target - current;
    // Normalize to [-PI, PI]
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    // If diff is negative (counterclockwise), go the long way around (clockwise)
    if (diff < 0) diff += 2 * Math.PI;
    // Return the target angle, normalized to [-PI, PI]
    let result = current + diff;
    while (result > Math.PI) result -= 2 * Math.PI;
    while (result < -Math.PI) result += 2 * Math.PI;
    return result;
  }

  // ---- input ------------------------------------------------------------
  private async refreshVrButton(): Promise<void> {
    this.vrButton.hidden = true;
    this.vrButton.disabled = true;
    const probe = { isSecureContext: globalThis.isSecureContext, xr: navigator.xr ?? null };
    const reason = enterReason(probe);
    let supported = false;
    try {
      supported = await canEnterVr(probe);
    } catch {
      // A denied or failed capability probe is unavailable, not an entry action.
    }
    this.vrButton.hidden = !supported;
    this.vrButton.disabled = !supported;
    this.vrButton.title = reason || (supported ? 'Enter the room in VR' : 'Immersive VR is not supported here.');
    if (reason) this.vrButton.textContent = reason;
    else this.vrButton.textContent = supported ? 'Enter VR' : 'VR not supported';
  }

  private async enterVr(): Promise<void> {
    try {
      await this.xr?.enter();
    } catch (error) {
      this.vrButton.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  private ray(e: PointerEvent): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.activeCamera);
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
    const allowed = this.demo?.slots;
    const hit = this.raycaster.intersectObjects(this.markerGroup.children, false).find((h) => !allowed || allowed.has(h.object.userData.slotId as string));
    return (hit?.object.userData.slotId as string | undefined) ?? null;
  }

  private onPointerUp(e: PointerEvent): void {
    const d = this.downAt;
    this.downAt = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return; // it was an orbit drag

    const selected = this.store.selectedId;
    const repId = this.repIdAt(e); // What object did we click on?

    const tap = this.demo?.tap;
    if (tap) {
      const slotId = this.slotIdAt(e);
      const room = this.raycaster.intersectObjects(this.roomGroup.children, true)[0] ?? null;
      if (tap({ raycaster: this.raycaster, repId, slotId, room, event: e })) return;
    }

    // If we clicked on an object, select it. This takes priority over placement.
    if (repId) {
      this.store.select(repId !== selected ? repId : null);
      return;
    }

    // We didn't click on an object. If we have a selected object and clicked on a slot, try to place it.
    if (selected) {
      const slotId = this.slotIdAt(e);
      if (slotId) {
        this.store.place(selected, slotId);
        if (!this.demo?.keepSelectionOnPlace) this.store.select(null);
        return;
      }
    }

    // Clicked on empty space: deselect
    this.store.select(null);
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
