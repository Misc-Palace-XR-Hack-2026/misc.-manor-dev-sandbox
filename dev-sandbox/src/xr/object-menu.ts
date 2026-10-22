import * as THREE from 'three';
import { HUD, hudButton, hudRect } from './hud';
import type { Store } from '../core/store';
import { XrPreview } from './preview';
import { objectActions, objectMenuAnchor, runPanelAction, type PanelActionResult } from './interaction';
import { buildPreview } from '../core/preview';

const BUTTON_WIDTH = 0.26;
const BUTTON_HEIGHT = 0.11;
const BUTTON_GAP = 0.016;
const TOOLBAR_PADDING = 0.016;

/** Real pill silhouettes keep transparent corners out of controller hit tests. */
function pillGeometry(width: number, height: number): THREE.ShapeGeometry {
  const radius = height / 2;
  const shape = new THREE.Shape();
  shape.absarc(width / 2 - radius, 0, radius, -Math.PI / 2, Math.PI / 2, false);
  shape.absarc(-width / 2 + radius, 0, radius, Math.PI / 2, Math.PI * 1.5, false);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 24);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / width + .5, position.getY(i) / height + .5);
  return geometry;
}

export class XrObjectMenu {
  readonly group = new THREE.Group();
  useDomOverlay = false;
  private buttons: THREE.Mesh[] = [];
  private hover: THREE.Mesh | null = null;
  private backdrop: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial> | null = null;
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
    hudButton(c, 2, 2, 380, 156, { hover: hovered, floating: true, pill: true });
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
    if (this.backdrop) {
      this.backdrop.geometry.dispose();
      this.backdrop.material.map?.dispose();
      this.backdrop.material.dispose();
      this.group.remove(this.backdrop);
      this.backdrop = null;
    }
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
    const span = (actions.length - 1) * (BUTTON_WIDTH + BUTTON_GAP);
    if (actions.length) {
      const width = span + BUTTON_WIDTH + TOOLBAR_PADDING * 2;
      const height = BUTTON_HEIGHT + TOOLBAR_PADDING * 2;
      const canvas = document.createElement('canvas');
      canvas.height = 208;
      canvas.width = Math.round(canvas.height * width / height);
      const c = canvas.getContext('2d')!;
      hudRect(c, 2, 2, canvas.width - 4, canvas.height - 4, (canvas.height - 4) / 2, HUD.base);
      if (typeof c.roundRect === 'function' && typeof c.stroke === 'function') {
        c.beginPath();
        c.roundRect(2, 2, canvas.width - 4, canvas.height - 4, (canvas.height - 4) / 2);
        c.lineWidth = 2;
        c.strokeStyle = HUD.rim;
        c.stroke();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.backdrop = new THREE.Mesh(pillGeometry(width, height), new THREE.MeshBasicMaterial({
        map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
      }));
      this.backdrop.name = 'xr-object-toolbar';
      this.backdrop.position.z = -.002;
      this.backdrop.renderOrder = 20;
      // Decoration only, even when a caller raycasts the whole scene recursively.
      this.backdrop.raycast = () => {};
      this.group.add(this.backdrop);
    }
    actions.forEach((action, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = 384;
      canvas.height = 160;

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(
        pillGeometry(BUTTON_WIDTH, BUTTON_HEIGHT),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
      );
      mesh.position.set(i * (BUTTON_WIDTH + BUTTON_GAP) - span / 2, 0, 0);
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
