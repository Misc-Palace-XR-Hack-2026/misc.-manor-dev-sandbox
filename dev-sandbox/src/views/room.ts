import * as THREE from 'three';
import { surfaceTexture, surfaceGeometry } from './surface-textures';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Store } from '../core/store';
import type { ObjectKind } from '../core/types';
import type { RoomLayout } from '../core/layout';
import { animateIgniteNodes, collectIgnite } from './ignite-objects';
import { buildObject } from './objects';
import { applyLampLightBudget } from './cozy-objects';
import { disposeGroup } from './resources';
import { LIGHTING_PRESETS } from '../core/appearance';
import { buildPreview, previewOpenUrl, type Preview } from '../core/preview';
import { PreviewCardView } from './preview-card';
import { mediaArt, type MediaArt } from '../core/media-art';
import { roomOwnerName } from '../core/rooms';
import { canEnterVr, enterReason, type NeighborhoodRoom } from '../xr/interaction';
import { XrSession } from '../xr/session';
import { roomSoundtrack } from './soundtrack';
import { NeighborhoodWorld } from './neighborhood-world';
import { roomCatalog, visitCatalogRoom } from '../core/room-portal';

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
  /** Small preview card with one short status line (the demo on phones). */
  compactPreview?: boolean;
  /** Demo walk: glowing pads only while moving an object, not on the first tap that opens its card. */
  slotMarkers?: boolean | (() => boolean);
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
  event: { clientX: number; clientY: number };
}

interface Entry {
  group: THREE.Group;
  kind: ObjectKind;
  contentKey: string;
  target: THREE.Vector3;
  selectedState?: { originalPos: THREE.Vector3; targetRotation: number };
}

interface Flight {
  from: THREE.Vector3;
  /** When set, the object flies here (portal suck) instead of to its slot. */
  to?: THREE.Vector3;
  outbound?: boolean;
  start: number;
  duration: number;
  onLand?: () => void;
}

function createRoomRenderer(): THREE.WebGLRenderer {
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    if (renderer.getContext()) return renderer;
    renderer.dispose();
  } catch { /* the high-performance context can fail; the default one is the same picture */ }
  return new THREE.WebGLRenderer({ antialias: true });
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
  private flights = new Map<string, Flight>();
  private markers = new Map<string, THREE.Mesh>();
  private raycaster = new THREE.Raycaster();
  private padPoint = new THREE.Vector3();
  private padNdc = new THREE.Vector2();
  private igniteNodes: THREE.Object3D[] = [];
  private reducedMotion = false;
  private tooltip: HTMLDivElement;
  private downAt: { x: number; y: number; pointerId: number } | null = null;
  private clickAt: PointerEvent | null = null;
  private layoutId = '';
  private surfaceKey = '';
  private surfaceError = document.createElement('p');
  private lightingKey: string | null = null;
  private hemi = new THREE.HemisphereLight(0xffffff, 0xd9a47a, 1.7);
  private sun = new THREE.DirectionalLight(0xfff1dc, 2.1);
  private lamp = new THREE.PointLight(0xffd8a8, 0, 6, 2);
  private roomGroup = new THREE.Group();
  private isoOffset = new THREE.Vector3(14, 14, 14);
  private overviewPadding = 0;
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
  neighborhood: NeighborhoodWorld | null = null;
  private neighborhoodMode: 'tactile' | 'dollhouse' = 'tactile';
  private neighborhoodRooms: NeighborhoodRoom[] = [];
  private neighborhoodHidden = new Map<THREE.Object3D, boolean>();
  private neighborhoodBackground: THREE.Scene['background'] = null;
  private neighborhoodBack = document.createElement('button');
  private neighborhoodHint = document.createElement('p');

  get homeControl(): HTMLButtonElement { return this.neighborhoodBack; }
  setNeighborhoodMode(mode: 'tactile' | 'dollhouse'): void {
    this.neighborhoodMode = mode; this.neighborhood?.setMode(mode);
    this.updateNeighborhoodHint();
  }
  private updateNeighborhoodHint(): void {
    const hud=document.querySelector('.demo-hud');if(hud&&this.neighborhoodBack.parentElement!==hud)hud.append(this.neighborhoodBack);
    this.neighborhoodHint.hidden = !this.neighborhood;
    this.neighborhoodHint.textContent = this.neighborhood?.mode === 'dollhouse'
      ? 'Neighborhood · drag to pan · scroll / pinch to zoom · select a pavilion to visit'
      : 'Neighborhood · WASD / arrows to walk · drag to look · tap path to walk or a room to visit';
    const away = Boolean(this.neighborhood || this.store.visiting);
    const action = away ? 'home' : 'neighborhood';
    const label = away ? 'Return to my room' : 'Explore neighborhood';
    this.neighborhoodBack.hidden = false;
    if (this.neighborhoodBack.dataset.action !== action) {
      this.neighborhoodBack.dataset.action = action;
      this.neighborhoodBack.title = label;
      this.neighborhoodBack.setAttribute('aria-label', label);
      this.neighborhoodBack.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'
        + (away
          ? '<path d="M3 11.2 12 4l9 7.2M5.6 10.4V20h4.2v-5h4.4v5h4.2v-9.6"/>'
          : '<path d="m2 10 5-4 5 4M3.5 9v9h7V9m1-2 5-4 5 4m-8.5-1v7h7V6M10 16l5-4 5 4m-8.5-1v6h7v-6"/>')
        + '</svg>';
    }
  }
  openNeighborhood(): void {
    if (this.neighborhood) return;
    this.store.select(null); this.card.show(null);
    const catalog=roomCatalog(this.neighborhoodRooms).map(room=>room.id===this.store.visiting?{...room,data:structuredClone(this.store.state)}:room);
    const world = new NeighborhoodWorld(catalog, this.store.personalRoom, id => {
      const room = catalog.find(r => r.id === id);
      if (!room) return;
      this.clickAt = null; this.downAt = null;
      this.closeNeighborhood(); visitCatalogRoom(this.store, room);
      this.xr?.neighborhoodEnteredRoom();
      this.updateNeighborhoodHint();
    });
    for (const object of this.scene.children) {
      if (object.userData.neighborhoodKeep) continue;
      this.neighborhoodHidden.set(object, this.xr?.desktopVisibility(object) ?? object.visible); object.visible = false;
    }
    this.neighborhoodBackground = this.scene.background;
    this.scene.background = new THREE.Color(0xe3c7a0);
    this.scene.add(world.group); this.neighborhood = world;
    world.spawnOutside(this.store.visiting);
    world.setMode(this.neighborhoodMode); world.mount(this.canvas);
    world.resize(this.container.clientWidth, this.container.clientHeight);
    this.controls.enabled = false;
    this.xr?.setNeighborhood(world);
    this.updateNeighborhoodHint();
  }
  closeNeighborhood(): void {
    if (!this.neighborhood) return;
    this.xr?.setNeighborhood(null);
    this.neighborhood.dispose(); this.neighborhood = null;
    for (const [object, visible] of this.neighborhoodHidden) object.visible = visible;
    this.neighborhoodHidden.clear(); this.scene.background = this.neighborhoodBackground; this.surfaceError.hidden=true;
    this.sync(); this.updateNeighborhoodHint();
  }

  constructor(private container: HTMLElement, private store: Store, rooms: NeighborhoodRoom[] = []) {
    this.neighborhoodRooms = rooms;
    // A house icon, styled like Help. The label stays in title/aria so the bar can stay compact,
    // and the bar itself shrinks when this button is hidden rather than reserving an empty slot.
    this.neighborhoodBack.className = 'demo-hud-btn neighborhood-back';
    this.neighborhoodBack.type = 'button';
    this.neighborhoodBack.title = 'Return to my room';
    this.neighborhoodBack.setAttribute('aria-label', 'Return to my room');
    this.neighborhoodBack.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
      + '<path d="M3 11.2 12 4l9 7.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="M5.6 10.4V19a1 1 0 0 0 1 1h3.2v-5h4.4v5h3.2a1 1 0 0 0 1-1v-8.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '</svg>';
    this.neighborhoodHint.className = 'neighborhood-hint';
    this.neighborhoodBack.hidden = this.neighborhoodHint.hidden = true;
    this.neighborhoodBack.onclick = () => {
      if (!this.neighborhood && !this.store.visiting) { this.openNeighborhood(); return; }
      this.closeNeighborhood(); this.store.returnHome(); this.xr?.neighborhoodEnteredRoom(); this.updateNeighborhoodHint();
    };
    document.body.append(this.neighborhoodBack, this.neighborhoodHint);
    document.addEventListener('palace-neighborhood', event => { if ((event as CustomEvent).detail === this.store) this.openNeighborhood(); });
    document.addEventListener('palace-neighborhood-home', event => { if ((event as CustomEvent).detail === this.store) this.neighborhoodBack.click(); });
    this.store.subscribe(() => this.updateNeighborhoodHint());
    this.renderer = createRoomRenderer();
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.bindReducedMotion();
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
    this.controls.mouseButtons.RIGHT = null;
    this.controls.update();

    this.practicePad.dataset.tutorial='place-pad';
    this.practicePad.className='practice-pad'; this.practicePad.hidden=true; document.body.append(this.practicePad);
    this.scene.add(this.practiceOutline);
    this.scene.add(this.roomGroup, this.objectsGroup, this.markerGroup);
    this.addLights();

    const el = this.renderer.domElement;
    // OrbitControls preventDefault()s contextmenu so it can pan; we don't use right-drag, so keep the browser menu.
    el.addEventListener('contextmenu', (e) => e.stopImmediatePropagation(), true);
    el.addEventListener('pointerdown', (e) => {
      this.clickAt = null;
      this.downAt = e.isPrimary && e.button === 0 ? { x: e.clientX, y: e.clientY, pointerId: e.pointerId } : null;
    });
    el.addEventListener('pointerup', (e) => this.onPointerUp(e));
    el.addEventListener('pointercancel', () => { this.downAt = null; this.clickAt = null; });
    window.addEventListener('blur', () => { this.downAt = null; this.clickAt = null; });
    el.addEventListener('click', () => {
      const at = this.clickAt;
      this.clickAt = null;
      // Finish the gesture before opening overlays: touch compatibility mouse events
      // can otherwise be hit-tested against buttons that appeared during pointerup.
      if (at) this.activateAt(at);
    });
    el.addEventListener('dblclick', (e) => {
      if (!this.demo) return;
      e.preventDefault();
      this.activateAt(e);
    });
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
    }, (ids, from) => this.flyIn(ids, from, { delay: .1, stagger: .1, duration: .85 }));
    this.vrButton.type = 'button';
    this.vrButton.className = 'vr-enter';
    this.vrButton.textContent = 'Enter VR';
    this.vrButton.hidden = true;
    this.vrButton.disabled = true;
    container.appendChild(this.vrButton);
    this.vrButton.addEventListener('click', () => { void this.enterVr().catch(() => {}); });
    let mode = this.store.mode;
    this.store.subscribe(() => {
      if (mode === this.store.mode) return;
      mode = this.store.mode;
      void this.refreshVrButton();
    });
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
  /**
   * Fly freshly placed objects in from a point (the demo's Random drop): each arcs out to its slot, one after another,
   * then rests as usual. Instant under reduced motion.
   */
  flyIn(repIds: readonly string[], from: THREE.Vector3, { delay = 0, stagger = 0.18, duration = 0.95 } = {}): void {
    if (this.reducedMotion) return;
    for (const id of this.flights.keys()) if (!this.objects.has(id)) this.flights.delete(id);
    const now = performance.now() / 1000;
    const start = now + delay;
    const origin = from.clone();
    repIds.forEach((id, i) => this.flights.set(id, { from: origin.clone(), start: start + i * stagger, duration }));
    // Pose them at the mouth this frame so they never sit on their slots during the hitch after dropIn.
    for (const id of repIds) {
      const e = this.objects.get(id);
      const f = this.flights.get(id);
      if (e && f) this.fly(e, f, now);
    }
  }

  /**
   * Pull one object into a point (the demo portal). `onLand` runs once it disappears into the mouth. Instant under
   * reduced motion.
   */
  flyOut(repId: string, to: THREE.Vector3, duration = 0.5, onLand?: () => void): void {
    if (this.reducedMotion) {
      onLand?.();
      return;
    }
    const entry = this.objects.get(repId);
    this.flights.set(repId, {
      from: (entry?.group.position ?? to).clone(),
      to: to.clone(),
      outbound: true,
      start: performance.now() / 1000,
      duration,
      onLand,
    });
  }

  /** One frame of a fly-in or fly-out; false once it has landed. */
  private fly(e: Entry, f: Flight, t: number): boolean {
    const dest = f.to ?? e.target;
    const k = (t - f.start) / f.duration;
    if (k >= 1) {
      e.group.position.copy(f.outbound ? dest : e.target);
      if (f.outbound) e.group.scale.setScalar(0.001);
      return false;
    }
    const s = k <= 0 ? 0 : 1 - (1 - k) ** 3;
    e.group.position.lerpVectors(f.from, dest, s);
    e.group.position.y += Math.sin(Math.PI * Math.max(0, k)) * (1 + 0.15 * f.from.distanceTo(dest));
    if (f.outbound) {
      e.group.scale.setScalar(1.6 * Math.max(0.001, 1 - s));
      e.group.rotation.y = this.yaw + s * Math.PI * 4;
    } else {
      e.group.scale.setScalar(k <= 0 ? 0.001 : 1.6 * (0.2 + 0.8 * Math.min(1, k * 2)));
      e.group.rotation.y = this.yaw + (1 - s) * Math.PI * 2;
    }
    return true;
  }

  setDemo(hooks: DemoHooks | null): void {
    this.demo = hooks;
    this.resize();
    this.sync();
  }

  /** Include production amenities beyond the open front edge in the overview framing. */
  setOverviewPadding(padding: number): void {
    this.overviewPadding = padding;
    this.viewHeight = this.store.layout.viewHeight + padding;
    this.resize();
  }

  /** Extra scenery that is not part of the saved room (the demo's crate and jukebox). */
  addToScene(...objects: THREE.Object3D[]): void {
    this.scene.add(...objects);
  }

  removeFromScene(...objects: THREE.Object3D[]): void {
    this.scene.remove(...objects);
  }

  get activeCamera(): THREE.Camera {
    return this.neighborhood?.camera ?? this.demo?.camera ?? this.camera;
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
    this.viewHeight = layout.viewHeight + this.overviewPadding;
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
    const anisotropy = this.surfaceAnisotropy();
    for (const target of ['floor','wall'] as const) {
      const selection = surfaces?.[target];
      if (selection) {
        const map = surfaceTexture(target, selection, error);
        map.anisotropy = anisotropy;
        materials[target].map = map;
        materials[target].color.setHex(0xffffff);
      }
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

  private bindReducedMotion(): void {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => { this.reducedMotion = query.matches; };
    apply();
    query.addEventListener('change', apply);
  }

  private surfaceAnisotropy(): number {
    try {
      return Math.min(8, this.renderer.capabilities.getMaxAnisotropy() || 1);
    } catch {
      return 1;
    }
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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

  /** Redraw from the store (demo uses this when move-mode turns on without a store change). */
  refresh(): void {
    this.sync();
  }

  private slotMarkersOn(): boolean {
    const v = this.demo?.slotMarkers;
    return typeof v === 'function' ? v() : Boolean(v);
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
      // Demo pickup must not vanish: keep drawing a held object on the spot it left.
      if (!slot) {
        const keep = this.demo?.liftSelected === false && (rep.id === this.store.holding || (this.slotMarkersOn() && rep.id === this.store.selectedId));
        if (keep && this.objects.has(rep.id)) live.add(rep.id);
        continue;
      }
      live.add(rep.id);
      const content=this.store.content(rep.contentItemId);
      const contentKey = `${content?.id ?? ''}:${content?.title ?? ''}:${content?.imageData?.length ?? 0}`;
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
      : held || (this.store.selectedId !== null && !this.objects.has(this.store.selectedId))
        || this.slotMarkersOn();
    for (const [slotId, m] of this.markers) {
      m.visible = !restricted || restricted.has(slotId);
      const occupant = this.store.repAt(slotId);
      const color = !occupant ? 0xfff2b0 : occupant === this.store.selectedId ? 0x9be39b : 0xff9ec4;
      (m.material as THREE.MeshBasicMaterial).color.setHex(color);
    }
    this.igniteNodes = collectIgnite(this.objectsGroup);
  }

  private tick(t: number): void {
    if (this.neighborhood) {
      this.controls.enabled = false;
      for (const object of this.neighborhoodHidden.keys()) object.visible = false;
      this.roomGroup.visible = this.objectsGroup.visible = this.markerGroup.visible = false;
      this.practiceOutline.visible = false; this.practicePad.hidden = true;
      this.neighborhood.resize(this.container.clientWidth, this.container.clientHeight);
      this.neighborhood.tick(t, Boolean(this.xr?.presenting));
      if(this.neighborhood.surfaceError){this.surfaceError.textContent='A neighborhood surface image could not be decoded. Your room data is unchanged.';this.surfaceError.hidden=false;}
      const camera = this.xr?.tick() ?? this.neighborhood.camera;
      this.neighborhoodBack.hidden = Boolean(this.xr?.presenting);
      this.neighborhoodHint.hidden = Boolean(this.xr?.presenting);
      this.renderer.render(this.scene, camera); return;
    }
    const tutorial=(window as unknown as {tutorial?:{targetRepresentationId:string|null}}).tutorial;
    const practice=tutorial?.targetRepresentationId ? this.objects.get(tutorial.targetRepresentationId) : null;
    this.practiceOutline.visible=Boolean(practice && this.store.practicing);
    if(practice) this.practiceOutline.setFromObject(practice.group);
    this.practicePad.hidden = true;
    if (this.store.practicing && this.store.holding && !this.xr?.presenting) {
      const rect=this.renderer.domElement.getBoundingClientRect();
      for (const [id,marker] of this.markers) {
        if (this.store.repAt(id)) continue;
        const point=marker.getWorldPosition(this.padPoint).project(this.camera);
        const x=rect.left+(point.x+1)*rect.width/2, y=rect.top+(1-point.y)*rect.height/2;
        if (point.z>1 || x<40 || x>innerWidth-40 || y<110 || y>innerHeight-100) continue;
        this.raycaster.setFromCamera(this.padNdc.set(point.x, point.y),this.camera);
        if(this.raycaster.intersectObjects(this.objectsGroup.children,true).length) continue;
        if(this.raycaster.intersectObjects(this.markerGroup.children,false)[0]?.object.userData.slotId!==id) continue;
        this.practicePad.hidden=false;
        Object.assign(this.practicePad.style,{left:`${x-18}px`,top:`${y-18}px`});
        break;
      }
    }
    if (this.igniteNodes.length) animateIgniteNodes(this.igniteNodes, t, this.reducedMotion);
    const selected = this.demo?.liftSelected === false ? null : this.store.selectedId;
    for (const [id, e] of this.objects) {
      const flight = this.flights.get(id);
      if (flight) {
        if (this.fly(e, flight, t)) continue;
        this.flights.delete(id);
        const land = flight.onLand;
        if (land) queueMicrotask(land);
      }
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
    if (!this.xr?.presenting) this.demo?.frame?.(t);
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
    this.card.setCompact(Boolean(this.demo?.compactPreview));
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
    const owner = content.fromRoom ? roomOwnerName(content.fromRoom) : undefined;
    this.card.setByline(owner ? `from ${owner}` : null);
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
    // Main's hide-unavailable-VR gating wins: an unsupported device still shows nothing at all.
    this.vrButton.hidden = !supported;
    // PR #82: on a VR-capable device, Preview keeps the button visible but refuses entry.
    if (supported && !this.store.canEdit) {
      this.vrButton.disabled = true;
      this.vrButton.textContent = 'VR: Edit only';
      this.vrButton.title = 'Preview is desktop/mobile only. Return to Edit room to enter VR.';
      return;
    }
    this.vrButton.disabled = !supported;
    this.vrButton.title = reason || (supported ? 'Enter the room in VR' : 'Immersive VR is not supported here.');
    if (reason) this.vrButton.textContent = reason;
    else this.vrButton.textContent = supported ? 'Enter VR' : 'VR not supported';
  }

  async enterVr(): Promise<void> {
    if (!this.store.canEdit) return;
    // Unlock audio here, on the click itself: controller selects inside the session do not grant
    // user activation, so the jukebox's Play would otherwise always come back browser-blocked.
    roomSoundtrack(this.store).primeFromGesture();
    try {
      await this.xr?.enter();
    } catch (error) {
      this.vrButton.textContent = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private ray(e: { clientX: number; clientY: number }): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.activeCamera);
  }

  private repIdAt(e: { clientX: number; clientY: number }): string | null {
    this.ray(e);
    const hit = this.raycaster.intersectObjects(this.objectsGroup.children, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !o.userData.repId) o = o.parent;
    return (o?.userData.repId as string | undefined) ?? null;
  }

  private slotIdAt(e: { clientX: number; clientY: number }): string | null {
    if (!this.markerGroup.visible) return null;
    this.ray(e);
    const allowed = this.demo?.slots;
    const hit = this.raycaster.intersectObjects(this.markerGroup.children, false).find((h) => !allowed || allowed.has(h.object.userData.slotId as string));
    return (hit?.object.userData.slotId as string | undefined) ?? null;
  }

  private onPointerUp(e: PointerEvent): void {
    const d = this.downAt;
    this.downAt = null;
    if (!d || d.pointerId !== e.pointerId) return;
    const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    const same = Boolean(this.demo && this.store.selectedId && this.store.selectedId === this.repIdAt(e));
    this.clickAt = dist <= 5 || (same && dist <= 24) ? e : null;
  }

  private activateAt(e: { clientX: number; clientY: number }): void {
    if (this.neighborhood) return;
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
    if (this.neighborhood) { this.hideTooltip(); return; }
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
