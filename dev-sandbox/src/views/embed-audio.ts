import type { EmbedProvider } from '../core/preview';

// Provider-specific transports from official Vimeo player.js, YouTube www-widgetapi.js,
// and SoundCloud Widget API. See docs/audio-coordination.md: no generic media messages
// or SDK/sandbox injection.
const VIMEO_ORIGIN = 'https://player.vimeo.com';
const SOUNDCLOUD_ORIGIN = 'https://w.soundcloud.com';
const events = ['play', 'pause', 'ended'] as const;
const soundcloudEvents = ['play', 'pause', 'finish'] as const;
type Registration = {
  src: string; origin: string; provider: EmbedProvider; id: number;
  playing: boolean; ready: boolean; load: () => void;
  retry?: ReturnType<typeof setInterval>;
};
const frames = new Map<HTMLIFrameElement, Registration>();
const listeners = new Set<(playing: boolean) => void>();
let observing = false;
let nextId = 0;

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
  return (provider === 'vimeo' && url.origin === VIMEO_ORIGIN && /^\/video\/\d+$/.test(url.pathname)) ||
    (provider === 'youtube' && ['https://www.youtube.com', 'https://www.youtube-nocookie.com'].includes(url.origin) &&
      /^\/embed\/[\w-]{11}$/.test(url.pathname)) ||
    (provider === 'soundcloud' && url.origin === SOUNDCLOUD_ORIGIN && /^\/player\/?$/.test(url.pathname) &&
      url.searchParams.has('url'));
}

function sendVimeo(frame: HTMLIFrameElement, method: string, value?: string): void {
  frame.contentWindow?.postMessage({ method, ...(value === undefined ? {} : { value }) }, VIMEO_ORIGIN);
}

function sendYouTube(frame: HTMLIFrameElement, state: Registration, payload: object): void {
  frame.contentWindow?.postMessage(JSON.stringify({ ...payload, id: state.id, channel: 'widget' }), state.origin);
}

function sendSoundCloud(frame: HTMLIFrameElement, method: string, value?: string): void {
  frame.contentWindow?.postMessage(JSON.stringify({ method, ...(value === undefined ? {} : { value }) }), SOUNDCLOUD_ORIGIN);
}

function unregister(frame: HTMLIFrameElement): void {
  const state = frames.get(frame);
  if (!state) return;
  clearInterval(state.retry);
  frame.removeEventListener('load', state.load);
  frames.delete(frame);
  notify();
}

/** Register only frames created by our shared desktop/XR preview factory. */
export function registerEmbedAudio(frame: HTMLIFrameElement, provider: EmbedProvider): void {
  unregister(frame);
  if (!supportsEmbedAudio(provider, frame.src)) return;
  if (provider === 'youtube') {
    const url = new URL(frame.src);
    url.searchParams.set('enablejsapi', '1');
    url.searchParams.set('origin', location.origin);
    frame.src = url.href;
  }
  const state: Registration = {
    src: frame.src, origin: new URL(frame.src).origin, provider, id: ++nextId,
    playing: false, ready: false, load: () => {
      clearInterval(state.retry);
      state.playing = false;
      state.ready = false;
      state.id = ++nextId; // reject queued messages from a previous document in this same frame
      notify();
      if (frame.src !== state.src) { unregister(frame); return; }
      if (provider === 'vimeo') sendVimeo(frame, 'ping');
      else if (provider === 'soundcloud') {
        const listen = () => { for (const name of soundcloudEvents) sendSoundCloud(frame, 'addEventListener', name); };
        listen();
        state.retry = setInterval(listen, 250);
      } else {
        // Like the official widget, retry listening until the asynchronously booting player responds.
        const listen = () => sendYouTube(frame, state, { event: 'listening' });
        listen();
        state.retry = setInterval(listen, 250);
      }
    },
  };
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
    const entry = [...frames].find(([active, registration]) => active.isConnected &&
      event.origin === registration.origin && active.contentWindow === event.source && active.src === registration.src);
    if (!entry) return;
    const [active, registration] = entry;
    let data: unknown = event.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return; }
    }
    if (!data || typeof data !== 'object') return;
    const payload = data as { event?: string; method?: string; id?: number; info?: unknown };
    if (registration.provider === 'youtube') {
      if (payload.id !== registration.id) return;
      if (payload.event === 'initialDelivery' || payload.event === 'onReady') {
        clearInterval(registration.retry);
        if (!registration.ready) {
          registration.ready = true;
          sendYouTube(active, registration, { event: 'command', func: 'addEventListener', args: ['onStateChange'] });
        }
        return; // readiness / initial state is not playback
      }
      if (!registration.ready || payload.event !== 'onStateChange') return;
      if (payload.info === 1) registration.playing = true;
      else if (payload.info === 0 || payload.info === 2) registration.playing = false;
      else return; // buffering/cued/unstarted must not clear an active player's pause reason
    } else if (registration.provider === 'soundcloud') {
      // Official Widget API: JSON { method, value } from https://w.soundcloud.com.
      if (payload.method === 'ready') {
        clearInterval(registration.retry);
        if (!registration.ready) {
          registration.ready = true;
          for (const name of soundcloudEvents) sendSoundCloud(active, 'addEventListener', name);
        }
        return;
      }
      if (payload.method !== 'play' && payload.method !== 'pause' && payload.method !== 'finish') return;
      clearInterval(registration.retry);
      registration.ready = true;
      registration.playing = payload.method === 'play';
    } else {
      if (payload.event === 'ready' || payload.method === 'ping') {
        if (!registration.ready) {
          registration.ready = true;
          for (const name of events) sendVimeo(active, 'addEventListener', name);
        }
        return;
      }
      if (!registration.ready) return;
      if (payload.event === 'play') registration.playing = true;
      else if (payload.event === 'pause' || payload.event === 'ended') registration.playing = false;
      else return;
    }
    notify();
  });
}
