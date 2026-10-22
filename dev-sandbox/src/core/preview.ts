import type { ContentItem } from './types';
import { safeUrl } from './content';
import { validPhotoData } from './photos';

// What the floating card above a selected object shows. Pure data: no DOM, so it is testable.
//
// Eligibility is permission to TRY, never proof of frameability. Browser protections remain authoritative.
// See docs/public-preview-policy.md for ownership, privacy tradeoffs and DNS/redirect limitations.

export type EmbedProvider = 'youtube' | 'vimeo' | 'spotify' | 'soundcloud' | 'wikipedia' | 'page';

/** Exact host + dot-boundary subdomains. Official provider routes below take precedence. */
const PAGE_BLOCKLIST = [
  'github.com', 'gitlab.com', 'codeberg.org', 'bitbucket.org',
  'developer.mozilla.org', 'news.ycombinator.com', 'reddit.com',
  'twitter.com', 'x.com', 'facebook.com', 'instagram.com',
  'linkedin.com', 'discord.com',
  // Provider landing/channel/profile pages are not generic players.
  'youtube.com', 'youtube-nocookie.com', 'youtu.be', 'vimeo.com',
  'spotify.com', 'soundcloud.com', 'wikipedia.org', 'twitch.tv',
  // Previously verified unsuitable supplied destinations (see web-previews.md).
  'distrokid.com', 'hyperfollow.com', 'amazon.com', 'amzn.to', 'a.co',
] as const;

const canonicalHost = (host: string): string => host.toLowerCase().replace(/\.$/, '');
const hostMatches = (host: string, rule: string): boolean => host === rule || host.endsWith(`.${rule}`);

/** Syntactic eligibility only, NOT DNS validation or an SSRF/network boundary.
 * Conservatively reject ALL IP literals; URL parsing canonicalizes alternate IPv4/IPv6 forms first.
 */
export function publicPreviewUrl(url: URL, origin = globalThis.location?.origin): boolean {
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = canonicalHost(url.hostname);
  if (!host.includes('.') || host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host)) return false;
  if (!host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return false;
  if (['localhost', 'local', 'internal', 'intranet', 'lan', 'home', 'home.arpa', 'localdomain', 'test', 'invalid', 'onion']
    .some(rule => hostMatches(host, rule))) return false;
  if (origin) {
    const app = new URL(origin);
    if (canonicalHost(app.hostname) === host && app.protocol === url.protocol && app.port === url.port) return false;
  }
  return true;
}

/** Explicit user handoff. Deliberately WIDER than frame eligibility: a click hands the address to the
 * user's own browser, so HTTP, blocked hosts, ports, private hosts and our own origin are all allowed.
 * Refused: unsafe schemes (via safeUrl) and embedded credentials, which must never be replayed.
 */
export function previewOpenUrl(ref: string): string | null {
  const href = safeUrl(ref);
  if (!href) return null;
  const url = new URL(href);
  if (url.username || url.password) return null;
  return href;
}

export type Preview =
  | { kind: 'embed'; title: string; src: string; provider: EmbedProvider; height: number }
  | { kind: 'image'; title: string; src: string }
  | { kind: 'note'; title: string; text: string }
  | { kind: 'card'; title: string; type: string; domain?: string; faviconSrc?: string; detail?: string; openHref?: string };

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

/** YouTube playlist id from watch/playlist URLs, else null. */
export function youtubePlaylistId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, '');
  if (!(host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com')) return null;
  const list = url.searchParams.get('list');
  return list && /^[A-Za-z0-9_-]{8,64}$/.test(list) ? list : null;
}

/** Official player first, otherwise an eligible sandboxed page attempt or a card. */
export function embedFor(url: URL): { src: string; provider: EmbedProvider; height: number } | null {
  if (!publicPreviewUrl(url)) return null;
  const host = url.hostname.replace(/^www\./, '');

  const yt = youtubeId(url);
  const ytList = youtubePlaylistId(url);
  if (yt && ytList) {
    return { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt}?list=${encodeURIComponent(ytList)}`, height: 169 };
  }
  if (yt) return { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt}`, height: 169 };
  if (!yt && ytList) {
    return { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(ytList)}`, height: 169 };
  }

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

  if (PAGE_BLOCKLIST.some(rule => hostMatches(canonicalHost(url.hostname), rule))) return null;
  // Preserve the original destination; never proxy, prefetch or rewrite its headers.
  return { provider: 'page', src: url.href, height: 220 };
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
    const openHref = previewOpenUrl(c.sourceRef) ?? undefined;
    if (!href) return { kind: 'card', title: c.title, type: c.type, detail: c.sourceRef, openHref };
    const url = new URL(href);
    if (!publicPreviewUrl(url)) return {
      kind: 'card', title: c.title, type: c.type, domain: url.hostname, openHref,
      detail: 'Preview unavailable: requires a public HTTPS address without credentials or a custom port.',
    };
    if (c.type === 'image' && /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(url.pathname)) {
      return { kind: 'image', title: c.title, src: href };
    }
    const embed = embedFor(url);
    if (embed) return { kind: 'embed', title: c.title, ...embed };
    return {
      kind: 'card', title: c.title, type: c.type,
      domain: url.hostname.replace(/^www\./, ''),
      faviconSrc: `${url.origin}/favicon.ico`,
      openHref,
    };
  }

  // Files and folders are stored by name only; the browser never gave us their bytes.
  return { kind: 'card', title: c.title, type: c.type, detail: c.sourceRef };
}
