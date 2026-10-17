import * as THREE from 'three';
import type { Store } from '../core/store';
import { inspectPreview, panelButtons, runPanelAction, type NeighborhoodRoom, type PanelActionResult, type PanelPage } from './interaction';
import { XrCreation } from './creation';
import type { OnboardingState } from '../core/onboarding';

const W = 1024;
const H = 1408;
const GW = 768;
const GH = 640;
const ROW = 92;
const TOP = 220;

export class XrPanel {
  readonly group = new THREE.Group();
  private canvas = document.createElement('canvas');
  private texture: THREE.CanvasTexture;
  private mesh: THREE.Mesh;
  private guideCanvas = document.createElement('canvas');
  private guideTexture: THREE.CanvasTexture;
  private guideMesh: THREE.Mesh;
  private open = false;
  private hover = -1;
  private guideHover = -1;
  private page: PanelPage = 'home';
  private scroll = 0;
  private shown: Array<{ id: string; y: number }> = [];
  private guideShown: Array<{ id: string; y: number }> = [];
  draft = new XrCreation();
  guide: OnboardingState | null = null;

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
    this.mesh.name = 'xr-menu';
    this.guideCanvas.width = GW;
    this.guideCanvas.height = GH;
    this.guideTexture = new THREE.CanvasTexture(this.guideCanvas);
    this.guideTexture.colorSpace = THREE.SRGBColorSpace;
    this.guideMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.52),
      new THREE.MeshBasicMaterial({ map: this.guideTexture, transparent: true, side: THREE.DoubleSide }),
    );
    this.guideMesh.position.set(0.78, 1.42, -1.05);
    this.guideMesh.name = 'xr-tutorial';
    this.guideMesh.visible = false;
    this.group.add(this.mesh, this.guideMesh);
    this.group.visible = false;
    this.store.subscribe(() => {
      if (this.open) this.redraw();
      this.redrawGuide();
    });
    this.redraw();
    this.redrawGuide();
  }

  get visible(): boolean {
    return this.open;
  }

  show(page: PanelPage = 'home'): void {
    if (page === 'guide') {
      this.redrawGuide();
      this.syncVisible();
      return;
    }
    this.open = true;
    this.page = page;
    this.scroll = 0;
    if (page === 'create') this.draft = new XrCreation();
    this.redraw();
    this.syncVisible();
  }

  hide(): void {
    this.open = false;
    this.syncVisible();
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show(this.page === 'guide' ? 'home' : this.page);
  }

  setGuide(guide: OnboardingState | null): void {
    this.guide = guide;
    this.redrawGuide();
    this.syncVisible();
  }

  hit(ray: THREE.Raycaster): { uv: { x: number; y: number }; mesh: THREE.Mesh; point: THREE.Vector3 } | null {
    const hits = ray.intersectObjects([this.mesh, this.guideMesh], false);
    const hit = hits.find((h) => h.object.visible);
    if (!hit?.uv) return null;
    return { uv: { x: hit.uv.x, y: hit.uv.y }, mesh: hit.object as THREE.Mesh, point: hit.point };
  }

  setHover(uv: { x: number; y: number } | null, mesh?: THREE.Mesh): void {
    if (!uv) {
      this.hover = -1;
      this.guideHover = -1;
      return;
    }
    if (mesh === this.guideMesh) {
      const y = (1 - uv.y) * GH;
      this.guideHover = this.guideShown.findIndex((b) => Math.abs(b.y - y) < ROW / 2);
      this.redrawGuide();
      return;
    }
    if (!this.open) {
      this.hover = -1;
      return;
    }
    const y = (1 - uv.y) * H;
    this.hover = this.shown.findIndex((b) => Math.abs(b.y - y) < ROW / 2);
    this.redraw();
  }

  activate(uv: { x: number; y: number }, mesh?: THREE.Mesh): void {
    if (mesh === this.guideMesh) {
      const y = (1 - uv.y) * GH;
      const button = this.guideShown.find((b) => Math.abs(b.y - y) < ROW / 2);
      if (!button) return;
      const result = runPanelAction(this.store, button.id, this.rooms, this.draft);
      this.onAction(result);
      this.redrawGuide();
      return;
    }
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
    const result = runPanelAction(this.store, button.id, this.rooms, this.draft);
    if (result.page && result.page !== 'guide') {
      this.page = result.page;
      this.scroll = 0;
    }
    this.onAction(result);
    this.redraw();
    this.redrawGuide();
  }

  private syncVisible(): void {
    const guideOn = Boolean(this.guide?.lesson);
    this.mesh.visible = this.open;
    this.guideMesh.visible = guideOn;
    this.group.visible = this.open || guideOn;
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

    const all = panelButtons(this.store, this.page, this.rooms, this.draft, this.guide);
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

  private redrawGuide(): void {
    const c = this.guideCanvas.getContext('2d')!;
    if (typeof c.clearRect === 'function') c.clearRect(0, 0, GW, GH);
    else c.fillRect(0, 0, GW, GH);
    this.guideShown = [];
    if (!this.guide?.lesson) {
      this.guideTexture.needsUpdate = true;
      this.syncVisible();
      return;
    }
    const buttons = panelButtons(this.store, 'guide', this.rooms, this.draft, this.guide);
    c.fillStyle = 'rgba(28, 28, 32, 0.94)';
    c.fillRect(0, 0, GW, GH);
    c.fillStyle = '#ece7f5';
    c.font = '700 36px system-ui, sans-serif';
    c.fillText('Tutorial', 36, 52);
    c.font = '26px system-ui, sans-serif';
    let y = 120;
    buttons.forEach((button, i) => {
      const active = i === this.guideHover;
      c.fillStyle = active ? '#dba08f' : '#3a3546';
      c.fillRect(28, y - 32, 712, 72);
      c.fillStyle = '#ece7f5';
      c.fillText(button.label.slice(0, 42), 48, y + 12);
      this.guideShown.push({ id: button.id, y });
      y += 88;
    });
    this.guideTexture.needsUpdate = true;
    this.syncVisible();
  }
}
