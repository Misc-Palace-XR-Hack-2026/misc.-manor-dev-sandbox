import type { ContentType } from './types';

/** Cheap guess so pasted links land as a sensible object without extra clicks. */
export function guessType(ref: string): ContentType {
  const r = normalizeRef(ref).toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/.test(r)) return 'image';
  if (/(youtube\.com|youtu\.be|vimeo\.com|twitch\.tv)/.test(r)) return 'video';
  if (/(spotify\.com|soundcloud\.com|bandcamp\.com|music\.apple\.com)/.test(r)) return 'music';
  if (/\.(md|pdf|docx?|txt)(\?|#|$)/.test(r)) return 'doc';
  if (/(medium\.com|substack\.com|wikipedia\.org)/.test(r)) return 'article';
  return 'link';
}

/** Add https:// to pasted hostnames so they become real URLs instead of file names. */
export function normalizeRef(ref: string): string {
  const value = ref.trim();
  if (!value) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  if (/^(\/|\.\/|\.\.\/)/.test(value)) return value;
  if (/\s/.test(value)) return value;
  if (/^(localhost|(\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+(\.[a-z0-9-]+)+)([:/?#].*)?$/i.test(value)) {
    return `https://${value}`;
  }
  return value;
}

/** Only http(s) URLs are ever turned into clickable links. */
export function safeUrl(ref: string): string | null {
  try {
    const u = new URL(normalizeRef(ref));
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}
