import * as THREE from 'three';
import { HUD, hudPanel, hudButton } from './hud';
import type { Store } from '../core/store';
import { guideActionMatches, inspectPreview, panelButtons, runPanelAction, type NeighborhoodRoom, type PanelActionResult, type PanelPage } from './interaction';
import { XrCreation, creationActionButtons, creationDoneButtons, creationFormButtons, creationKindButtons, keyLabel, keyWidthUnits, keyboardRows } from './creation';
import { currentStep, type OnboardingState } from '../core/onboarding';

const W = 1024;
const H = 1408;
const GW = 768;
const GH = 900;
const ROW = 92;
const TOP = 220;

/** A painted hit target. x/y are the rect centre so a ray test is a simple half-extent compare. */
interface Hit {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

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
  private shown: Hit[] = [];
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
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    this.mesh.position.set(0, 1.28, -1.15);
    this.mesh.name = 'xr-menu';
    this.guideCanvas.width = GW;
    this.guideCanvas.height = GH;
    this.guideTexture = new THREE.CanvasTexture(this.guideCanvas);
    this.guideTexture.colorSpace = THREE.SRGBColorSpace;
    this.guideMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.52),
      new THREE.MeshBasicMaterial({ map: this.guideTexture, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
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

  show(page: PanelPage = 'home', preserveDraft = false): void {
    if (page === 'guide') {
      this.redrawGuide();
      this.syncVisible();
      return;
    }
    this.open = true;
    this.page = page;
    this.scroll = 0;
    if (page === 'create' && !preserveDraft) this.draft = new XrCreation();
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
    if (this.guide === guide) return;
    this.guide = guide;
    const step=currentStep(guide ?? {lesson:null} as OnboardingState);
    if (this.page === 'create') {
      // Only the kind grid pages on the create screen, so scroll in kind pages.
      const kinds = creationKindButtons(this.draft);
      const kindIndex = kinds.findIndex(b=>guideActionMatches(step?.id ?? '',b.id));
      if (kindIndex > 0) this.scroll = Math.floor(kindIndex / 12);
    } else {
      const index=panelButtons(this.store,this.page,this.rooms,this.draft,guide).findIndex(b=>guideActionMatches(step?.id ?? '',b.id));
      if(index>=0) this.scroll=Math.floor(index/10);
    }
    this.redraw();
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
    const nextHover = uv && mesh !== this.guideMesh && this.open ? this.hitIndex(uv) : -1;
    const nextGuideHover = uv && mesh === this.guideMesh
      ? this.guideShown.findIndex((b) => Math.abs(b.y - (1 - uv.y) * GH) < ROW / 2) : -1;
    if (nextHover !== this.hover) {
      this.hover = nextHover;
      this.redraw();
    }
    if (nextGuideHover !== this.guideHover) {
      this.guideHover = nextGuideHover;
      this.redrawGuide();
    }
  }

  /** Index into `shown` of the rect the ray lands in, or -1. */
  private hitIndex(uv: { x: number; y: number }): number {
    const x = uv.x * W;
    const y = (1 - uv.y) * H;
    return this.shown.findIndex((b) => Math.abs(b.x - x) <= b.w / 2 && Math.abs(b.y - y) <= b.h / 2);
  }

  activate(uv: { x: number; y: number }, mesh?: THREE.Mesh): void {
    if (mesh === this.guideMesh) {
      const y = (1 - uv.y) * GH;
      const button = this.guideShown.find((b) => Math.abs(b.y - y) < ROW / 2);
      if (!button) return;
      if (button.id==='guide:reveal') {
        const step=currentStep(this.guide!);
        const allPages:PanelPage[]=['home','create','rooms','repo-rooms','themes','lighting','surfaces','inbox'];
        const page=allPages.find(page=>panelButtons(this.store,page,this.rooms,this.draft,this.guide).some(b=>guideActionMatches(step?.id ?? '',b.id) && !b.id.startsWith('page:'))) ?? 'home';
        if(page==='create' && this.page==='create') { this.open=true; this.redraw(); this.syncVisible(); }
        else this.onAction(runPanelAction(this.store,`page:${page}`,this.rooms,this.draft));
        return;
      }
      const result = runPanelAction(this.store, button.id, this.rooms, this.draft);
      this.onAction(result);
      this.redrawGuide();
      return;
    }
    const index = this.hitIndex(uv);
    const button = index >= 0 ? this.shown[index] : undefined;
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

  /** Rounded-rect button; records its own hit rect. Falls back to fillRect in test canvases. */
  private button(
    c: CanvasRenderingContext2D,
    id: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h: number,
    opts: { font?: string; center?: boolean; muted?: boolean } = {},
  ): void {
    const matched = this.matchesGuide(id);
    const active = this.shown.length === this.hover;
    hudButton(c, x, y, w, h, { hover: active, selected: matched || label.startsWith('• ') || (id === 'key:caps' && this.draft.caps),
      primary: ['create:submit', 'page:create', 'page:object'].includes(id), muted: opts.muted, danger: id === 'delete' });
    c.font = opts.font ?? '28px system-ui, sans-serif';
    const text = this.clip(c, label, w - (opts.center ? 24 : 48));
    if (opts.center) {
      const width = this.textWidth(c, text);
      c.fillText(text, x + (w - width) / 2, y + h / 2 + 11);
    } else {
      c.fillText(text, x + 24, y + h / 2 + 11);
    }
    this.shown.push({ id, label, x: x + w / 2, y: y + h / 2, w, h });
  }

  private textWidth(c: CanvasRenderingContext2D, text: string): number {
    try {
      const m = c.measureText?.(text);
      if (m && Number.isFinite(m.width)) return m.width;
    } catch { /* stub canvases in tests have no metrics */ }
    return text.length * 14;
  }

  private clip(c: CanvasRenderingContext2D, label: string, max: number): string {
    if (this.textWidth(c, label) <= max) return label;
    let text = label;
    while (text.length > 1 && this.textWidth(c, text + '…') > max) text = text.slice(0, -1);
    return text + '…';
  }

  private matchesGuide(id: string): boolean {
    const step = currentStep(this.guide ?? { lesson: null } as OnboardingState);
    return step?.id === 'rooms-home' ? id === `room:${this.guide?.roomId}` : guideActionMatches(step?.id ?? '', id);
  }

  private redraw(): void {
    const c = this.canvas.getContext('2d')!;
    hudPanel(c, W, H);
    c.fillStyle = HUD.text;
    c.font = '700 48px system-ui, sans-serif';
    c.fillText('Misc. Manor', 48, 72);
    c.font = '28px system-ui, sans-serif';
    const preview = this.store.selectedId ? inspectPreview(this.store, this.store.selectedId) : null;
    c.fillStyle = HUD.mint;
    const section = this.page === 'home' ? 'ROOM CONTROL' : this.page === 'create' ? (this.draft.editing ? 'EDIT CONTENT' : 'CREATE OBJECT') : this.page.replaceAll('-', ' ').toUpperCase();
    c.fillText(section, 48, 122);
    const detail = this.page === 'create' && this.draft.error
      ? this.draft.error
      : preview?.href || preview?.detail || 'Point at an object to see its name and link.';
    c.fillStyle = this.page === 'create' && this.draft.error ? HUD.danger : HUD.muted;
    const description = this.page === 'create' && this.draft.error ? detail : preview?.title ? preview.title + ' · ' + detail : detail;
    c.fillText(this.clip(c, description, 928), 48, 158);
    if (this.store.saveError) {
      c.fillStyle = HUD.danger;
      c.fillText(this.clip(c, this.store.saveError, 928), 48, 194);
    }

    this.shown = [];
    if (this.page === 'create' && !this.draft.created) {
      this.drawCreate(c);
      this.texture.needsUpdate = true;
      return;
    }

    const all = this.page === 'create' ? creationDoneButtons(this.draft) : panelButtons(this.store, this.page, this.rooms, this.draft, this.guide);
    const capacity = 10;
    this.scroll = Math.min(this.scroll, Math.max(0, Math.ceil(all.length / capacity) - 1));
    const start = this.scroll * capacity;
    const slice = all.slice(start, start + capacity);
    let y = TOP;
    const draw = (id: string, label: string) => {
      this.button(c, id, label, 48, y - 12, 928, 76);
      y += ROW;
    };
    slice.forEach((button) => draw(button.id, button.label));
    if (start > 0) draw('ui:prev', 'Previous');
    if (start + capacity < all.length) draw('ui:next', 'More');
    c.fillStyle = HUD.muted;
    c.font = '24px system-ui, sans-serif';
    c.fillText('SQUEEZE  /  MENU', 48, 1360);
    c.textAlign = 'right';
    c.fillText(`${this.scroll + 1} / ${Math.max(1, Math.ceil(all.length / capacity))}`, 976, 1360);
    c.textAlign = 'left';
    this.texture.needsUpdate = true;
  }

  /**
   * The Add-object page. Form, a full QWERTY keyboard and the actions are all on screen at once;
   * only the 50-odd object kinds page. Previously every one of the 54 keys was a full-width row
   * rendered ten at a time, so a URL meant five screens of giant buttons.
   */
  private drawCreate(c: CanvasRenderingContext2D): void {
    const M = 44;
    const IW = W - M * 2; // 936

    // ---- form ---------------------------------------------------------------
    const form = creationFormButtons(this.draft);
    this.button(c, form[0].id, form[0].label, M, 206, IW, 58);
    this.button(c, form[1].id, form[1].label, M, 270, IW, 58);
    const third = (IW - 12) / 3;
    [form[2], form[3], form[4]].forEach((b, i) => {
      this.button(c, b.id, b.label, M + i * (third + 6), 334, third, 54, { center: true, muted: true });
    });

    // ---- keyboard -----------------------------------------------------------
    const rows = keyboardRows(this.draft);
    const keyH = 70;
    const pitch = 78;
    let y = 404;
    for (const row of rows) {
      const units = row.reduce((sum, token) => sum + keyWidthUnits(token), 0);
      const unit = IW / units;
      let x = M;
      for (const token of row) {
        const w = unit * keyWidthUnits(token) - 6;
        const label = keyLabel(token, this.draft.caps);
        this.button(c, 'key:' + token, label, x, y, w, keyH, {
          center: true,
          font: label.length > 2 ? '600 26px system-ui, sans-serif' : '600 40px system-ui, sans-serif',
        });
        x += unit * keyWidthUnits(token);
      }
      y += pitch;
    }

    // ---- object kinds (the only paged section) ------------------------------
    const kinds = creationKindButtons(this.draft);
    const cols = 3;
    const kindRows = 4;
    const perPage = cols * kindRows;
    this.scroll = Math.min(this.scroll, Math.max(0, Math.ceil(kinds.length / perPage) - 1));
    const start = this.scroll * perPage;
    const slice = kinds.slice(start, start + perPage);
    const colW = (IW - (cols - 1) * 8) / cols;
    const kindTop = y + 6;
    slice.forEach((button, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      this.button(c, button.id, button.label, M + col * (colW + 8), kindTop + row * 56, colW, 50, {
        center: true,
        font: '24px system-ui, sans-serif',
        muted: true,
      });
    });
    const pagerY = kindTop + kindRows * 56 + 2;
    const half = (IW - 8) / 2;
    if (start > 0) this.button(c, 'ui:prev', '◀ kinds', M, pagerY, half, 46, { center: true, font: '24px system-ui, sans-serif', muted: true });
    if (start + perPage < kinds.length) this.button(c, 'ui:next', 'more kinds ▶', M + half + 8, pagerY, half, 46, { center: true, font: '24px system-ui, sans-serif', muted: true });

    // ---- actions ------------------------------------------------------------
    const actions = creationActionButtons(this.draft);
    this.button(c, actions[0].id, actions[0].label, M, pagerY + 54, IW, 62, { center: true, font: '600 32px system-ui, sans-serif' });
    this.button(c, actions[1].id, actions[1].label, M, pagerY + 122, IW, 54, { center: true });
  }

  private redrawGuide(): void {
    const c = this.guideCanvas.getContext('2d')!;
    if (typeof c.clearRect === 'function') c.clearRect(0, 0, GW, GH);
    else c.fillRect(0, 0, GW, GH);
    const hoveredId = this.guideShown[this.guideHover]?.id;
    this.guideShown = [];
    if (!this.guide?.lesson) {
      this.guideTexture.needsUpdate = true;
      this.syncVisible();
      return;
    }
    const buttons = panelButtons(this.store, 'guide', this.rooms, this.draft, this.guide);
    hudPanel(c, GW, GH);
    c.fillStyle = HUD.text;
    c.font = '700 36px system-ui, sans-serif';
    c.fillText('Tutorial', 36, 52);
    c.font = '26px system-ui, sans-serif';
    let y = 120;
    buttons.forEach((button) => {
      const active = hoveredId === button.id;
      const words=button.label.split(' '); const lines:string[]=[]; let line='';
      for(const word of words) { if((line+' '+word).length>44){lines.push(line);line=word;} else line+=(line?' ':'')+word; }
      if(line)lines.push(line);
      hudButton(c, 28, y-32, 712, Math.max(72,lines.length*36+20), { hover: active, muted: ['guide:status','guide:copy'].includes(button.id) });
      lines.forEach((text,j)=>c.fillText(text,48,y+12+j*36));
      if (!['guide:status','guide:copy'].includes(button.id)) this.guideShown.push({id:button.id,y});
      y+=Math.max(88,lines.length*36+36);
    });
    this.guideTexture.needsUpdate = true;
    this.syncVisible();
  }
}
