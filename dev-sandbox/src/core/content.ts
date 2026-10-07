import type { ContentType } from './types';

/** Cheap guess so pasted links land as a sensible object without extra clicks. */
export function guessType(ref: string): ContentType {
  const r = ref.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/.test(r)) return 'image';
  if (/(youtube\.com|youtu\.be|vimeo\.com|twitch\.tv)/.test(r)) return 'video';
  if (/(spotify\.com|soundcloud\.com|bandcamp\.com|music\.apple\.com)/.test(r)) return 'music';
  if (/(github\.com|gitlab\.com|npmjs\.com|figma\.com)/.test(r)) return 'tool';
  if (/\.(md|pdf|docx?|txt)(\?|#|$)/.test(r) || /docs\./.test(r) || /\/docs?\//.test(r)) return 'doc';
  if (/(medium\.com|substack\.com|wikipedia\.org|\/blog|\/article)/.test(r)) return 'article';
  return 'link';
}

/** Only http(s) URLs are ever turned into clickable links. */
export function safeUrl(ref: string): string | null {
  try {
    const u = new URL(ref);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}
