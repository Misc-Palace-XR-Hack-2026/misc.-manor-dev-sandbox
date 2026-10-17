import type { EmbedProvider } from '../core/preview';

// Vimeo's official Player API wire protocol (player.js: Player.on, ping, postMessage).
// Other providers deliberately remain manual; a generic postMessage is not a media API.
const VIMEO_ORIGIN = 'https://player.vimeo.com';
const events = ['play', 'pause', 'ended'] as const;
type Registration = { src: string; playing: boolean; ready: boolean; load: () => void };
const frames = new Map<HTMLIFrameElement, Registration>();
const listeners = new Set<(playing: boolean) => void>();
let observing = false;

function notify(): void {
  const playing = [...frames].some(([frame, state]) => frame.isConnected && state.playing);
  for (const listener of listeners) listener(playing);
}

export function subscribeEmbedAudio(listener: (playing: boolean) => void): void {
  listeners.add(listener);
  notify();
}

export function supportsEmbedAudio(provider: EmbedProvider, src: string): boolean {
  const url = new URL(src);
  return provider === 'vimeo' && url.origin === VIMEO_ORIGIN && /^\/video\/\d+$/.test(url.pathname);
}

function send(frame: HTMLIFrameElement, method: string, value?: string): void {
  frame.contentWindow?.postMessage({ method, ...(value === undefined ? {} : { value }) }, VIMEO_ORIGIN);
}

function unregister(frame: HTMLIFrameElement): void {
  const state = frames.get(frame);
  if (!state) return;
  frame.removeEventListener('load', state.load);
  frames.delete(frame);
  notify();
}

/** Register only frames created by our shared desktop/XR preview factory. */
export function registerEmbedAudio(frame: HTMLIFrameElement, provider: EmbedProvider): void {
  if (!supportsEmbedAudio(provider, frame.src)) return;
  const state: Registration = { src: frame.src, playing: false, ready: false, load: () => {
    state.playing = false;
    state.ready = false;
    notify();
    if (frame.src !== state.src) { unregister(frame); return; }
    send(frame, 'ping'); // load is only a handshake, never evidence of playback
  } };
  frames.set(frame, state);
  frame.addEventListener('load', state.load);
  if (observing) return;
  observing = true;
  // Removal, preview replacement and src changes invalidate the old player even in XR DOM overlays.
  new MutationObserver(() => {
    for (const [active, registration] of frames) {
      if (!active.isConnected || active.src !== registration.src) unregister(active);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  window.addEventListener('message', event => {
    if (event.origin !== VIMEO_ORIGIN) return;
    const entry = [...frames].find(([active, registration]) => active.isConnected &&
      active.contentWindow === event.source && active.src === registration.src);
    if (!entry) return;
    const [active, registration] = entry;
    let data: unknown = event.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return; }
    }
    if (!data || typeof data !== 'object') return;
    const payload = data as { event?: string; method?: string };
    if (payload.event === 'ready' || payload.method === 'ping') {
      if (!registration.ready) {
        registration.ready = true;
        for (const name of events) send(active, 'addEventListener', name);
      }
      return;
    }
    if (!registration.ready) return;
    if (payload.event === 'play') registration.playing = true;
    else if (payload.event === 'pause' || payload.event === 'ended') registration.playing = false;
    else return;
    notify();
  });
}
