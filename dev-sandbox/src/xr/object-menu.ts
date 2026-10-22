import * as THREE from 'three';
import { hudButton } from './hud';
import type { Store } from '../core/store';
import { XrPreview } from './preview';
import { objectActions, objectMenuAnchor, runPanelAction, type PanelActionResult } from './interaction';
import { buildPreview } from '../core/preview';

export class XrObjectMenu {
  readonly group = new THREE.Group();
  useDomOverlay = false;
  private buttons: THREE.Mesh[] = [];
  private hover: THREE.Mesh | null = null;
  private preview: XrPreview | null = null;

  constructor(private store: Store, private onAction: (result: PanelActionResult) => void) {
    this.group.visible = false;
    this.store.subscribe(() => this.rebuild());
  }

  follow(origin: THREE.Vector3 | null, camera: THREE.Camera): void {
    if (!this.store.selectedId || !origin) {
      this.group.visible = false;
      return;
    }
    if (!this.buttons.length) this.rebuild();
    const at = objectMenuAnchor({ x: origin.x, y: origin.y, z: origin.z });
    this.group.position.set(at.x, at.y, at.z);
    this.group.lookAt(camera.getWorldPosition(new THREE.Vector3()));
    this.group.visible = this.buttons.length > 0;
  }

  hide(): void {
    this.group.visible = false;
    this.setHover(null);
  }

  hit(ray: THREE.Raycaster): THREE.Intersection | null {
    if (!this.group.visible) return null;
    return ray.intersectObjects(this.buttons, false)[0] ?? null;
  }

  setHover(mesh: THREE.Mesh | null): void {
    if (this.hover === mesh) return;
    if (this.hover) this.paintButton(this.hover, false);
    this.hover = mesh;
    if (this.hover) this.paintButton(this.hover, true);
  }

  private paintButton(mesh: THREE.Mesh, hovered: boolean): void {
    const texture = (mesh.material as THREE.MeshBasicMaterial).map as THREE.CanvasTexture;
    const c = (texture.image as HTMLCanvasElement).getContext('2d')!;
    c.clearRect?.(0, 0, 384, 160);
    hudButton(c, 2, 2, 380, 156, { hover: hovered, floating: true, primary: mesh.userData.actionId === 'page:object', danger: mesh.userData.actionId === 'delete' });
    c.font = '600 44px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText(mesh.userData.label, 192, 96, 336);
    texture.needsUpdate = true;
  }

  activate(mesh: THREE.Object3D): void {
    const id = mesh.userData.actionId as string | undefined;
    if (!id) return;
    this.onAction(runPanelAction(this.store, id));
  }

  private rebuild(): void {
    if (this.preview) {
      this.group.remove(this.preview.mesh);
      this.preview.dispose();
      this.preview = null;
    }
    for (const button of this.buttons) {
      button.geometry.dispose();
      (button.material as THREE.MeshBasicMaterial).map?.dispose();
      (button.material as THREE.Material).dispose();
      this.group.remove(button);
    }
    this.buttons = [];
    this.hover = null;
    const actions = objectActions(this.store);
    const rep = this.store.state.representations.find(r => r.id === this.store.selectedId);
    const content = rep ? this.store.content(rep.contentItemId) : undefined;
    if (content && !(this.useDomOverlay && buildPreview(content).kind === 'embed')) {
      this.preview = new XrPreview(content);
      this.group.add(this.preview.mesh);
      actions.push({ id: 'cancel', label: 'Close' });
    } else if (content) {
      actions.push({ id: 'cancel', label: 'Close' });
    }
    const span = (actions.length - 1) * 0.28;
    actions.forEach((action, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = 384;
      canvas.height = 160;

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.26, 0.11),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
      );
      mesh.position.set(i * 0.28 - span / 2, 0, 0);
      mesh.renderOrder = 21;
      mesh.userData.actionId = action.id;
      mesh.userData.label = action.label;
      this.paintButton(mesh, false);
      this.group.add(mesh);
      this.buttons.push(mesh);
    });
    // Store updates also run in desktop mode. Only follow(), called by
    // the active XR frame loop, may reveal the menu; rebuild must not.
    this.group.visible = this.group.visible && actions.length > 0;
  }
}
