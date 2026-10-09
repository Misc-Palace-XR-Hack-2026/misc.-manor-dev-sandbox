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
  private blocked = false;
  private muted = false;
  /**
   * Music never starts on its own. It stays silent until the user presses the speaker once; after that it follows
   * room/lighting changes, and an explicit mute stays muted across room switches.
   */
  private enabled = false;
  private gestureVersion = 0;
  private listeners = new Set<() => void>();

  get soundState(): 'off' | 'muted' | 'playing' {
    if (!currentTrack(this.store.state)) return 'off';
    return this.muted || this.blocked || this.away || this.audio.paused ? 'muted' : 'playing';
  }

  subscribe(listener: () => void): void {
    this.listeners.add(listener);
    listener();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  toggleSound(): void {
    const track = currentTrack(this.store.state);
    if (!track || this.away) return;
    this.gestureVersion++;
    if (this.soundState === 'playing') {
      this.muted = true;
      this.audio.pause();
      this.notify();
      return;
    }
    this.muted = false;
    this.enabled = true;
    this.wanted = track;
    if (this.last !== track) this.audio.src = trackUrl(track);
    this.last = track;
    this.playFromGesture();
  }

  private playFromGesture(): void {
    const version = ++this.gestureVersion;
    this.blocked = false;
    this.audio.volume = 1;
    // Keep play() on the trusted click/tap stack, before any promise or fade.
    void this.audio.play().then(() => this.notify(), () => {
      if (version !== this.gestureVersion) return;
      this.blocked = true;
      this.notify();
    });
    this.notify();
  }
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
      this.blocked = true;
      this.notify();
    });
    for (const event of ['playing', 'pause', 'ended']) this.audio.addEventListener(event, () => this.notify());
    store.subscribe(() => this.sync());
    if (options.listen !== false) this.listen();
    this.sync();
  }

  idle(): Promise<void> {
    return this.chain;
  }

  leave(): void {
    this.away = true;
    this.notify();
    this.wanted = undefined;
    const version = this.gestureVersion;
    this.enqueue(async () => {
      if (version === this.gestureVersion) await this.stop(true);
    });
  }

  return(): void {
    this.away = false;
    this.sync();
  }

  private listen(): void {
    // Call play in the gesture handler itself, not after a queued fade/await.
    // Safari requires this direct gesture path to unlock audible playback.
    const retry = () => {
      if (!this.blocked || this.muted || this.away || !this.wanted ||
          this.last !== this.wanted || !this.audio.paused) return;
      this.playFromGesture();
    };
    document.addEventListener('touchend', retry);
    document.addEventListener('click', retry);
    document.addEventListener('keydown', retry);
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
    this.notify();
    if (track === this.wanted) return;
    this.wanted = track;
    this.enqueue(() => this.apply(track));
  }

  private enqueue(work: () => Promise<void>): void {
    this.chain = this.chain.then(work, work);
  }

  private async apply(track: RoomTrack | undefined): Promise<void> {
    const version = this.gestureVersion;
    if (track !== this.wanted) return;
    if (this.last && this.last !== track) await this.stop(true);
    if (track !== this.wanted || version !== this.gestureVersion) return;
    if (!track) {
      if (this.last) await this.stop(true);
      return;
    }
    if (this.muted || !this.enabled) return;
    if (this.last === track && !this.audio.paused) return;
    this.audio.src = trackUrl(track);
    this.audio.volume = 0;
    this.last = track;
    this.blocked = false;
    try {
      await this.audio.play();
    } catch {
      if (version !== this.gestureVersion) return;
      this.blocked = true;
      this.notify();
      return;
    }
    if (version !== this.gestureVersion) return;
    this.notify();
    if (track !== this.wanted || this.away || this.muted) {
      await this.stop(false);
      return;
    }
    await this.fade(0, 1, 400, (value) => {
      if (version !== this.gestureVersion) return;
      this.audio.volume = Math.min(1, Math.max(0, value));
    });
  }

  private async stop(doFade: boolean): Promise<void> {
    const version = this.gestureVersion;
    if (doFade && !this.audio.paused) {
      await this.fade(this.audio.volume, 0, 350, (value) => {
        if (version !== this.gestureVersion) return;
        this.audio.volume = Math.min(1, Math.max(0, value));
      });
    }
    if (version !== this.gestureVersion) return;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.volume = 1;
    this.last = undefined;
    this.notify();
  }
}
