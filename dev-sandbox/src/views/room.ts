import * as THREE from 'three';
import { surfaceTexture, surfaceGeometry } from './surface-textures';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Store } from '../core/store';
import type { ObjectKind } from '../core/types';
import type { RoomLayout } from '../core/layout';
import { buildObject } from './objects';
import { applyLampLightBudget } from './cozy-objects';
import { disposeGroup } from './resources';
import { buildFireplace } from './fireplace';
import { buildAvatar, buildLoungeChair, type FixtureRig } from './lounge-fixtures';
import { buildNeighborhood } from './neighborhood';
import type { Fixture } from '../core/fixtures';
import { LIGHTING_PRESETS } from '../core/appearance';
import { buildPreview, type Preview } from '../core/preview';
import { PreviewCardView } from './preview-card';
import { mediaArt, type MediaArt } from '../core/media-art';
import { canEnterVr, enterReason, type NeighborhoodRoom } from '../xr/interaction';
import { XrSession } from '../xr/session';
import { buildSeatedGuide } from './guides';
import { MAX_SCENE_ZOOM } from '../core/scenes';
import { sampleFlight, type Flight } from '../core/motion';

// Thin 3D adapter: draws store.state and sends clicks back as store commands. Holds no truth of its own.
// Replaceable later (IWSDK, Babylon) as long as the store contract stays the same.

const YAW = Math.PI / 4; // objects face the isometric camera
const HOVER_DWELL_MS = 400; // tooltip appears only after the pointer rests on an object

interface Entry {
  group: THREE.Group;
  kind: ObjectKind;
  contentKey: string;
  target: THREE.Vector3;
  selectedState?: { originalPos: THREE.Vector3; targetRotation: number };
  customRotationY?: number; // Custom rotation in radians (set via scenes mode)
  glowing?: boolean; // Scenes mode: selection shows as an emissive glow instead of movement
  motionDriven?: boolean; // Scenes mode: a flight is posing this object (restored to the plain pin when it ends)
  originalMaterials?: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
}

// The default isometric camera looks down at ~35.26 degrees. Scene "height" is measured from that, in 30 degree units,
// so height 0 is exactly the normal room view.
const ISO_ELEVATION = Math.atan2(14, Math.hypot(14, 14));
const HEIGHT_UNIT = Math.PI / 6;

/**
 * What a captured frame contains. "no-chair" renders the room without the armchair, a clean plate for compositing a
 * live person into the seat. Guides, slot markers and selection glow are never part of a capture.
 */
export type CaptureLayer = 'full' | 'no-chair';

/**
 * Vignette strength 0..1 as black opacity at the middle and at the corners of the frame (the gradient is clear out to
 * 55% of the way to the corner). Up to 0.8 only the edges darken, reaching solid black at the corners. From 0.8 to 1 the
 * middle darkens too, so 1 is a fully black frame: the starting point for a fade up from black.
 */
export function vignetteAlphas(strength: number): { center: number; edge: number } {
  const s = Math.min(1, Math.max(0, strength));
  return { center: Math.max(0, (s - 0.8) / 0.2), edge: Math.min(1, s / 0.8) };
}

export interface FrameCaptureOptions {
  /** Output width in pixels; height is width * 9 / 16. */
  width: number;
  /** 0 = none. Darkens the edges of the frame, baked into the image. */
  vignette: number;
  layer: CaptureLayer;
  /** Optional burned-in caption, drawn centered near the top of the frame (for example "CONCEPT SEQUENCE"). */
  label?: string;
}

/** Pose of the first armchair in the room (the seat the guide figure sits in), in world units. */
export interface ChairPose {
  pos: [number, number, number];
  /** Rotation about Y in radians. The chair faces (sin r, cos r) on the floor plane. */
  rotationY: number;
}

export class RoomView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private controls: OrbitControls;
  private objectsGroup = new THREE.Group();
  private markerGroup = new THREE.Group();
  private fixturesGroup = new THREE.Group(); // room add-ons (fireplace): built from store.state.fixtures, not slots
  private fixtureRigs = new Map<string, { kind: string; rig: FixtureRig }>();
  private guidesGroup = new THREE.Group(); // scenes-mode composition aids (seated person); hidden in every capture
  private guidesOn = false;
  private objects = new Map<string, Entry>();
  private motionFlights = new Map<string, Flight>(); // scenes mode: choreography for the shot being previewed or recorded
  private motionClock: number | null = null; // seconds into the shot; null = no choreography, objects sit on their slots
  private fireClock: number | null = null; // fixed fireplace clock (seconds) so recorded frames are repeatable
  private rotations = new Map<string, number>(); // scenes mode: orientation per representation, survives object rebuilds
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
  private card: PreviewCardView | null;
  private cardAnchor = new THREE.Vector3();
  private cardKey = '';
  private cardPreview: Preview | null = null;
  private cardArt: MediaArt | null = null;
  private xr: XrSession | null = null;
  private vrButton = document.createElement('button');
  /**
   * Scenes mode is a different kind of view, fixed at construction: objects never move on select (they only glow),
   * and there is no preview card, tooltip, VR button or XR session. Camera limits are wider for framing shots.
   */
  public readonly scenesMode: boolean;

  constructor(private container: HTMLElement, private store: Store, rooms: NeighborhoodRoom[] = [], options: { scenes?: boolean } = {}) {
    this.scenesMode = options.scenes ?? false;
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
    this.card = this.scenesMode ? null : new PreviewCardView(document.body);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);
    const target = new THREE.Vector3(3, 1.6, 3);
    this.camera.position.copy(target).add(new THREE.Vector3(14, 14, 14)); // true isometric angle
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(target);
    this.controls.enableDamping = true;
    this.controls.screenSpacePanning = true;
    this.controls.minZoom = this.scenesMode ? 0.2 : 0.6;
    this.controls.maxZoom = this.scenesMode ? MAX_SCENE_ZOOM : 3;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.dampingFactor = 0.15; // Higher damping = stops faster after drag
    this.controls.update();

    this.scene.add(this.roomGroup, this.fixturesGroup, this.objectsGroup, this.markerGroup, this.guidesGroup);
    this.guidesGroup.visible = false;
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
    if (!this.scenesMode) {
      this.xr = new XrSession(this.renderer, this.scene, this.store, this.objectsGroup, this.markerGroup, this.roomGroup, rooms);
      this.vrButton.type = 'button';
      this.vrButton.className = 'vr-enter';
      this.vrButton.textContent = 'Enter VR';
      container.appendChild(this.vrButton);
      this.vrButton.addEventListener('click', () => void this.enterVr());
      void this.refreshVrButton();
    }
    this.renderer.setAnimationLoop((t) => this.tick(t / 1000));
    if (this.scenesMode) return; // no preview card to keep in sync
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

  // ---- scenes: guides and frame capture -----------------------------------

  private chairEntry(): Entry | undefined {
    for (const e of this.objects.values()) if (e.kind === 'armchair') return e;
    return undefined;
  }

  /** Show or hide the translucent seated person. Preview only: captures always hide it. */
  public setGuidesVisible(on: boolean): void {
    this.guidesOn = on;
    if (on && this.guidesGroup.children.length === 0) this.guidesGroup.add(buildSeatedGuide());
    this.updateGuide();
  }

  /** The guide sits in the armchair, so it copies the chair's pose every frame. No chair in the room, no guide. */
  private updateGuide(): void {
    const chair = this.chairEntry();
    const show = this.guidesOn && Boolean(chair);
    this.guidesGroup.visible = show;
    if (!show || !chair) return;
    this.guidesGroup.position.copy(chair.group.position);
    this.guidesGroup.rotation.y = chair.group.rotation.y;
    this.guidesGroup.scale.copy(chair.group.scale);
  }

  public getChairPose(): ChairPose | null {
    const chair = this.chairEntry();
    if (!chair) return null;
    return { pos: [chair.target.x, chair.target.y, chair.target.z], rotationY: chair.customRotationY ?? YAW };
  }

  /** The point the camera orbits and looks at, in world units (it moves when the view is panned). */
  public getCameraTarget(): [number, number, number] {
    const t = this.controls.target;
    return [t.x, t.y, t.z];
  }

  /** The 16:9 frame that a capture records, in container pixels: the largest 16:9 box centered in the view. */
  public frameRect(): { x: number; y: number; width: number; height: number } {
    const cw = this.container.clientWidth || 1;
    const ch = this.container.clientHeight || 1;
    const width = Math.min(cw, (ch * 16) / 9);
    const height = (width * 9) / 16;
    return { x: (cw - width) / 2, y: (ch - height) / 2, width, height };
  }

  /** Sandbox world units visible top to bottom inside the 16:9 frame at zoom 1 (divide by the zoom for the real value). */
  public frameWorldHeight(): number {
    return (this.viewHeight * this.frameRect().height) / (this.container.clientHeight || 1);
  }

  /**
   * Render exactly what is inside the on-screen 16:9 frame, at a fixed resolution, as a PNG. The camera is not moved:
   * the frustum is cropped to the frame, so the picture matches the preview. Guides, slot markers and selection glow
   * are left out, and the vignette (if any) is baked in the same way the preview overlay draws it.
   */
  public captureFrame(options: FrameCaptureOptions): Promise<Blob> {
    const width = Math.round(options.width);
    const height = Math.round((width * 9) / 16);
    const visibleHeight = this.frameWorldHeight();

    const chair = this.chairEntry();
    const glowing = [...this.objects.values()].filter((e) => e.glowing);
    const hidden = {
      markers: this.markerGroup.visible,
      guides: this.guidesGroup.visible,
      chair: chair?.group.visible ?? true,
    };
    const pixelRatio = this.renderer.getPixelRatio();
    const copy = document.createElement('canvas');
    try {
      // The animation loop may not have run since the clock or camera changed, so pose everything now.
      if (this.scenesMode) for (const [id, e] of this.objects) this.pinSceneObject(id, e);
      if (this.fireClock !== null) for (const { rig } of this.fixtureRigs.values()) rig.update(this.fireClock);
      this.controls.update();
      this.markerGroup.visible = false;
      this.guidesGroup.visible = false;
      if (chair && options.layer === 'no-chair') chair.group.visible = false;
      for (const e of glowing) this.setGlow(e, false);

      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
      const cam = this.camera;
      cam.left = (-visibleHeight * 16) / 18;
      cam.right = (visibleHeight * 16) / 18;
      cam.top = visibleHeight / 2;
      cam.bottom = -visibleHeight / 2;
      cam.updateProjectionMatrix();
      this.renderer.render(this.scene, cam);

      copy.width = width;
      copy.height = height;
      const context = copy.getContext('2d');
      if (!context) throw new Error('PNG capture is unavailable.');
      context.drawImage(this.renderer.domElement, 0, 0);
      if (options.vignette > 0) {
        context.save();
        context.translate(width / 2, height / 2);
        context.scale((width / 2) * Math.SQRT2, (height / 2) * Math.SQRT2);
        const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
        const { center, edge } = vignetteAlphas(options.vignette);
        gradient.addColorStop(0, `rgba(0,0,0,${center})`);
        gradient.addColorStop(0.55, `rgba(0,0,0,${center})`);
        gradient.addColorStop(1, `rgba(0,0,0,${edge})`);
        context.fillStyle = gradient;
        context.fillRect(-2, -2, 4, 4);
        context.restore();
      }
      if (options.label) {
        const size = Math.round(height * 0.035);
        context.save();
        context.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = 'rgba(255,255,255,0.92)';
        context.shadowColor = 'rgba(0,0,0,0.55)';
        context.shadowBlur = size * 0.35;
        context.fillText(options.label.toUpperCase(), width / 2, height * 0.075);
        context.restore();
      }
    } finally {
      this.markerGroup.visible = hidden.markers;
      this.guidesGroup.visible = hidden.guides;
      if (chair) chair.group.visible = hidden.chair;
      for (const e of glowing) this.setGlow(e, true);
      this.renderer.setPixelRatio(pixelRatio);
      this.resize(); // back to the on-screen size and frustum
    }
    return new Promise((resolve, reject) =>
      copy.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed.'))), 'image/png'));
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
    this.syncFixtures();
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
        entry = { group, kind: rep.objectKind, contentKey, target: new THREE.Vector3(), customRotationY: this.rotations.get(rep.id) };
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
    this.markerGroup.visible = held || (this.store.selectedId !== null && !this.objects.has(this.store.selectedId));
    for (const [slotId, m] of this.markers) {
      const occupant = this.store.repAt(slotId);
      const color = !occupant ? 0xfff2b0 : occupant === this.store.selectedId ? 0x9be39b : 0xff9ec4;
      (m.material as THREE.MeshBasicMaterial).color.setHex(color);
    }
  }

  private buildFixtureRig(kind: Fixture['kind']): FixtureRig {
    switch (kind) {
      case 'fireplace': return buildFireplace();
      case 'loungeChair': return buildLoungeChair();
      case 'avatar': return buildAvatar();
      case 'neighborhood': return buildNeighborhood();
    }
  }

  /** Build, move and remove fixtures (fireplace, lounge set, neighborhood) to match store.state.fixtures. Cheap enough to run on every change. */
  private syncFixtures(): void {
    const wanted = this.store.state.fixtures ?? [];
    const live = new Set<string>();
    for (const f of wanted) {
      live.add(f.id);
      let entry = this.fixtureRigs.get(f.id);
      if (entry && entry.kind !== f.kind) {
        entry.rig.dispose();
        this.fixturesGroup.remove(entry.rig.group);
        this.fixtureRigs.delete(f.id);
        entry = undefined;
      }
      if (!entry) {
        entry = { kind: f.kind, rig: this.buildFixtureRig(f.kind) };
        this.fixturesGroup.add(entry.rig.group);
        this.fixtureRigs.set(f.id, entry);
      }
      entry.rig.group.position.set(f.pos[0], f.pos[1], f.pos[2]);
      entry.rig.group.rotation.y = f.rotationY;
    }
    for (const [id, entry] of this.fixtureRigs) {
      if (live.has(id)) continue;
      entry.rig.dispose();
      this.fixturesGroup.remove(entry.rig.group);
      this.fixtureRigs.delete(id);
    }
  }

  private tick(t: number): void {
    const scenesActive = document.body.classList.contains('scenes-active');
    // Only one of the two views is on screen at a time; the other one doesn't need to animate or render.
    if (this.scenesMode !== scenesActive) return;
    for (const { rig } of this.fixtureRigs.values()) rig.update(this.fireClock ?? t);
    if (this.scenesMode) this.updateGuide();
    const selected = this.store.selectedId;
    for (const [id, e] of this.objects) {
      if (this.scenesMode) {
        // Scenes mode: an object is exactly where its slot is, at the rotation from the slider. No lerp, bob, pull
        // toward center, scale or wobble. Selection is shown by a glow only. A shot's choreography overrides the pin.
        this.pinSceneObject(id, e);
        const glow = id === selected;
        if (glow !== Boolean(e.glowing)) this.setGlow(e, glow);
        continue;
      }
      const presenting = Boolean(this.xr?.presenting);
      const bob = presenting || id !== selected ? 0 : 0.2 + Math.sin(t * 4) * 0.05;

      // On selection: save original position and calculate minimal clockwise rotation to face camera
      if (id === selected && !e.selectedState) {
        e.selectedState = {
          originalPos: e.target.clone(),
          targetRotation: this.minimalClockwiseRotation(e.group.rotation.y, YAW),
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

      // Normal mode animation
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
        e.group.rotation.y = YAW;
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
    const xrCamera = this.xr?.tick() ?? null;
    if (xrCamera) {
      this.controls.enabled = false;
      this.fitBackground(true);
      this.renderer.render(this.scene, xrCamera);
      return;
    }
    const inspecting = !this.scenesMode && Boolean(this.store.selectedId && this.objects.has(this.store.selectedId));
    if (!inspecting) this.controls.update();
    this.frameSelection();
    this.fitBackground();
    this.renderer.render(this.scene, this.camera);
  }

  /** Scenes mode: place one object on its slot, or at its choreographed pose when a flight is playing. */
  private pinSceneObject(id: string, e: Entry): void {
    const flight = this.motionClock === null ? undefined : this.motionFlights.get(id);
    const yaw = e.customRotationY ?? YAW;
    if (flight && this.motionClock !== null) {
      const pose = sampleFlight(flight, [e.target.x, e.target.y, e.target.z], yaw, this.motionClock);
      e.group.visible = pose.visible;
      e.group.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
      e.group.rotation.set(pose.tilt[0], pose.rotY, pose.tilt[1]);
      e.group.scale.setScalar(1.6 * pose.scale);
      e.motionDriven = true;
      return;
    }
    if (e.motionDriven) {
      e.motionDriven = false;
      e.group.visible = true;
      e.group.rotation.x = 0;
      e.group.rotation.z = 0;
    }
    e.group.position.copy(e.target);
    e.group.rotation.y = yaw;
    e.group.scale.setScalar(1.6);
  }

  /**
   * Scenes mode choreography. While a clock is set, objects with a flight are posed from it instead of sitting on their
   * slot. Pass `null` flights to stop. The clock is seconds into the shot.
   */
  public setMotion(flights: readonly Flight[] | null, seconds: number): void {
    this.motionFlights = new Map((flights ?? []).map((f) => [f.repId, f]));
    this.motionClock = flights ? seconds : null;
  }

  public setMotionTime(seconds: number): void {
    if (this.motionClock !== null) this.motionClock = seconds;
  }

  /** Fix the fireplace animation clock (seconds) so every recorded frame is repeatable; null returns it to real time. */
  public setFireClock(seconds: number | null): void {
    this.fireClock = seconds;
  }

  /** World-space right and up vectors of the camera, for aiming a fling-in from off-screen. */
  public cameraAxes(): { right: [number, number, number]; up: [number, number, number] } {
    this.camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    return { right: [right.x, right.y, right.z], up: [up.x, up.y, up.z] };
  }

  /** Where an object rests (its slot), for planning flights. */
  public restPosition(repId: string): [number, number, number] | null {
    const e = this.objects.get(repId);
    return e ? [e.target.x, e.target.y, e.target.z] : null;
  }

  /** Scenes mode selection feedback: swap in cloned materials with an emissive tint (clones so shared materials stay untouched). */
  private setGlow(e: Entry, on: boolean): void {
    e.glowing = on;
    if (on) {
      const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
      e.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        originals.set(mesh, mesh.material);
        const tint = (m: THREE.Material): THREE.Material => {
          const c = m.clone();
          const std = c as THREE.MeshStandardMaterial;
          if (std.emissive) { std.emissive = new THREE.Color(0xffc45a); std.emissiveIntensity = 0.5; }
          return c;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(tint) : tint(mesh.material);
      });
      e.originalMaterials = originals;
    } else if (e.originalMaterials) {
      for (const [mesh, original] of e.originalMaterials) {
        const glowing = mesh.material;
        mesh.material = original;
        for (const m of Array.isArray(glowing) ? glowing : [glowing]) m.dispose();
      }
      e.originalMaterials = undefined;
    }
  }

  /**
   * Floating preview above the selected object. It is anchored to the object's slot, not its animated position,
   * so it stays steady while the object bobs and turns. Needs the camera matrices from this frame's render.
   */
  private updatePreviewCard(): void {
    const card = this.card;
    if (!card) return;
    // The main view keeps running behind scenes mode, so it must not float its card over the scenes HUD.
    if (document.body.classList.contains('scenes-active')) { card.show(null); return; }
    const id = this.store.selectedId;
    const entry = id ? this.objects.get(id) : undefined;
    const rep = id ? this.store.state.representations.find((r) => r.id === id) : undefined;
    const content = rep ? this.store.content(rep.contentItemId) : undefined;
    // Every preview kind docks above the item sheet (bottom right) so it sits still and is easy to reach. Without the
    // sheet it floats over the object. An object that is selected but not placed yet has nowhere to float, so it
    // only shows when the sheet is there.
    const sheet = document.querySelector<HTMLElement>('.item-sheet:not([hidden])');
    if (!content || (!entry && !sheet)) { card.show(null); return; }
    // Rebuild the preview only when the content changed. The card swaps DOM on a new preview object, and an iframe
    // must not reload every frame.
    const key = [content.id, content.type, content.title, content.sourceKind, content.sourceRef,
      content.imageData?.length ?? 0, content.imageData?.slice(-32) ?? ''].join('\u0001');
    if (key !== this.cardKey || !this.cardPreview || !this.cardArt) {
      this.cardKey = key;
      this.cardPreview = buildPreview(content);
      this.cardArt = mediaArt(content);
    }
    card.show(this.cardPreview, this.cardArt);
    if (sheet) {
      // Position the card with its bottom-right corner 10px above and aligned with the sheet's top-right.
      // dockBottomRight handles viewport clamping so the card never goes off-page.
      const s = sheet.getBoundingClientRect();
      card.dockBottomRight(s.right, s.top - 10);
      return;
    }
    // Floating mode: anchor the card above the selected object, projected through the camera.
    this.cardAnchor.copy(entry!.target).y += 2;
    this.camera.updateMatrixWorld();
    const ndc = this.cardAnchor.project(this.camera);
    card.moveTo(((ndc.x + 1) / 2) * this.container.clientWidth, ((1 - ndc.y) / 2) * this.container.clientHeight);
  }

  private frameSelection(): void {
    // Camera no longer moves to face selected objects. Objects instead rotate to face the camera and scale up,
    // avoiding jarring view jumps. Camera stays enabled for free panning/orbiting at all times.
    this.controls.enabled = true;
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
    const probe = { isSecureContext: globalThis.isSecureContext, xr: navigator.xr ?? null };
    const reason = enterReason(probe);
    const supported = await canEnterVr(probe);
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
    const repId = this.repIdAt(e); // What object did we click on?

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
        this.store.select(null);
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
    if (this.scenesMode || !repId || this.store.selectedId) {
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

  /**
   * Set camera state for scene framing: orbit angle, height, and zoom.
   * Used by ScenesView to frame shots.
   */
  public setCameraState(
    orbitAngle: number, orbitHeight: number, zoom: number, resetTarget = false, lookAt?: [number, number, number],
  ): void {
    if (lookAt) {
      this.controls.target.set(lookAt[0], lookAt[1], lookAt[2]);
    } else if (resetTarget) {
      const [fx, fy, fz] = this.store.layout.focus;
      this.controls.target.set(fx, fy, fz);
    }
    const target = this.controls.target;
    // Keep the camera's current distance from the target. With an orthographic camera distance doesn't change what
    // you see, so only azimuth (orbit) and elevation (height) are set here. Zoom is applied separately below.
    const radius = this.camera.position.distanceTo(target) || Math.hypot(14, 14, 14);
    const azimuth = (orbitAngle * Math.PI) / 180;
    const elevation = Math.min(Math.PI / 2 - 0.02, Math.max(0.03, ISO_ELEVATION + orbitHeight * HEIGHT_UNIT));
    this.camera.position.set(
      target.x + radius * Math.cos(elevation) * Math.sin(azimuth),
      target.y + radius * Math.sin(elevation),
      target.z + radius * Math.cos(elevation) * Math.cos(azimuth),
    );
    this.setZoom(zoom);
  }

  /** Pan: move the look-at point (and the camera with it) without changing orbit, tilt or zoom. */
  public setCameraTarget(x: number, y: number, z: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.set(x, y, z);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }

  /** The room's default look-at point (what "Reset pan" returns to). */
  public getDefaultTarget(): [number, number, number] {
    const [fx, fy, fz] = this.store.layout.focus;
    return [fx, fy, fz];
  }

  /** Zoom only: never touches orbit or position. */
  public setZoom(zoom: number): void {
    this.camera.zoom = Math.min(this.controls.maxZoom, Math.max(this.controls.minZoom, zoom));
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  /**
   * Read current camera state from the OrbitControls.
   * Returns orbit angle (0-360°), height offset, and zoom.
   * Used by ScenesView to capture manual camera adjustments.
   */
  public getCameraState(): { orbitAngle: number; orbitHeight: number; zoom: number; target: [number, number, number] } {
    // Exact inverse of setCameraState: offset of the camera from the target -> azimuth and elevation.
    const d = this.camera.position.clone().sub(this.controls.target);
    let orbitAngle = (Math.atan2(d.x, d.z) * 180) / Math.PI; // the default isometric view is 45
    if (orbitAngle < 0) orbitAngle += 360;
    const elevation = Math.atan2(d.y, Math.hypot(d.x, d.z));
    return {
      orbitAngle,
      orbitHeight: (elevation - ISO_ELEVATION) / HEIGHT_UNIT, // 0 = the normal isometric view
      zoom: this.camera.zoom,
      target: this.getCameraTarget(),
    };
  }

  /**
   * Set rotation for an object by representation ID (in radians).
   * Used by ScenesView to control object orientation.
   */
  public setObjectRotation(repId: string, rotationY: number): void {
    this.rotations.set(repId, rotationY);
    const entry = this.objects.get(repId);
    if (entry) {
      entry.group.rotation.y = rotationY;
      entry.customRotationY = rotationY; // Store to prevent tick() from resetting
    }
  }

  /** Forget every custom rotation (used when switching scenes so one scene's rotations don't leak into the next). */
  public clearObjectRotations(): void {
    this.rotations.clear();
    for (const e of this.objects.values()) e.customRotationY = undefined;
  }

  /**
   * Get rotation for an object by representation ID (in radians).
   * Returns 0 if object not found.
   */
  public getObjectRotation(repId: string): number {
    const entry = this.objects.get(repId);
    return entry ? (entry.customRotationY ?? YAW) : 0;
  }
}
