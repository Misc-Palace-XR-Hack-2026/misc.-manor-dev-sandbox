import type { ContentItem, ContentType } from './types';
import { safeUrl } from './content';

// The fallback picture for a preview. A preview shows what the MEDIA is (a video, a song, an article, a PDF, a site),
// never which furniture it sits on, so this maps the content itself, not the room object. Pure data, no DOM.

export interface MediaArt {
  /** Emoji shown large. */
  glyph: string;
  /** Short caption, e.g. "Video · youtube.com" or "PDF document". */
  label: string;
  /** Content type, used by the view to tint the background. */
  type: ContentType;
}

const TYPE_GLYPH: Record<ContentType, string> = {
  link: '🔗', article: '📰', image: '🖼️', video: '🎬', music: '🎵', doc: '📄', file: '📁', note: '📝', tool: '🛠️',
};

const TYPE_LABEL: Record<ContentType, string> = {
  link: 'Link', article: 'Article', image: 'Image', video: 'Video', music: 'Music', doc: 'Document', file: 'File', note: 'Note', tool: 'Tool',
};

/** File extension to a more specific picture + name. Checked against file names and URL paths. */
const EXTENSIONS: ReadonlyArray<[RegExp, string, string]> = [
  [/\.pdf$/i, '📕', 'PDF'],
  [/\.(docx?|odt|rtf|txt|md)$/i, '📄', 'Document'],
  [/\.(xlsx?|csv|ods|tsv)$/i, '📊', 'Spreadsheet'],
  [/\.(pptx?|key|odp)$/i, '📽️', 'Slides'],
  [/\.(zip|rar|7z|tar|gz|tgz)$/i, '🗜️', 'Archive'],
  [/\.(mp3|wav|flac|ogg|m4a|aac)$/i, '🎵', 'Audio'],
  [/\.(mp4|mov|webm|mkv|avi|m4v)$/i, '🎬', 'Video'],
  [/\.(png|jpe?g|gif|webp|svg|avif|heic)$/i, '🖼️', 'Image'],
  [/\.(js|ts|py|rb|go|rs|java|c|cpp|h|json|html|css|sh)$/i, '💻', 'Code'],
];

/** Well-known hosts to a specific picture + name, for links that have no embed or thumbnail. */
const HOSTS: ReadonlyArray<[RegExp, string, string]> = [
  [/(^|\.)(youtube\.com|youtu\.be|vimeo\.com|twitch\.tv)$/, '🎬', 'Video'],
  [/(^|\.)(spotify\.com|soundcloud\.com|deezer\.com|bandcamp\.com|music\.apple\.com)$/, '🎵', 'Music'],
  [/(^|\.)wikipedia\.org$/, '📚', 'Encyclopedia'],
  [/(^|\.)(github\.com|gitlab\.com|codeberg\.org)$/, '💻', 'Code repository'],
  [/(^|\.)(medium\.com|substack\.com)$/, '📰', 'Article'],
];

export function mediaArt(c: ContentItem): MediaArt {
  const base = { glyph: TYPE_GLYPH[c.type], label: TYPE_LABEL[c.type], type: c.type };

  if (c.sourceKind === 'note') return base;

  if (c.sourceKind === 'file') {
    const hit = EXTENSIONS.find(([re]) => re.test(c.sourceRef));
    return hit && c.type !== 'image' ? { ...base, glyph: hit[1], label: hit[2] } : base;
  }

  const href = safeUrl(c.sourceRef);
  if (!href) return base;
  const url = new URL(href);
  const host = url.hostname.replace(/^www\./, '');
  // The content type the user chose wins for the label; host and extension only refine the picture.
  const byExt = EXTENSIONS.find(([re]) => re.test(url.pathname));
  const byHost = HOSTS.find(([re]) => re.test(host));
  const hit = byExt ?? byHost;
  const glyph = hit ? hit[1] : base.glyph;
  const kind = hit && c.type === 'link' ? hit[2] : base.label;
  return { glyph, label: `${kind} \u00b7 ${host}`, type: c.type };
}
