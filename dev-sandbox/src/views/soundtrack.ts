import { currentTrack, trackUrl, type RoomTrack } from '../core/soundtrack';
import type { Store } from '../core/store';

export class SoundtrackPlayer {
  private audio = new Audio();
  private last: RoomTrack | undefined;

  constructor(private store: Store) {
    this.audio.loop = true;
    this.audio.preload = 'none';
    this.audio.addEventListener('error', () => {
      /* Files are optional until the licensed MP3s are dropped into src/audio/. */
    });
    store.subscribe(() => this.sync());
    this.sync();
  }

  private sync(): void {
    const track = currentTrack(this.store.state);
    if (track === this.last) return;
    this.last = track;
    this.audio.pause();
    this.audio.removeAttribute('src');
    if (!track) return;
    this.audio.src = trackUrl(track);
    void this.audio.play().catch(() => {
      /* Browser autoplay policy: user gesture required. Controls still work after the first click. */
    });
  }
}
