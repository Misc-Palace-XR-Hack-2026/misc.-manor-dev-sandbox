import { currentTrack, trackUrl, type RoomTrack } from '../core/soundtrack';
import type { Store } from '../core/store';

export interface AudioLike {
  src: string;
  volume: number;
  loop: boolean;
  preload: string;
  paused: boolean;
  addEventListener(type: string, listener: () => void): void;
  removeAttribute(name: string): void;
  play(): Promise<void>;
  pause(): void;
}

export type FadeFn = (
  from: number,
  to: number,
  ms: number,
  set: (value: number) => void,
) => Promise<void>;

async function defaultFade(from: number, to: number, ms: number, set: (value: number) => void): Promise<void> {
  if (from === to || ms <= 0) {
    set(to);
    return;
  }
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      set(from + (to - from) * t);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

export class SoundtrackPlayer {
  private audio: AudioLike;
  private fade: FadeFn;
  private last: RoomTrack | undefined;
  private wanted: RoomTrack | undefined;
  private away = false;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private store: Store,
    options: { audio?: AudioLike; fade?: FadeFn; listen?: boolean } = {},
  ) {
    this.audio = options.audio ?? new Audio();
    this.fade = options.fade ?? defaultFade;
    this.audio.loop = true;
    this.audio.preload = 'none';
    this.audio.volume = 1;
    this.audio.addEventListener('error', () => {
      /* Missing files stay silent; licensed tracks live in public/audio/. */
    });
    store.subscribe(() => this.sync());
    if (options.listen !== false) this.listen();
    this.sync();
  }

  idle(): Promise<void> {
    return this.chain;
  }

  leave(): void {
    this.away = true;
    this.wanted = undefined;
    this.enqueue(() => this.stop(true));
  }

  return(): void {
    this.away = false;
    this.sync();
  }

  private listen(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.leave();
      else this.return();
    });
    window.addEventListener('pagehide', () => this.leave());
    window.addEventListener('pageshow', () => this.return());
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest('a[href]');
      if (!(link instanceof HTMLAnchorElement)) return;
      const href = link.getAttribute('href') ?? '';
      if (!href || href.startsWith('#')) return;
      if (link.target === '_blank' || /^(https?:)?\/\//i.test(href)) this.leave();
    }, true);
  }

  private sync(): void {
    const track = this.away ? undefined : currentTrack(this.store.state);
    if (track === this.wanted) return;
    this.wanted = track;
    this.enqueue(() => this.apply(track));
  }

  private enqueue(work: () => Promise<void>): void {
    this.chain = this.chain.then(work, work);
  }

  private async apply(track: RoomTrack | undefined): Promise<void> {
    if (track !== this.wanted) return;
    if (this.last && this.last !== track) await this.stop(true);
    if (track !== this.wanted) return;
    if (!track) {
      if (this.last) await this.stop(true);
      return;
    }
    if (this.last === track && !this.audio.paused) return;
    this.audio.src = trackUrl(track);
    this.audio.volume = 0;
    this.last = track;
    try {
      await this.audio.play();
    } catch {
      /* Browser autoplay policy: user gesture required. Controls still work after the first click. */
    }
    if (track !== this.wanted || this.away) {
      await this.stop(false);
      return;
    }
    await this.fade(0, 1, 400, (value) => {
      this.audio.volume = Math.min(1, Math.max(0, value));
    });
  }

  private async stop(doFade: boolean): Promise<void> {
    if (doFade && !this.audio.paused) {
      await this.fade(this.audio.volume, 0, 350, (value) => {
        this.audio.volume = Math.min(1, Math.max(0, value));
      });
    }
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.volume = 1;
    this.last = undefined;
  }
}
