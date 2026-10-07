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
    seen.add(url);
    // Folder = the <H3> sitting right before the enclosing <DL>.
    const heading = a.closest('dl')?.previousElementSibling;
    const folder = heading?.tagName === 'H3' ? (heading.textContent ?? '').trim() : '';
    out.push({ title: (a.textContent ?? '').trim() || url, url, folder });
  }
  return out;
}
