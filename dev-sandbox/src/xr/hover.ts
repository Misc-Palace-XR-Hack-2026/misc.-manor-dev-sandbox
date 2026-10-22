import * as THREE from 'three';
import { HUD, hudPanel } from './hud';
import type { InspectPreview } from './interaction';

export class XrHoverLabel {
  readonly group = new THREE.Group();
  private canvas = document.createElement('canvas');
  private texture: THREE.CanvasTexture;
  private mesh: THREE.Mesh;
  private last = '';

  constructor() {
    this.canvas.width = 768;
    this.canvas.height = 256;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.21),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }),
    );
    this.mesh.renderOrder = 20;
    this.group.add(this.mesh);
    this.group.visible = false;
  }

  show(preview: InspectPreview, at: THREE.Vector3, camera: THREE.Camera): void {
    const key = preview.title + '\n' + preview.detail + '\n' + (preview.href ?? '');
    if (key !== this.last) {
      this.last = key;
      this.paint(preview);
    }
    this.group.position.copy(at);
    this.group.position.y += 0.28;
    this.group.lookAt(camera.getWorldPosition(new THREE.Vector3()));
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  private fit(c: CanvasRenderingContext2D, value: string): string {
    if (c.measureText(value).width <= 712) return value;
    let clipped = value;
    while (clipped.length && c.measureText(clipped + '…').width > 712) clipped = clipped.slice(0, -1);
    return clipped + '…';
  }

  private paint(preview: InspectPreview): void {
    const c = this.canvas.getContext('2d')!;
    c.clearRect(0, 0, 768, 256);
    hudPanel(c, 768, 256);
    c.fillStyle = HUD.text;
    c.font = '700 42px system-ui, sans-serif';
    c.fillText(this.fit(c, preview.title || 'Untitled'), 28, 70);
    c.fillStyle = preview.href ? HUD.mint : HUD.muted;
    c.font = '28px system-ui, sans-serif';
    c.fillText(this.fit(c, preview.detail || 'No link'), 28, 122);
    c.fillStyle = HUD.text;
    c.font = '24px system-ui, sans-serif';
    c.fillText(preview.href ? 'Trigger to select, then Open link' : 'Trigger to select', 28, 178, 712);
    this.texture.needsUpdate = true;
  }
}
