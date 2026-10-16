import * as THREE from 'three';
import type { Store } from '../core/store';
import { inspectPreview, loftBeaconVisible, objectIdFromRay, spawnPosition, stickForwardTeleport, walkableAt, walkableFloorPad, xrSelect, type NeighborhoodRoom, type PanelActionResult } from './interaction';
import { XrPanel } from './panel';
import { XrHoverLabel } from './hover';
import { XrObjectMenu } from './object-menu';

const SNAP = Math.PI / 4;
const RAY_LENGTH = 10;

export class XrSession {
  readonly player = new THREE.Group();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 40);
  private raycaster = new THREE.Raycaster();
  private temp = new THREE.Matrix4();
  private controllers: THREE.Group[] = [];
  private marker = new THREE.Mesh(
    new THREE.RingGeometry(0.16, 0.24, 28),
    new THREE.MeshBasicMaterial({ color: 0x9be39b, side: THREE.DoubleSide }),
  );
  private floors = new THREE.Group();
  private loftBeacon: THREE.Mesh;
  private panel: XrPanel;
  private hoverLabel = new XrHoverLabel();
  private objectMenu: XrObjectMenu;
  private lastSnap = 0;
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
  ) {
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');
    this.player.name = 'xr-player';
    this.player.add(this.camera);
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.loftBeacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 1.8, 16),
      new THREE.MeshBasicMaterial({ color: 0x9be39b, transparent: true, opacity: 0.55 }),
    );
    this.loftBeacon.position.set(2.0, 3.2, 1.6);
    this.loftBeacon.userData.walkable = true;
    this.loftBeacon.visible = false;
    this.scene.add(this.player, this.floors, this.marker, this.hoverLabel.group);
    this.panel = new XrPanel(store, (result) => this.onPanel(result), rooms);
    this.objectMenu = new XrObjectMenu(store, (result) => this.onPanel(result));
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
    const session = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
    await this.renderer.xr.setSession(session);
  }

  async exit(): Promise<void> {
    const session = this.renderer.xr.getSession();
    if (session) await session.end();
  }

  tick(): THREE.Camera | null {
    if (!this.renderer.xr.isPresenting) return null;
    this.updateControllers();
    this.syncGuides();
    return this.camera;
  }

  private onStart(): void {
    this.presenting = true;
    const spawn = spawnPosition();
    this.player.position.set(spawn.x, spawn.y, spawn.z);
    this.player.rotation.set(0, 0, 0);
    this.store.select(null);
    this.panel.show();
    this.syncGuides();
  }

  private onEnd(): void {
    this.presenting = false;
    this.store.select(null);
    this.marker.visible = false;
    this.hoverPoint = null;
    this.panel.hide();
    this.hoverLabel.hide();
    this.objectMenu.hide();
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
    this.floors.add(floor, loft, this.loftBeacon);
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
      this.panel.activate(hit.uv);
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
      }
      return;
    }
    if (hit?.kind === 'object' && hit.id) xrSelect(this.store, { kind: 'object', id: hit.id });
    else if (!hit) this.store.select(null);
  }

  private onPanel(result: PanelActionResult): void {
    if (result.openUrl) {
      const a = document.createElement('a');
      a.href = result.openUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.append(a);
      a.click();
      a.remove();
    }
    if (result.page) this.panel.show(result.page);
    if (this.store.selectedId && !this.store.slotOf(this.store.selectedId)) this.placing = true;
    if (result.exit) void this.exit();
    if (result.teleport) this.player.position.set(result.teleport.x, result.teleport.y, result.teleport.z);
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
    this.loftBeacon.visible = loftBeaconVisible(inVr, this.player.position.y);
  }

  private updateControllers(): void {
    const now = performance.now();
    const session = this.renderer.xr.getSession();
    this.hoverPoint = null;
    this.marker.visible = false;
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
      if (hit?.kind === 'panel' && hit.uv) this.panel.setHover(hit.uv);
      if (hit?.kind === 'action' && hit.target) this.objectMenu.setHover(hit.target);
      if (hit?.kind === 'object' && hit.id && hit.id !== this.store.selectedId) {
        const preview = inspectPreview(this.store, hit.id);
        if (preview.title) this.hoverLabel.show(preview, hit.point, this.camera);
      }
      if (hit?.kind === 'floor' && !this.placing) {
        this.hoverPoint = hit.point;
        this.marker.position.copy(hit.point);
        this.marker.position.y += 0.02;
        this.marker.visible = true;
      }
    }
    if (session) {
      for (const source of session.inputSources) {
        const gp = source.gamepad;
        if (!gp) continue;
        const x = gp.axes[2] ?? gp.axes[0] ?? 0;
        const y = gp.axes[3] ?? gp.axes[1] ?? 0;
        if (Math.abs(x) > 0.7 && Math.abs(x) >= Math.abs(y) && now - this.lastSnap > 280) {
          this.player.rotateY(-Math.sign(x) * SNAP);
          this.lastSnap = now;
        } else {
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
  }

  private pick(controller: THREE.Group):
    | { kind: 'object' | 'slot' | 'floor' | 'panel' | 'action'; id?: string; point: THREE.Vector3; uv?: { x: number; y: number }; target?: THREE.Mesh }
    | null {
    const ray = this.rayFrom(controller);
    const actionHit = this.objectMenu.hit(ray);
    if (actionHit) return { kind: 'action', point: actionHit.point, target: actionHit.object as THREE.Mesh };
    const panelHit = ray.intersectObject(this.panel.group, true)[0];
    if (panelHit && this.panel.group.visible) {
      return { kind: 'panel', point: panelHit.point, uv: panelHit.uv ? { x: panelHit.uv.x, y: panelHit.uv.y } : undefined };
    }
    if (this.placing && this.store.selectedId) {
      const slot = ray.intersectObjects(this.slots.children, false)[0];
      if (slot) return { kind: 'slot', id: slot.object.userData.slotId, point: slot.point };
      return null;
    }
    if (this.loftBeacon.visible) {
      const beacon = ray.intersectObject(this.loftBeacon, false)[0];
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
