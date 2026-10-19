import { shotCameraAt, type CameraState, type Shot } from '../core/scenes';
import { motionLength } from '../core/motion';
import { toBase64 } from './capture';
import type { RoomView } from './room';

// Plays a shot (camera move plus object choreography) in the Scenes window and records it frame by frame.
//
// The recorder does not film the screen. For every frame i it sets the clock to i / fps, poses the camera and the
// objects from that clock, renders one PNG and saves it. So the result does not depend on how fast this computer is,
// and a 4K 60 fps sequence comes out exactly like a 720p 24 fps preview, only sharper.

export interface PlayerContext {
  room(): RoomView | null;
  shot(): Shot | undefined;
  /** Point the real camera at a framing (sliders follow). */
  viewCamera(c: CameraState): void;
  /** Write the live camera into a still shot, so stopping never snaps the camera back to an old framing. */
  commitCamera(): void;
  vignette(): number;
  clearSelection(): void;
  /** The shot's data changed (motion cleared, label edited): rebuild the shots panel. */
  changed(): void;
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

const slug = (text: string, max: number): string =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '') || 'shot';
const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

const FPS_OPTIONS = [24, 30, 60] as const;
const WIDTH_OPTIONS = [1280, 1920, 3840] as const;

async function postFiles(
  folder: string, files: Array<{ name: string; data: string; encoding: 'base64' | 'utf8' }>,
): Promise<void> {
  const response = await fetch('/__frames/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder, files }),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `Save failed (${response.status}).`);
  }
}

export class ShotPlayer {
  /** The burned-in caption preview. ScenesView appends it to the 16:9 frame overlay. */
  readonly label = el('div', { class: 'scenes-shot-label' });

  private ctx: PlayerContext;
  private fps = 30;
  private width = 1920;
  private playing = false;
  private recording = false;
  private cancelRequested = false;
  private active = false; // the room has a choreography clock running (play, scrub or record)
  private raf: number | null = null;
  private startMs = 0;
  private shotId: string | null = null;

  // Controls of the currently built shot editor. Rebuilt with the panel; always re-pointed by buildControls.
  private scrub: HTMLInputElement | null = null;
  private timeText: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private playBtn: HTMLButtonElement | null = null;
  private recordBtn: HTMLButtonElement | null = null;

  constructor(ctx: PlayerContext) {
    this.ctx = ctx;
  }

  get busy(): boolean {
    return this.playing || this.recording;
  }

  /** Show the active shot's caption in the frame preview. */
  syncLabel(): void {
    const text = this.ctx.shot()?.label?.trim() ?? '';
    this.label.textContent = text;
    this.label.hidden = text === '';
  }

  // ---- playback -------------------------------------------------------------

  private begin(shot: Shot, t: number): RoomView | null {
    const room = this.ctx.room();
    if (!room) return null;
    if (!this.active) {
      this.ctx.clearSelection();
      room.setMotion(shot.motion ?? [], t);
      this.active = true;
    }
    this.shotId = shot.id;
    return room;
  }

  /** Pose the camera and every object for second `t` of the shot. */
  private apply(shot: Shot, t: number): void {
    const room = this.begin(shot, t);
    if (!room) return;
    room.setMotionTime(t);
    this.ctx.viewCamera(shotCameraAt(shot, t / shot.durationSec));
    this.showTime(shot, t);
  }

  private showTime(shot: Shot, t: number): void {
    if (this.scrub && document.activeElement !== this.scrub) this.scrub.value = String(t);
    if (this.timeText) this.timeText.textContent = `${t.toFixed(2)} / ${shot.durationSec.toFixed(1)} s`;
  }

  play(): void {
    const shot = this.ctx.shot();
    if (!shot || this.recording) return;
    this.stop();
    this.ctx.commitCamera();
    this.playing = true;
    this.startMs = performance.now();
    this.apply(shot, 0);
    this.setPlayLabel();
    const frame = (): void => {
      const current = this.ctx.shot();
      if (!this.playing || !current || current.id !== this.shotId) { this.stop(); return; }
      const t = (performance.now() - this.startMs) / 1000;
      if (t >= current.durationSec) {
        this.apply(current, current.durationSec);
        this.stop();
        return;
      }
      this.apply(current, t);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Stop playing and put the room and camera back as they were authored. */
  stop(): void {
    if (this.recording) return;
    this.playing = false;
    if (this.raf !== null) { cancelAnimationFrame(this.raf); this.raf = null; }
    if (this.active) {
      this.active = false;
      const room = this.ctx.room();
      room?.setMotion(null, 0);
      room?.setFireClock(null);
      const shot = this.ctx.shot();
      if (shot) {
        this.ctx.viewCamera(shot.start);
        this.showTime(shot, 0);
      }
    }
    this.setPlayLabel();
  }

  private setPlayLabel(): void {
    if (this.playBtn) this.playBtn.textContent = this.playing ? 'Stop' : 'Play';
  }

  // ---- recording ------------------------------------------------------------

  async record(): Promise<void> {
    const shot = this.ctx.shot();
    const room = this.ctx.room();
    if (!shot || !room || this.recording) return;
    this.stop();
    this.ctx.commitCamera();

    const fps = this.fps;
    const width = this.width;
    const height = Math.round((width * 9) / 16);
    const frames = Math.max(1, Math.round(shot.durationSec * fps));
    const now = new Date();
    const stamp = `${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const folder = `shot-${slug(shot.id, 12)}-${slug(shot.title, 20)}-${stamp}`;
    const batchSize = width > 2000 ? 4 : 8;
    const vignette = this.ctx.vignette();

    this.recording = true;
    this.cancelRequested = false;
    this.syncRecordButton();
    let saved = 0;
    try {
      let pending: Array<{ name: string; blob: Blob }> = [];
      const flush = async (): Promise<void> => {
        if (pending.length === 0) return;
        const files = await Promise.all(pending.map(async (f) => ({
          name: f.name, data: await toBase64(f.blob), encoding: 'base64' as const,
        })));
        await postFiles(folder, files);
        saved += files.length;
        pending = [];
      };

      for (let i = 0; i < frames; i++) {
        if (this.cancelRequested) break;
        const t = i / fps;
        this.apply(shot, t);
        room.setFireClock(t);
        const blob = await room.captureFrame({ width, vignette, layer: 'full', label: shot.label?.trim() || undefined });
        pending.push({ name: `frame-${pad(i + 1, 4)}.png`, blob });
        if (pending.length >= batchSize) await flush();
        this.setStatus(`Recording frame ${i + 1} of ${frames} (${saved} saved)...`);
      }
      await flush();

      const completed = !this.cancelRequested;
      const meta = {
        shot: { id: shot.id, title: shot.title },
        completed,
        fps,
        frames: saved,
        width,
        height,
        durationSec: shot.durationSec,
        label: shot.label ?? null,
        vignette,
        ffmpeg: `ffmpeg -framerate ${fps} -i frame-%04d.png -c:v libx264 -pix_fmt yuv420p ${folder}.mp4`,
      };
      await postFiles(folder, [{ name: 'sequence.json', data: JSON.stringify(meta, null, 2), encoding: 'utf8' }]);
      this.setStatus(
        completed
          ? `Saved ${saved} frames to docs/trailer-materials/frames/${folder}/ (${width}x${height}, ${fps} fps). Encode: ${meta.ffmpeg}`
          : `Cancelled. ${saved} frames saved to docs/trailer-materials/frames/${folder}/.`,
      );
    } catch (error) {
      this.setStatus(`Recording stopped: ${error instanceof Error ? error.message : String(error)} (${saved} frames saved)`);
    } finally {
      this.recording = false;
      this.cancelRequested = false;
      this.stop();
      this.syncRecordButton();
    }
  }

  private setStatus(text: string): void {
    if (this.status) this.status.textContent = text;
  }

  private syncRecordButton(): void {
    if (!this.recordBtn) return;
    this.recordBtn.textContent = this.recording ? 'Cancel recording' : 'Record PNG frames';
  }

  // ---- panel ----------------------------------------------------------------

  /** The Play / scrub / label / record block shown in the shot editor. */
  buildControls(shot: Shot): HTMLElement {
    const flights = shot.motion ?? [];
    const motionEnd = motionLength(flights);

    this.playBtn = el('button', { type: 'button', textContent: this.playing ? 'Stop' : 'Play' });
    this.playBtn.addEventListener('click', () => { if (this.playing) this.stop(); else this.play(); });

    this.scrub = el('input', {
      type: 'range', min: '0', max: String(shot.durationSec), step: '0.01', value: '0', class: 'scenes-shot-scrub',
    });
    this.timeText = el('span', { class: 'scenes-shot-time', textContent: `0.00 / ${shot.durationSec.toFixed(1)} s` });
    this.scrub.addEventListener('input', () => {
      if (this.recording) return;
      if (this.playing) {
        this.playing = false;
        if (this.raf !== null) { cancelAnimationFrame(this.raf); this.raf = null; }
        this.setPlayLabel();
      }
      this.apply(shot, parseFloat(this.scrub!.value));
    });
    // Letting go of the scrubber returns the room to its authored state.
    this.scrub.addEventListener('change', () => { if (!this.playing && !this.recording) this.stop(); });

    const label = el('input', {
      type: 'text', value: shot.label ?? '', placeholder: 'Caption on the frame (optional)', class: 'scenes-shot-input',
    });
    label.addEventListener('change', () => {
      shot.label = label.value.trim() || undefined;
      this.syncLabel();
    });

    const fps = el('select', { class: 'scenes-shot-input' });
    for (const f of FPS_OPTIONS) fps.append(el('option', { value: String(f), textContent: `${f} fps`, selected: f === this.fps }));
    fps.addEventListener('change', () => { this.fps = parseInt(fps.value, 10); });

    const size = el('select', { class: 'scenes-shot-input' });
    for (const w of WIDTH_OPTIONS) {
      size.append(el('option', { value: String(w), textContent: `${w} wide`, selected: w === this.width }));
    }
    size.addEventListener('change', () => { this.width = parseInt(size.value, 10); });

    this.recordBtn = el('button', { type: 'button', class: 'scenes-capture-btn' });
    this.recordBtn.addEventListener('click', () => {
      if (this.recording) this.cancelRequested = true;
      else void this.record();
    });
    this.syncRecordButton();

    this.status = el('div', { class: 'scenes-object-hint', textContent: '' });

    const motionInfo = el('div', { class: 'scenes-shot-cam', textContent: flights.length === 0
      ? 'Motion: none'
      : `Motion: ${flights.length} object${flights.length === 1 ? '' : 's'}, finishes at ${motionEnd.toFixed(1)} s${
        motionEnd > shot.durationSec ? ' (longer than the shot: raise Seconds)' : ''}` });

    const row = (labelText: string, input: HTMLElement) =>
      el('div', { class: 'scenes-slider-row' }, el('span', { class: 'scenes-slider-label', textContent: labelText }), input);

    const clear = el('button', { type: 'button', textContent: 'Clear motion', class: 'scenes-delete-btn' });
    clear.addEventListener('click', () => {
      this.stop();
      shot.motion = undefined;
      this.ctx.changed();
    });

    const actions = el('div', { class: 'scenes-object-actions' }, this.playBtn);
    if (flights.length > 0) actions.append(clear);

    return el('div', { class: 'scenes-shot-player' },
      el('div', { class: 'scenes-object-actions' }, el('strong', { textContent: 'Playback' })),
      actions,
      el('div', { class: 'scenes-slider-row' }, this.scrub, this.timeText),
      motionInfo,
      row('Caption', label),
      row('Frame rate', fps),
      row('Size', size),
      el('div', { class: 'scenes-object-actions' }, this.recordBtn),
      this.status,
      el('div', {
        class: 'scenes-object-hint',
        textContent: 'Record PNG frames renders each frame from the shot clock, so it is smooth on any computer. Frames go to docs/trailer-materials/frames/. Keep this window open and do not touch the camera while it runs.',
      }),
    );
  }
}
