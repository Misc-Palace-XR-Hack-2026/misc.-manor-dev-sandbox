import type { CameraState, Scene, Shot } from '../core/scenes';
import type { Fixture } from '../core/fixtures';
import { FIREPLACE_DEFAULT_POS } from '../core/fixtures';
import {
  PRIMARY_LENS_MM, computeShotNumbers, shotCardMarkdown, sideSvg, topDownSvg,
  type ShotCardInput, type ShotNumbers,
} from '../core/shot-card';
import { vignetteAlphas, type CaptureLayer, type RoomView } from './room';

// The capture side of Scenes mode: the 16:9 frame, vignette, guide figure, Clean view, and the Capture -> Review -> Save
// flow. Nothing here changes the scene; it only reads the camera and writes files for a shot.

const CAPTURE_WIDTH = 3840; // 4K plate, 16:9
const SHOTS_DIR = 'docs/trailer-materials/shots';

type LayerMode = CaptureLayer | 'both';

interface CaptureFile { name: string; blob?: Blob; text?: string }

export interface CaptureContext {
  room(): RoomView | null;
  scene(): Scene | null;
  shot(): Shot | undefined;
  camera(): CameraState;
  fireplace(): Fixture | undefined;
  /** Deselect anything so no selection glow or held object is on screen. */
  clearSelection(): void;
  /** Called after a successful save so the scene can create / update the matching shot. */
  onSaved(info: { shotId: string; title: string; camera: CameraState }): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) node.className = cls;
  Object.assign(node, rest);
  node.append(...kids);
  return node;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const slug = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'shot';

export function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
}

export class CapturePanel {
  /** The Capture section of the controls panel. */
  readonly element = el('div', { class: 'scenes-capture' });
  /** The 16:9 frame + vignette preview. ScenesView appends it to the room container. */
  readonly overlay = el('div', { class: 'scenes-frame' });

  private ctx: CaptureContext;
  private vignette = 0;
  private layerMode: LayerMode = 'full';
  private guidesOn = true;
  private frameOn = true;
  private clean = false;
  private busy = false;
  private lastRect = '';
  private lastVignette = -1;
  private hint = el('div', { class: 'scenes-clean-hint', textContent: 'Clean view. Space fades in / out. Esc exits.' });
  // Clean view fade: a black layer over the whole window that Space fades in and out, so a recording can open from black.
  private fadeLayer = el('div', { class: 'scenes-fade' });
  private fadeSeconds = 3;
  private startBlack = true;
  private blackNow = false;
  private fadeSlider = el('input', { type: 'range', min: '0.5', max: '10', step: '0.5', value: '3' });
  private fadeValue = el('span', { textContent: '3.0 s' });
  private startBlackToggle = el('input', { type: 'checkbox', checked: true });
  private dialog: HTMLElement | null = null;
  private dialogUrls: string[] = [];

  private guidesToggle = el('input', { type: 'checkbox', checked: true });
  private frameToggle = el('input', { type: 'checkbox', checked: true });
  private vignetteSlider = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: '0' });
  private vignetteValue = el('span', { textContent: 'off' });
  private layerSelect = el('select', { class: 'scenes-shot-input' });
  private captureBtn = el('button', { type: 'button', class: 'scenes-capture-btn', textContent: 'Capture shot...' });
  private cleanBtn = el('button', { type: 'button', textContent: 'Clean view (record)' });

  constructor(ctx: CaptureContext) {
    this.ctx = ctx;
    this.overlay.append(el('div', { class: 'scenes-frame-vignette' }), el('div', { class: 'scenes-frame-label', textContent: '16:9 capture frame' }));
    this.buildPanel();

    this.guidesToggle.addEventListener('change', () => {
      this.guidesOn = this.guidesToggle.checked;
      this.applyGuides();
    });
    this.frameToggle.addEventListener('change', () => {
      this.frameOn = this.frameToggle.checked;
      this.overlay.classList.toggle('frame-off', !this.frameOn);
    });
    this.vignetteSlider.addEventListener('input', () => {
      this.vignette = parseFloat(this.vignetteSlider.value);
      this.vignetteValue.textContent = CapturePanel.vignetteLabel(this.vignette);
      this.updateOverlay();
    });
    this.layerSelect.addEventListener('change', () => { this.layerMode = this.layerSelect.value as LayerMode; });
    this.captureBtn.addEventListener('click', () => { void this.capture(); });
    this.cleanBtn.addEventListener('click', () => this.enterClean());
    this.fadeSlider.addEventListener('input', () => {
      this.fadeSeconds = parseFloat(this.fadeSlider.value);
      this.fadeValue.textContent = `${this.fadeSeconds.toFixed(1)} s`;
    });
    this.startBlackToggle.addEventListener('change', () => { this.startBlack = this.startBlackToggle.checked; });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.clean) this.exitClean();
      else if (e.key === 'Escape' && this.dialog) this.closeDialog();
      else if (e.code === 'Space' && this.clean) {
        e.preventDefault();
        if (!e.repeat) this.toggleFade();
      }
    });
  }

  /** Vignette strength (0..1) currently set, so a frame recording matches a still capture. */
  getVignette(): number {
    return this.vignette;
  }

  private static vignetteLabel(v: number): string {
    return v <= 0 ? 'off' : v >= 1 ? 'full black' : `${Math.round(v * 100)}%`;
  }

  private buildPanel(): void {
    const row = (label: string, ...kids: HTMLElement[]) =>
      el('label', { class: 'scenes-slider-row' }, el('span', { class: 'scenes-slider-label', textContent: label }), ...kids);

    for (const [value, label] of [['full', 'Full scene'], ['no-chair', 'No chair'], ['both', 'Both plates']] as const) {
      this.layerSelect.append(el('option', { value, textContent: label }));
    }

    this.element.append(
      row('Guide', this.guidesToggle, el('span', { class: 'scenes-object-hint', textContent: 'seated person' })),
      row('Frame', this.frameToggle, el('span', { class: 'scenes-object-hint', textContent: '16:9' })),
      row('Vignette', this.vignetteSlider, this.vignetteValue),
      row('Plate', this.layerSelect),
      row('Fade', this.fadeSlider, this.fadeValue),
      row('Start black', this.startBlackToggle, el('span', { class: 'scenes-object-hint', textContent: 'clean view' })),
      el('div', { class: 'scenes-object-actions' }, this.captureBtn, this.cleanBtn),
      el('div', {
        class: 'scenes-object-hint',
        textContent: 'Clean view for recording: with "Start black" on it opens on black. Start QuickTime, press Space to fade the scene up, Space again to fade to black, Esc to leave.',
      }),
      el('div', {
        class: 'scenes-object-hint',
        textContent: 'The guide figure and frame never appear in a capture or a clean-view recording. The vignette is baked in when above 0: edges go black by 80%, and 100% is a fully black frame (for opening from black).',
      }),
    );
  }

  /** Call once the RoomView exists, so the guide state is applied. */
  roomReady(): void {
    this.applyGuides();
    this.updateOverlay();
  }

  private applyGuides(): void {
    this.ctx.room()?.setGuidesVisible(this.guidesOn && !this.clean);
  }

  /** Keep the frame overlay sitting exactly on the area a capture records. Cheap: only touches the DOM on change. */
  updateOverlay(): void {
    const room = this.ctx.room();
    if (!room) return;
    const r = room.frameRect();
    const key = `${r.x.toFixed(1)}|${r.y.toFixed(1)}|${r.width.toFixed(1)}|${r.height.toFixed(1)}`;
    if (key !== this.lastRect) {
      this.lastRect = key;
      Object.assign(this.overlay.style, {
        left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px`,
      });
      // The label sits above the frame line, outside the picture. With no spare room above, it is hidden instead.
      this.overlay.classList.toggle('no-label-room', r.y < 18);
    }
    if (this.vignette !== this.lastVignette) {
      this.lastVignette = this.vignette;
      const veil = this.overlay.firstElementChild as HTMLElement;
      // Same shape as the baked one: transparent to 55% of the way to the corner, then darkening to the corner.
      const { center, edge } = vignetteAlphas(this.vignette);
      veil.style.background = this.vignette > 0
        ? `radial-gradient(ellipse farthest-corner at center, rgba(0,0,0,${center}) 55%, rgba(0,0,0,${edge}) 100%)`
        : 'none';
    }
  }

  // ---- clean view (for screen recording) ----------------------------------

  enterClean(): void {
    if (this.clean) return;
    this.clean = true;
    this.ctx.clearSelection();
    (document.activeElement as HTMLElement | null)?.blur(); // so Space can't press a button
    document.body.classList.add('scenes-clean');
    this.setFade(this.startBlack, 0);
    document.body.append(this.fadeLayer, this.hint);
    this.hint.classList.remove('fade');
    void this.hint.offsetWidth; // restart the fade animation
    this.hint.classList.add('fade');
    this.applyGuides();
  }

  exitClean(): void {
    if (!this.clean) return;
    this.clean = false;
    document.body.classList.remove('scenes-clean');
    this.hint.remove();
    this.fadeLayer.remove();
    this.blackNow = false;
    this.applyGuides();
  }

  /** Set the black layer to opaque (true) or clear (false), over `seconds` (0 = instantly). */
  private setFade(black: boolean, seconds: number): void {
    this.blackNow = black;
    this.fadeLayer.style.transitionDuration = `${seconds}s`;
    if (seconds === 0) void this.fadeLayer.offsetWidth; // apply the instant change before any later transition
    this.fadeLayer.style.opacity = black ? '1' : '0';
  }

  /** Space in clean view: fade the scene in if it is black, otherwise fade it out to black. */
  private toggleFade(): void {
    this.setFade(!this.blackNow, this.fadeSeconds);
  }

  // ---- capture -> review -> save -------------------------------------------

  private async capture(): Promise<void> {
    const room = this.ctx.room();
    const scene = this.ctx.scene();
    if (!room || !scene) { alert('Open a scene first.'); return; }
    if (this.busy) return;
    this.busy = true;
    this.captureBtn.disabled = true;
    this.captureBtn.textContent = 'Capturing...';
    try {
      this.ctx.clearSelection();
      const layers: CaptureLayer[] = this.layerMode === 'both' ? ['full', 'no-chair'] : [this.layerMode];
      const plates: { layer: CaptureLayer; blob: Blob }[] = [];
      for (const layer of layers) {
        plates.push({ layer, blob: await room.captureFrame({ width: CAPTURE_WIDTH, vignette: this.vignette, layer }) });
      }
      // The camera is read at the same moment as the picture, so the card always matches the plate.
      const snapshot = {
        camera: { ...this.ctx.camera() },
        target: room.getCameraTarget(),
        frameWorldHeight: room.frameWorldHeight(),
        chair: room.getChairPose(),
      };
      await this.openReview(scene, plates, snapshot);
    } catch (error) {
      alert(`Capture failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.busy = false;
      this.captureBtn.disabled = false;
      this.captureBtn.textContent = 'Capture shot...';
    }
  }

  private async nextShotNumber(): Promise<{ next: number; used: Map<number, string>; online: boolean }> {
    const used = new Map<number, string>();
    try {
      const response = await fetch('/__shots/list');
      if (!response.ok) throw new Error(String(response.status));
      const { folders } = (await response.json()) as { folders: string[] };
      for (const folder of folders) {
        const match = /^shot-(\d+)-/.exec(folder);
        if (match) used.set(parseInt(match[1], 10), folder);
      }
      return { next: Math.max(0, ...used.keys()) + 1, used, online: true };
    } catch {
      return { next: 1, used, online: false };
    }
  }

  private closeDialog(): void {
    this.dialog?.remove();
    this.dialog = null;
    for (const url of this.dialogUrls) URL.revokeObjectURL(url);
    this.dialogUrls = [];
  }

  private async openReview(
    scene: Scene,
    plates: { layer: CaptureLayer; blob: Blob }[],
    snapshot: { camera: CameraState; target: [number, number, number]; frameWorldHeight: number; chair: ReturnType<RoomView['getChairPose']> },
  ): Promise<void> {
    this.closeDialog();
    const { next, used, online } = await this.nextShotNumber();
    const shot = this.ctx.shot();
    const fireplace = this.ctx.fireplace();
    const origin = {
      x: fireplace?.pos[0] ?? FIREPLACE_DEFAULT_POS[0],
      z: fireplace?.pos[2] ?? FIREPLACE_DEFAULT_POS[2],
      hasFireplace: Boolean(fireplace),
    };

    const numberInput = el('input', { type: 'number', min: '1', max: '99', step: '1', value: String(next), class: 'scenes-shot-input' });
    const defaultTitle = shot && !/^Shot\s/i.test(shot.title) ? shot.title : scene.name.replace(/\s*scene\s*$/i, '') || 'Shot';
    const titleInput = el('input', { type: 'text', value: defaultTitle, class: 'scenes-shot-input' });
    const status = el('div', { class: 'scenes-review-status' });
    const saveBtn = el('button', { type: 'button', class: 'scenes-capture-btn' });
    const downloadBtn = el('button', { type: 'button', textContent: 'Download instead' });
    const closeBtn = el('button', { type: 'button', textContent: 'Retake' });

    const shotNumber = (): number => Math.min(99, Math.max(1, parseInt(numberInput.value, 10) || next));
    const folderName = (): string => `shot-${pad2(shotNumber())}-${slug(titleInput.value)}`;

    const buildFiles = (): { folder: string; files: CaptureFile[]; numbers: ShotNumbers } => {
      const folder = folderName();
      const plateFiles: CaptureFile[] = plates.map((p) => ({ name: `plate-${p.layer}.png`, blob: p.blob }));
      const input: ShotCardInput = {
        shotNumber: pad2(shotNumber()),
        shotId: shot?.id ?? String(shotNumber()),
        title: titleInput.value.trim() || defaultTitle,
        sceneName: scene.name,
        type: shot?.type ?? 'composite',
        durationSec: shot?.durationSec ?? 5,
        notes: shot?.notes ?? '',
        capturedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
        resolution: `${CAPTURE_WIDTH}x${Math.round((CAPTURE_WIDTH * 9) / 16)}`,
        layer: plates.map((p) => p.layer).join(' + '),
        vignette: this.vignette,
        camera: snapshot.camera,
        endCamera: shot?.end ?? null,
        target: snapshot.target,
        frameWorldHeight: snapshot.frameWorldHeight,
        chair: snapshot.chair,
        origin,
        imageFile: plateFiles.map((f) => f.name).join(', '),
      };
      const numbers = computeShotNumbers(input);
      const files: CaptureFile[] = [
        ...plateFiles,
        { name: 'top-view.svg', text: topDownSvg(input, numbers) },
        { name: 'side-view.svg', text: sideSvg(numbers) },
        { name: 'shot-card.md', text: shotCardMarkdown(input, numbers, { top: 'top-view.svg', side: 'side-view.svg' }) },
      ];
      return { folder, files, numbers };
    };

    const refresh = (): void => {
      const n = shotNumber();
      saveBtn.textContent = `Save as shot ${pad2(n)}`;
      const existing = used.get(n);
      status.textContent = existing
        ? `Shot ${pad2(n)} already exists (${existing}). Saving with a different title makes a new folder; the same title replaces it.`
        : online ? `Saves into ${SHOTS_DIR}/${folderName()}/` : 'Dev save endpoint not found. Use "Download instead" (or run npm run dev).';
      numbersBox.replaceChildren(...this.numberLines(buildFiles().numbers));
    };

    const numbersBox = el('div', { class: 'scenes-review-numbers' });

    const finish = (message: string, ok: boolean): void => {
      status.textContent = message;
      status.classList.toggle('ok', ok);
      status.classList.toggle('bad', !ok);
    };

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = downloadBtn.disabled = true;
      const { folder, files } = buildFiles();
      try {
        const payload = await Promise.all(files.map(async (f) => f.blob
          ? { name: f.name, data: await toBase64(f.blob), encoding: 'base64' }
          : { name: f.name, data: f.text ?? '', encoding: 'utf8' }));
        const response = await fetch('/__shots/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder, files: payload }),
        });
        const body = (await response.json().catch(() => ({}))) as { written?: string[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
        this.ctx.onSaved({ shotId: shot?.id ?? String(shotNumber()), title: titleInput.value.trim() || defaultTitle, camera: snapshot.camera });
        finish(`Saved ${body.written?.length ?? files.length} files to ${SHOTS_DIR}/${folder}/`, true);
        closeBtn.textContent = 'Close';
        saveBtn.textContent = 'Saved';
        downloadBtn.disabled = false;
      } catch (error) {
        finish(`Could not save into the repo: ${error instanceof Error ? error.message : String(error)}. Use "Download instead".`, false);
        saveBtn.disabled = downloadBtn.disabled = false;
      }
    });

    downloadBtn.addEventListener('click', () => {
      const { folder, files } = buildFiles();
      for (const f of files) {
        const url = URL.createObjectURL(f.blob ?? new Blob([f.text ?? ''], { type: f.name.endsWith('.svg') ? 'image/svg+xml' : 'text/markdown' }));
        const a = el('a', { href: url, download: `${folder}__${f.name}` });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      finish(`Downloaded ${files.length} files named ${folder}__*. Move them into ${SHOTS_DIR}/${folder}/.`, true);
    });

    closeBtn.addEventListener('click', () => this.closeDialog());
    numberInput.addEventListener('input', refresh);
    titleInput.addEventListener('input', refresh);

    const previews = el('div', { class: 'scenes-review-previews' });
    for (const p of plates) {
      const url = URL.createObjectURL(p.blob);
      this.dialogUrls.push(url);
      previews.append(el('figure', {},
        el('img', { src: url, alt: `${p.layer} plate` }),
        el('figcaption', { textContent: `${p.layer === 'full' ? 'Full scene' : 'No chair'} plate, ${CAPTURE_WIDTH}px wide${this.vignette > 0 ? `, vignette ${CapturePanel.vignetteLabel(this.vignette)}` : ''}` }),
      ));
    }

    const field = (label: string, input: HTMLElement) =>
      el('div', { class: 'scenes-slider-row' }, el('span', { class: 'scenes-slider-label', textContent: label }), input);

    const card = el('div', { class: 'scenes-review-card' },
      el('h3', { textContent: 'Review shot' }),
      previews,
      el('div', { class: 'scenes-review-side' },
        field('Shot no.', numberInput),
        field('Title', titleInput),
        numbersBox,
        status,
        el('div', { class: 'scenes-object-actions' }, saveBtn, downloadBtn, closeBtn),
      ),
    );
    this.dialog = el('div', { class: 'scenes-review' }, card);
    this.dialog.addEventListener('click', (e) => { if (e.target === this.dialog) this.closeDialog(); });
    document.body.append(this.dialog);
    refresh();
  }

  private numberLines(n: ShotNumbers): HTMLElement[] {
    const m = n.main;
    const side = (x: number) => (x < 0 ? 'left' : 'right');
    const lines = [
      `Camera (${PRIMARY_LENS_MM} mm): ${Math.abs(m.position.x).toFixed(2)} m ${side(m.position.x)} of the fireplace centerline, `
        + `${m.position.z.toFixed(2)} m out from the wall, ${m.position.y.toFixed(2)} m high, tilted ${m.tiltDownDeg.toFixed(0)} deg down.`,
      `Camera to subject: ${m.distanceM.toFixed(2)} m.`,
    ];
    if (n.chair) lines.push(`Chair: ${n.chair.z.toFixed(2)} m out from the wall, ${Math.abs(n.chair.x).toFixed(2)} m ${side(n.chair.x)}; ${n.chair.facingText}.`);
    if (n.cameraFromChair) lines.push(n.cameraFromChair.text);
    if (n.suggestion) lines.push(n.suggestion);
    return lines.map((text) => el('div', { class: 'scenes-review-line', textContent: text }));
  }
}
