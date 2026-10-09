import type { ContentItem } from './types';
import { safeUrl } from './content';
import { validPhotoData } from './photos';

// What the floating card above a selected object shows. Pure data: no DOM, so it is testable.
//
// A browser cannot read another site's X-Frame-Options / frame-ancestors, so "does this page allow framing?" can't be
// answered per URL (GitHub and MDN, for example, send `X-Frame-Options: deny`). Instead only hosts that are known to
// allow framing get an iframe: providers that publish an embed URL, plus Wikipedia (sends no frame-blocking headers).
// Everything else falls back to a thumbnail when one is available, else an info card.

export type EmbedProvider = 'youtube' | 'vimeo' | 'spotify' | 'soundcloud' | 'wikipedia' | 'page';

/** Hosts (without www) whose pages allow framing. Add one only after checking its headers; see docs/standards.md. */
const FRAMABLE_SITES: ReadonlySet<string> = new Set(['gungo.dev']);

export type Preview =
  | { kind: 'embed'; title: string; src: string; provider: EmbedProvider; height: number }
  | { kind: 'image'; title: string; src: string }
  | { kind: 'note'; title: string; text: string }
  | { kind: 'card'; title: string; type: string; domain?: string; faviconSrc?: string; detail?: string };

const NOTE_EXCERPT = 240;

/** YouTube video id for watch / short / embed URLs, else null. */
export function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? null;
  else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = /^\/(embed|shorts|live)\/([^/]+)/.exec(url.pathname);
      id = m ? m[2] : null;
    }
  }
  return id && /^[A-Za-z0-9_-]{6,15}$/.test(id) ? id : null;
}

/** An iframe-safe embed for hosts known to allow framing, else null. Only ever returns https URLs on those hosts. */
export function embedFor(url: URL): { src: string; provider: EmbedProvider; height: number } | null {
  const host = url.hostname.replace(/^www\./, '');

  const yt = youtubeId(url);
  if (yt) return { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt}`, height: 169 };

  if (host === 'vimeo.com') {
    const m = /^\/(?:.*\/)?(\d{5,})\/?$/.exec(url.pathname);
    if (m) return { provider: 'vimeo', src: `https://player.vimeo.com/video/${m[1]}`, height: 169 };
  }

  if (host === 'open.spotify.com') {
    const m = /^\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{22})\/?$/.exec(url.pathname);
    if (m) return { provider: 'spotify', src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, height: 152 };
  }

  if (host === 'soundcloud.com' && /^\/[^/]+\/[^/]+/.test(url.pathname)) {
    const page = `https://soundcloud.com${url.pathname}`;
    return { provider: 'soundcloud', src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(page)}&visual=false`, height: 166 };
  }

  if (/^[a-z-]+\.wikipedia\.org$/.test(url.hostname) && url.pathname.startsWith('/wiki/')) {
    return { provider: 'wikipedia', src: `https://${url.hostname}${url.pathname}`, height: 220 };
  }

  // Whole sites we have confirmed (curl -I) send no X-Frame-Options / frame-ancestors. The page is framed as given.
  if (FRAMABLE_SITES.has(host)) return { provider: 'page', src: `https://${host}${url.pathname}${url.search}`, height: 220 };

  return null;
}

export function buildPreview(c: ContentItem): Preview {
  // A local photo wins over everything; it was validated when saved, but re-check before using it as a src.
  if (c.imageData && validPhotoData(c.imageData)) return { kind: 'image', title: c.title, src: c.imageData };

  if (c.sourceKind === 'note') {
    const text = c.sourceRef.trim();
    return { kind: 'note', title: c.title, text: text.length > NOTE_EXCERPT ? `${text.slice(0, NOTE_EXCERPT).trimEnd()}…` : text };
  }

  if (c.sourceKind === 'url') {
    const href = safeUrl(c.sourceRef);
    if (!href) return { kind: 'card', title: c.title, type: c.type, detail: c.sourceRef };
    const url = new URL(href);
    if (c.type === 'image' && /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(url.pathname)) {
      return { kind: 'image', title: c.title, src: href };
    }
    const embed = embedFor(url);
    if (embed) return { kind: 'embed', title: c.title, ...embed };
    return {
      kind: 'card', title: c.title, type: c.type,
      domain: url.hostname.replace(/^www\./, ''),
      faviconSrc: `${url.origin}/favicon.ico`,
    };
  }

  // Files and folders are stored by name only; the browser never gave us their bytes.
  return { kind: 'card', title: c.title, type: c.type, detail: c.sourceRef };
}
