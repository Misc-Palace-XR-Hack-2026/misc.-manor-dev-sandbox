import * as THREE from 'three';
import type { Store } from '../core/store';
import { walkStairs, inspectPreview, loftBeaconVisible, objectIdFromRay, overlayIsGranted, spawnPosition, stairHeight, stickForwardTeleport, walkableAt, walkableFloorPad, xrSelect, xrSessionInit, type NeighborhoodRoom, type PanelActionResult } from './interaction';
import type { OnboardingState } from '../core/onboarding';
import { XrPanel } from './panel';
import { XrHoverLabel } from './hover';
import { XrObjectMenu } from './object-menu';
import { buildPreview } from '../core/preview';
import { mediaArt } from '../core/media-art';
import { PreviewCardView } from '../views/preview-card';

const SNAP = Math.PI / 4;
const RAY_LENGTH = 10;
const TELEPORT_TEAL = 0x4dffd2;
const TELEPORT_MINT = 0xb8fff0;

class XrTeleportPillar {
  readonly group = new THREE.Group();
  readonly hitTarget: THREE.Object3D;
  private readonly float = new THREE.Group();
  private readonly floorGlowMat: THREE.MeshBasicMaterial;
  private readonly runeMat: THREE.MeshBasicMaterial;
  private readonly innerRingMat: THREE.MeshBasicMaterial;
  private readonly veilMat: THREE.MeshBasicMaterial;
  private readonly coreMat: THREE.MeshBasicMaterial;
  private readonly sparkMat: THREE.PointsMaterial;
  private readonly sparkGeo: THREE.BufferGeometry;
  private readonly sparkPos: Float32Array;
  private readonly sparkSeed: Array<{ a: number; r: number; speed: number; y: number }>;
  private readonly wisps: Array<{ sprite: THREE.Sprite; phase: number }>;
  private readonly light: THREE.PointLight;
  constructor(private radius: number, private height: number, interactive = false, color = TELEPORT_TEAL, highlight = TELEPORT_MINT) {
    this.group.add(this.float);
    const glow = (color: number, map: THREE.Texture, opacity: number, side: THREE.Side = THREE.FrontSide) =>
      new THREE.MeshBasicMaterial({
        color, map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side, toneMapped: false,
      });
    const dot = this.dotTexture();

    this.floorGlowMat = glow(color, dot, 0.45);
    const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(radius * 4, radius * 4).rotateX(-Math.PI / 2), this.floorGlowMat);
    floorGlow.position.y = 0.012;
    floorGlow.renderOrder = 5;

    this.runeMat = glow(color, this.runeTexture(), 0.95);
    const runes = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2), this.runeMat);
    runes.position.y = 0.02;
    runes.renderOrder = 6;

    this.innerRingMat = new THREE.MeshBasicMaterial({ color: highlight, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const innerRing = new THREE.Mesh(new THREE.RingGeometry(radius * 0.52, radius * 0.6, 64).rotateX(-Math.PI / 2), this.innerRingMat);
    innerRing.position.y = 0.026;
    innerRing.renderOrder = 6;

    const columnTex = this.columnTexture();
    columnTex.wrapS = THREE.RepeatWrapping;
    this.veilMat = glow(color, columnTex, 0.55, THREE.DoubleSide);
    const veil = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, height, 40, 1, true), this.veilMat);
    veil.position.y = height / 2;
    veil.renderOrder = 7;

    const coreTex = this.columnTexture();
    this.coreMat = glow(highlight, coreTex, 0.42, THREE.DoubleSide);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.24, radius * 0.34, height * 0.8, 28, 1, true), this.coreMat);
    core.position.y = height * 0.4;
    core.renderOrder = 7;

    const sparks = Math.max(22, Math.round(height * 18));
    this.sparkPos = new Float32Array(sparks * 3);
    this.sparkSeed = Array.from({ length: sparks }, (_, i) => ({
      a: (i * 2.399) % (Math.PI * 2),
      r: radius * (0.22 + 0.78 * ((i * 0.618) % 1)),
      speed: 0.22 + ((i * 0.41) % 1) * 0.28,
      y: ((i * 0.53) % 1) * height,
    }));
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkMat = new THREE.PointsMaterial({
      color: highlight, map: dot, size: Math.max(0.06, radius * 0.14), sizeAttenuation: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const sparkPoints = new THREE.Points(this.sparkGeo, this.sparkMat);
    sparkPoints.renderOrder = 8;
    sparkPoints.frustumCulled = false;

    const wispMat = new THREE.SpriteMaterial({ color, map: dot, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.wisps = [0, Math.PI].map((phase) => {
      const sprite = new THREE.Sprite(wispMat);
      sprite.scale.setScalar(Math.min(radius * 0.9, height * 0.4));
      sprite.renderOrder = 8;
      this.float.add(sprite);
      return { sprite, phase };
    });

    this.light = new THREE.PointLight(color, 3.4, Math.max(3.2, height * 1.8), 1.6);
    this.light.position.y = Math.min(0.9, height * 0.5);

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, 16),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.y = height / 2;
    this.hitTarget = interactive ? hit : veil;

    this.float.add(floorGlow, runes, innerRing, veil, core, sparkPoints, this.light, hit);
    this.placeSparks();
    this.placeWisps(0);
    this.group.visible = false;
  }

  setPosition(point: THREE.Vector3): void {
    this.group.position.copy(point);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  update(t: number, dt: number): void {
    if (!this.group.visible) return;
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pulse = still ? 1 : 1 + 0.12 * Math.sin(t * 2.0);
    this.veilMat.opacity = 0.5 * pulse;
    this.coreMat.opacity = 0.42 * (still ? 1 : 1 + 0.18 * Math.sin(t * 3.1 + 1));
    this.floorGlowMat.opacity = 0.43 * pulse;
    this.innerRingMat.opacity = 0.66 * pulse;
    this.runeMat.opacity = 0.9 * pulse;
    this.light.intensity = 3.4 * pulse;
    if (still) return;
    this.float.position.y = (1 + Math.sin(t * 1.3)) * Math.min(0.03, this.height * 0.04);
    const runes = this.float.children[3];
    const innerRing = this.float.children[4];
    runes.rotation.y += dt * 0.24;
    innerRing.rotation.y -= dt * 0.55;
    for (const s of this.sparkSeed) {
      s.y += dt * s.speed;
      s.a += dt * 0.3;
      if (s.y > this.height) s.y -= this.height;
    }
    this.placeSparks();
    this.sparkMat.opacity = 0.73 + 0.14 * Math.sin(t * 4);
    this.placeWisps(t);
  }

  private placeSparks(): void {
    for (let i = 0; i < this.sparkSeed.length; i++) {
      const s = this.sparkSeed[i];
      this.sparkPos[i * 3] = Math.cos(s.a) * s.r;
      this.sparkPos[i * 3 + 1] = s.y;
      this.sparkPos[i * 3 + 2] = Math.sin(s.a) * s.r;
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
  }

  private placeWisps(t: number): void {
    for (const w of this.wisps) {
      const a = t * 0.7 + w.phase;
      w.sprite.position.set(
        Math.cos(a) * (this.radius * 0.9),
        this.height * 0.54 + Math.sin(t * 1.1 + w.phase) * (this.height * 0.12),
        Math.sin(a) * (this.radius * 0.9),
      );
    }
  }

  private canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    draw(canvas.getContext('2d')!, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private dotTexture(): THREE.CanvasTexture {
    return this.canvasTexture(64, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });
  }

  private runeTexture(): THREE.CanvasTexture {
    return this.canvasTexture(512, (ctx, s) => {
      const c = s / 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
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
    });
  }

  private columnTexture(): THREE.CanvasTexture {
    return this.canvasTexture(128, (ctx, s) => {
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
      ctx.globalCompositeOperation = 'source-over';
    });
  }
}

export class XrSession {
  readonly player = new THREE.Group();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 40);
  private raycaster = new THREE.Raycaster();
  private temp = new THREE.Matrix4();
  private controllers: THREE.Group[] = [];
  private marker = new XrTeleportPillar(0.24, 0.12);
  private floors = new THREE.Group();
  private loftBeacon = new XrTeleportPillar(0.34, 1.9, true, 0x49ed65, 0xbaffc2);
  private panel: XrPanel;
  private hoverLabel = new XrHoverLabel();
  private objectMenu: XrObjectMenu;
  private overlay: HTMLElement;
  private overlayCard: PreviewCardView;
  private overlayGranted = false;
  private lastSnap = 0;
  private lastWalk = 0;
  private hoverPoint: THREE.Vector3 | null = null;
  private placing = false;
  presenting = false;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private store: Store,
    private objects: THREE.Group,
    private slots: THREE.Group,
    private room: THREE.Group,
    rooms: NeighborhoodRoom[] = [],
    private onTutorial?: (event: string) => void,
  ) {
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');
    this.player.name = 'xr-player';
    this.player.add(this.camera);
    this.marker.setVisible(false);
    this.loftBeacon.setPosition(new THREE.Vector3(2.0, 2.28, 1.6));
    this.loftBeacon.group.userData.walkable = true;
    this.loftBeacon.setVisible(false);
    this.scene.add(this.player, this.floors, this.marker.group, this.hoverLabel.group);
    this.panel = new XrPanel(store, (result) => this.onPanel(result), rooms);
    this.objectMenu = new XrObjectMenu(store, (result) => this.onPanel(result));
    this.overlay = document.createElement('div');
    this.overlay.id = 'xr-dom-overlay';
    this.overlay.className = 'xr-dom-overlay';
    this.overlay.hidden = true;
    document.body.append(this.overlay);
    this.overlayCard = new PreviewCardView(this.overlay);
    this.player.add(this.panel.group);
    this.scene.add(this.objectMenu.group);
    this.buildFloors();
    this.bindControllers();
    this.renderer.xr.addEventListener('sessionstart', () => this.onStart());
    this.renderer.xr.addEventListener('sessionend', () => this.onEnd());
  }

  async enter(): Promise<void> {
    if (!globalThis.isSecureContext) throw new Error('Enter VR needs HTTPS or localhost.');
    const xr = navigator.xr;
    if (!xr) throw new Error('WebXR is not available in this browser.');
    const ok = await xr.isSessionSupported('immersive-vr');
    if (!ok) throw new Error('This headset/browser does not support immersive VR.');
    const session = await xr.requestSession('immersive-vr', xrSessionInit(this.overlay));
    this.overlayGranted = overlayIsGranted(session);
    this.objectMenu.useDomOverlay = this.overlayGranted;
    this.overlay.hidden = !this.overlayGranted;
    try {
      await this.renderer.xr.setSession(session);
    } catch (error) {
      this.overlayGranted = false;
      this.objectMenu.useDomOverlay = false;
      this.overlayCard.show(null);
      this.overlay.hidden = true;
      try { await session.end(); } catch { /* session may already be ending */ }
      throw error;
    }
  }

  async exit(): Promise<void> {
    const session = this.renderer.xr.getSession();
    if (session) await session.end();
  }

  tick(): THREE.Camera | null {
    if (!this.renderer.xr.isPresenting) return null;
    const tutorial=(globalThis as unknown as {tutorial?:{state:OnboardingState}}).tutorial;
    if(tutorial) this.panel.setGuide(tutorial.state);
    const now = performance.now();
    const dt = this.lastWalk > 0 ? Math.min(.05, (now - this.lastWalk) / 1000) : 1 / 60;
    this.lastWalk = now;
    this.updateControllers(now, dt);
    const t = now / 1000;
    this.marker.update(t, dt);
    this.loftBeacon.update(t, dt);
    this.syncGuides();
    return this.camera;
  }

  private onStart(): void {
    this.presenting = true;
    const spawn = spawnPosition();
    this.player.position.set(spawn.x, spawn.y, spawn.z);
    this.player.rotation.set(0, 0, 0);
    this.store.select(null);
    this.overlayGranted = this.overlayGranted || overlayIsGranted(this.renderer.xr.getSession());
    this.objectMenu.useDomOverlay = this.overlayGranted;
    this.overlay.hidden = !this.overlayGranted;
    const tutorial = (globalThis as unknown as { tutorial?: { state: unknown } }).tutorial;
    this.panel.setGuide((tutorial?.state as typeof this.panel.guide) ?? null);
    this.panel.show(this.panel.guide?.status === 'fresh' && !this.panel.guide.lesson ? 'welcome' : 'home');
    this.syncGuides();
  }

  private onEnd(): void {
    this.presenting = false;
    this.store.select(null);
    this.marker.setVisible(false);
    this.hoverPoint = null;
    this.panel.hide();
    this.hoverLabel.hide();
    this.objectMenu.hide();
    this.overlayCard.show(null);
    this.overlay.hidden = true;
    this.overlayGranted = false;
    this.objectMenu.useDomOverlay = false;
    this.placing = false;
    this.syncGuides();
  }

  private buildFloors(): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9be39b,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const pad = walkableFloorPad();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(pad.width, pad.depth), mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(pad.x, 0.02, pad.z);
    floor.userData.walkable = true;
    const loft = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), mat.clone());
    loft.rotation.x = -Math.PI / 2;
    loft.position.set(2.0, 2.32, 1.5);
    loft.userData.walkable = true;
    const stair = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3.7), mat.clone());
    stair.rotation.x = -Math.atan2(2.3, 2.8);
    stair.position.set(0.7, 1.15, 4.4);
    stair.userData.walkable = true;
    this.floors.add(floor, loft, this.loftBeacon.group, stair);
    this.floors.visible = false;
  }

  private bindControllers(): void {
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -RAY_LENGTH)]),
        new THREE.LineBasicMaterial({ color: 0xece7f5 }),
      );
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), new THREE.MeshBasicMaterial({ color: 0xece7f5 }));
      controller.add(line, tip);
      controller.addEventListener('selectstart', () => this.onSelectStart(controller));
      controller.addEventListener('selectend', () => this.onSelectEnd(controller));
      controller.addEventListener('connected', (event: { data?: XRInputSource }) => {
        controller.userData.handedness = event.data?.handedness;
        controller.userData.targetRayMode = event.data?.targetRayMode;
      });
      controller.addEventListener('disconnected', () => {
        if (this.store.selectedId) this.store.select(null);
      });
      this.player.add(controller);
      this.controllers.push(controller);
    }
  }

  private rayFrom(controller: THREE.Group): THREE.Raycaster {
    this.temp.identity().extractRotation(controller.matrixWorld);
    this.raycaster.far = RAY_LENGTH;
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.temp);
    return this.raycaster;
  }

  private onSelectStart(controller: THREE.Group): void {
    if (controller.userData.targetRayMode && controller.userData.targetRayMode !== 'tracked-pointer') return;
    controller.userData.selecting = true;
  }

  private onSelectEnd(controller: THREE.Group): void {
    controller.userData.selecting = false;
    const hit = this.pick(controller);
    if (hit?.kind === 'action' && hit.target) {
      this.objectMenu.activate(hit.target);
      return;
    }
    if (hit?.kind === 'panel' && hit.uv) {
      this.panel.activate(hit.uv, hit.target);
      return;
    }
    if (hit?.kind === 'floor' && !this.placing) {
      this.teleport(hit.point);
      return;
    }
    if (this.placing && this.store.selectedId) {
      if (hit?.kind === 'slot') {
        xrSelect(this.store, { kind: 'destination', id: hit.id });
        this.placing = false;
        this.onTutorial?.('placed');
      }
      return;
    }
    if (hit?.kind === 'object' && hit.id) xrSelect(this.store, { kind: 'object', id: hit.id });
    else if (!hit) this.store.select(null);
  }

  private onPanel(result: PanelActionResult): void {
    if (result.openEmbed) {
      if (this.overlayGranted) {
        const rep = this.store.selectedId ? this.store.state.representations.find((r) => r.id === this.store.selectedId) : undefined;
        const content = rep ? this.store.content(rep.contentItemId) : undefined;
        if (content) {
          const preview = buildPreview(content);
          if (preview.kind === 'embed') {
            this.overlayCard.show(preview, mediaArt(content), result.openEmbed.fallbackUrl);
            this.overlay.hidden = false;
          }
        }
      } else {
        const a = document.createElement('a');
        a.href = result.openEmbed.fallbackUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.append(a);
        a.click();
        a.remove();
        void this.exit();
      }
    }
    if (result.openUrl) {
      const a = document.createElement('a');
      a.href = result.openUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.append(a);
      a.click();
      a.remove();
    }
    if (result.page && result.page !== 'guide') this.panel.show(result.page, Boolean(result.preserveDraft));
    if (result.tutorialEvent) this.onTutorial?.(result.tutorialEvent);
    const tutorial = (globalThis as unknown as { tutorial?: { state: OnboardingState | null } }).tutorial;
    if (tutorial) this.panel.setGuide(tutorial.state);
    if (this.store.selectedId && !this.store.slotOf(this.store.selectedId)) this.placing = true;
    if (result.exit) void this.exit();
    if (result.teleport) {
      this.player.position.set(result.teleport.x, result.teleport.y, result.teleport.z);
    }
    this.syncGuides();
  }

  private teleport(point: THREE.Vector3): void {
    const landing = walkableAt(point) ?? (point.y > 1.6 ? { x: 2.0, y: 2.3, z: 1.6 } : null);
    if (!landing) return;
    this.player.position.set(landing.x, landing.y, landing.z);
    this.syncGuides();
  }

  private syncGuides(): void {
    const inVr = this.presenting;
    this.floors.visible = inVr;
    this.loftBeacon.setVisible(loftBeaconVisible(inVr, this.player.position.y));
  }

  private updateControllers(now: number, dt: number): void {
    const session = this.renderer.xr.getSession();
    this.hoverPoint = null;
    this.marker.setVisible(false);
    this.hoverLabel.hide();
    if (!this.store.selectedId) this.placing = false;
    let menuAt: THREE.Vector3 | null = null;
    if (this.store.selectedId) {
      let selected: THREE.Object3D | undefined;
      this.objects.traverse((o) => {
        if (o.userData.repId === this.store.selectedId) selected = o;
      });
      if (selected) {
        const box = new THREE.Box3().setFromObject(selected);
        menuAt = box.getCenter(new THREE.Vector3());
        menuAt.y = box.max.y;
      }
    }
    for (const controller of this.controllers) {
      const hit = this.pick(controller);
      if (hit?.kind === 'panel' && hit.uv) this.panel.setHover(hit.uv, hit.target);
      if (hit?.kind === 'action' && hit.target) this.objectMenu.setHover(hit.target);
      if (hit?.kind === 'object' && hit.id && hit.id !== this.store.selectedId) {
        const preview = inspectPreview(this.store, hit.id);
        if (preview.title) this.hoverLabel.show(preview, hit.point, this.camera);
      }
      if (hit?.kind === 'floor' && !this.placing) {
        this.hoverPoint = hit.point;
        this.marker.setPosition(new THREE.Vector3(hit.point.x, hit.point.y + 0.01, hit.point.z));
        this.marker.setVisible(true);
      }
    }
    if (session) {
      for (const source of session.inputSources) {
        const gp = source.gamepad;
        if (!gp) continue;
        const x = gp.axes[2] ?? gp.axes[0] ?? 0;
        const y = gp.axes[3] ?? gp.axes[1] ?? 0;
        let walkedStairs = false;
        if (source.handedness === 'left' && !this.placing) {
          const onStairs = Math.abs(this.player.position.y - stairHeight(this.player.position.z)) <= .08
            && this.player.position.x >= .3 && this.player.position.x <= 1.1
            && this.player.position.z >= 2.6 && this.player.position.z <= 6.2;
          if (onStairs) {
            const p = walkStairs(this.player.position, y, dt);
            this.player.position.set(p.x,p.y,p.z);
            walkedStairs = true;
          }
        }
        if (Math.abs(x) > 0.7 && Math.abs(x) >= Math.abs(y) && now - this.lastSnap > 280) {
          this.player.rotateY(-Math.sign(x) * SNAP);
          this.lastSnap = now;
        } else if (!walkedStairs) {
          const landing = stickForwardTeleport(this.hoverPoint, this.placing, y);
          if (landing && now - this.lastSnap > 280) {
            this.teleport(new THREE.Vector3(landing.x, landing.y, landing.z));
            this.lastSnap = now;
          }
        }
        const menu = gp.buttons[5] ?? gp.buttons[4] ?? gp.buttons[1];
        if (menu?.pressed && now - this.lastSnap > 400) {
          this.panel.toggle();
          this.lastSnap = now;
        }
      }
    }
    // Pickup keeps the destination ray clear and hides the selected preview.
    this.objectMenu.follow(this.placing ? null : menuAt, this.camera);
    this.syncOverlay();
  }

  private syncOverlay(): void {
    if (!this.presenting || !this.overlayGranted || this.placing || !this.store.selectedId) {
      this.overlayCard.show(null);
      return;
    }
    const rep = this.store.state.representations.find((r) => r.id === this.store.selectedId);
    const content = rep ? this.store.content(rep.contentItemId) : undefined;
    if (!content) {
      this.overlayCard.show(null);
      return;
    }
    const preview = buildPreview(content);
    this.overlayCard.show(preview, mediaArt(content));
    this.overlayCard.moveTo(this.overlay.clientWidth / 2 || 160, (this.overlay.clientHeight || 240) * 0.42);
  }

  private pick(controller: THREE.Group):
    | { kind: 'object' | 'slot' | 'floor' | 'panel' | 'action'; id?: string; point: THREE.Vector3; uv?: { x: number; y: number }; target?: THREE.Mesh }
    | null {
    const ray = this.rayFrom(controller);
    const actionHit = this.objectMenu.hit(ray);
    if (actionHit) return { kind: 'action', point: actionHit.point, target: actionHit.object as THREE.Mesh };
    const panelHit = this.panel.hit(ray);
    if (panelHit) {
      return { kind: 'panel', point: panelHit.point, uv: panelHit.uv, target: panelHit.mesh };
    }
    if (this.placing && this.store.selectedId) {
      const slot = ray.intersectObjects(this.slots.children, false)[0];
      if (slot) return { kind: 'slot', id: slot.object.userData.slotId, point: slot.point };
      return null;
    }
    if (this.loftBeacon.visible) {
      const beacon = ray.intersectObject(this.loftBeacon.hitTarget, false)[0];
      if (beacon) return { kind: 'floor', point: new THREE.Vector3(2.0, 2.3, 1.6) };
    }
    const object = ray.intersectObjects(this.objects.children, true)[0];
    const floor = ray.intersectObjects(this.floors.children, false)[0];
    const occluder = ray.intersectObjects(this.room.children, true)[0];
    let objectId: string | undefined;
    if (object) {
      let o: THREE.Object3D | null = object.object;
      while (o && !o.userData.repId) o = o.parent;
      objectId = o?.userData.repId;
    }
    if (objectId && objectIdFromRay({ id: objectId, distance: object.distance }, occluder ? { distance: occluder.distance } : null)) {
      if (!floor || object.distance <= floor.distance + 0.02) return { kind: 'object', id: objectId, point: object.point };
    }
    if (floor && walkableAt(floor.point)) return { kind: 'floor', point: floor.point };
    return null;
  }
}
