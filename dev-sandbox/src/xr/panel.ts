import * as THREE from 'three';
import type { Store } from '../core/store';
import { inspectPreview, panelButtons, runPanelAction, type NeighborhoodRoom, type PanelActionResult, type PanelPage } from './interaction';

const W = 1024;
const H = 1408;
const ROW = 92;
const TOP = 220;

export class XrPanel {
  readonly group = new THREE.Group();
  private canvas = document.createElement('canvas');
  private texture: THREE.CanvasTexture;
  private mesh: THREE.Mesh;
  private open = false;
  private hover = -1;
  private page: PanelPage = 'home';
  private scroll = 0;
  private shown: Array<{ id: string; y: number }> = [];

  constructor(
    private store: Store,
    private onAction: (result: PanelActionResult) => void,
    private rooms: NeighborhoodRoom[] = [],
  ) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.84, 1.16),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, side: THREE.DoubleSide }),
    );
    this.mesh.position.set(0, 1.28, -1.15);
    this.group.add(this.mesh);
    this.group.visible = false;
    this.store.subscribe(() => {
      if (this.open) this.redraw();
    });
    this.redraw();
  }

  get visible(): boolean {
    return this.open;
  }

  show(page: PanelPage = 'home'): void {
    this.open = true;
    this.group.visible = true;
    this.page = page;
    this.scroll = 0;
    this.redraw();
  }

  hide(): void {
    this.open = false;
    this.group.visible = false;
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  setHover(uv: { x: number; y: number } | null): void {
    if (!uv || !this.open) {
      this.hover = -1;
      return;
    }
    const y = (1 - uv.y) * H;
    this.hover = this.shown.findIndex((b) => Math.abs(b.y - y) < ROW / 2);
    this.redraw();
  }

  activate(uv: { x: number; y: number }): void {
    const y = (1 - uv.y) * H;
    const button = this.shown.find((b) => Math.abs(b.y - y) < ROW / 2);
    if (!button) return;
    if (button.id === 'ui:next') {
      this.scroll += 1;
      this.redraw();
      return;
    }
    if (button.id === 'ui:prev') {
      this.scroll = Math.max(0, this.scroll - 1);
      this.redraw();
      return;
    }
    const result = runPanelAction(this.store, button.id, this.rooms);
    if (result.page) {
      this.page = result.page;
      this.scroll = 0;
    }
    this.onAction(result);
    this.redraw();
  }

  private redraw(): void {
    const c = this.canvas.getContext('2d')!;
    c.fillStyle = 'rgba(28, 28, 32, 0.94)';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#ece7f5';
    c.font = '700 48px system-ui, sans-serif';
    c.fillText('Misc. Palace', 48, 72);
    c.font = '28px system-ui, sans-serif';
    const preview = this.store.selectedId ? inspectPreview(this.store, this.store.selectedId) : null;
    c.fillStyle = '#a39cb5';
    c.fillText(preview?.title || 'Squeeze to toggle this menu', 48, 122);
    c.fillText(preview?.href || preview?.detail || 'Point at an object to see its name and link.', 48, 158);
    if (this.store.saveError) {
      c.fillStyle = '#ffb9a8';
      c.fillText(this.store.saveError, 48, 194);
    }

    const all = panelButtons(this.store, this.page, this.rooms);
    const capacity = 10;
    const start = this.scroll * capacity;
    const slice = all.slice(start, start + capacity);
    this.shown = [];
    let y = TOP;
    const draw = (id: string, label: string, i: number) => {
      const active = i === this.hover;
      c.fillStyle = active ? '#dba08f' : '#3a3546';
      c.fillRect(48, y - 36, 928, 76);
      c.fillStyle = '#ece7f5';
      c.fillText(label, 72, y + 10);
      this.shown.push({ id, y });
      y += ROW;
    };
    slice.forEach((button, i) => draw(button.id, button.label, i));
    if (start > 0) draw('ui:prev', 'Previous', slice.length);
    if (start + capacity < all.length) draw('ui:next', 'More', this.shown.length);
    this.texture.needsUpdate = true;
  }
}
