export interface BookmarkEntry {
  title: string;
  url: string;
  folder: string;
}

/** Parses a Netscape-format bookmarks export (Chrome, Firefox, Safari all produce this). */
export function parseBookmarksHtml(html: string): BookmarkEntry[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const seen = new Set<string>();
  const out: BookmarkEntry[] = [];
  for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
    const url = a.getAttribute('href') ?? '';
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    try { if (!new URL(url).hostname) continue; } catch { continue; }
    seen.add(url);
    // Folder = the <H3> sitting right before the enclosing <DL>.
    const heading = a.closest('dl')?.previousElementSibling;
    const folder = heading?.tagName === 'H3' ? (heading.textContent ?? '').trim() : '';
    out.push({ title: (a.textContent ?? '').trim() || url, url, folder });
  }
  return out;
}

/** Deliberately exceeds room capacity; only HTTP(S) links survive parsing. */
export function tutorialBookmarks(capacity: number): string {
  return '<!DOCTYPE NETSCAPE-Bookmark-file-1><TITLE>Practice</TITLE><DL><DT><H3>Practice links</H3><DL>' +
    Array.from({length:capacity + 3}, (_, i) => `<DT><A HREF="https://example.com/practice/${i}">Practice link ${i + 1}</A>`).join('') +
    '<DT><A HREF="https://example.com/practice/0">Duplicate</A><DT><A HREF="javascript:alert(1)">Unsupported</A><DT><A HREF="file:///tmp/sample">Local unsupported</A><DT><A HREF="https://">Malformed URL</A></DL></DL>';
}
export const EMPTY_BOOKMARKS = '<!DOCTYPE html><p>Empty/malformed bookmark export <a href="https://">broken</a><a href="file:///sample">unsupported</a>';
