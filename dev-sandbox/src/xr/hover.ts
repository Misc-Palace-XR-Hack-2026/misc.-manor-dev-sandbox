import * as THREE from 'three';
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
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false }),
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

  private paint(preview: InspectPreview): void {
    const c = this.canvas.getContext('2d')!;
    c.clearRect(0, 0, 768, 256);
    c.fillStyle = 'rgba(28, 28, 32, 0.92)';
    c.fillRect(0, 0, 768, 256);
    c.fillStyle = '#ece7f5';
    c.font = '700 42px system-ui, sans-serif';
    c.fillText(preview.title || 'Untitled', 28, 70, 712);
    c.fillStyle = preview.href ? '#9be39b' : '#a39cb5';
    c.font = '28px system-ui, sans-serif';
    c.fillText(preview.detail || 'No link', 28, 122, 712);
    c.fillStyle = '#ece7f5';
    c.font = '24px system-ui, sans-serif';
    c.fillText(preview.href ? 'Trigger to select, then Open link' : 'Trigger to select', 28, 178, 712);
    this.texture.needsUpdate = true;
  }
}
