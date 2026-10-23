/** Browser-only, direct publisher requests. No proxy, secrets, cookies or room data. */
export interface LinkText {
  status: 'ready' | 'stale' | 'unavailable';
  text?: string;
  fetchedAt: number;
  reason?: string;
}
// Deliberately closed publisher list: hostname syntax alone cannot exclude private DNS targets.
// Raw GitHub serves readable Markdown/text with CORS. Other publishers may refuse CORS.
const PUBLISHERS = new Set(['raw.githubusercontent.com', 'developer.mozilla.org', 'www.gutenberg.org', 'en.wikipedia.org']);
export function linkTextTarget(source: string): string | null {
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !PUBLISHERS.has(url.hostname)) return null;
    url.hash = '';
    // MDN's own public source repository supplies article text with CORS; no extraction service.
    if (url.hostname === 'developer.mozilla.org' && /^\/en-US\/docs\/[a-z0-9_./-]+$/i.test(url.pathname)) {
      const slug = url.pathname.slice('/en-US/docs/'.length).replace(/\/$/, '').toLowerCase();
      return `https://raw.githubusercontent.com/mdn/content/main/files/en-us/${slug}/index.md`;
    }
    return url.href;
  } catch { return null; }
}
const TTL = 15 * 60_000;
const MAX_BYTES = 512_000;
export class LinkTextCache {
  private entries = new Map<string, LinkText>();
  constructor(private request: typeof fetch = (...args) => fetch(...args), private now: () => number = Date.now, private timeout = 8000) {}
  peek(source: string): LinkText | undefined {
    const entry = this.entries.get(source);
    if (!entry) return undefined;
    return entry.text && this.now() - entry.fetchedAt >= TTL ? {...entry, status: 'stale'} : entry;
  }
  async load(source: string, signal: AbortSignal): Promise<LinkText> {
    signal.throwIfAborted();
    const cached = this.peek(source);
    if (cached && (cached.status === 'ready' || cached.status === 'unavailable' && this.now() - cached.fetchedAt < 60_000)) return cached;
    const target = linkTextTarget(source);
    if (!target) return {status: 'unavailable', fetchedAt: this.now(), reason: 'Unsupported or unsafe URL; only trusted public HTTPS publishers can be fetched.'};
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, {once:true});
    const timer = setTimeout(abort, this.timeout);
    let entry: LinkText;
    try {
      const response = await this.request(target, {signal: controller.signal, mode:'cors', credentials:'omit', redirect:'error', referrerPolicy:'no-referrer'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get('content-type') ?? '';
      if (!/^(text\/(plain|html|markdown)|application\/xhtml\+xml)(;|$)/i.test(type)) throw new Error('Not a supported text page');
      if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Page exceeds 512 KB limit');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable page body');
      let bytes = 0, body = ''; const decoder = new TextDecoder();
      try {
        while (true) {
          const {value, done} = await reader.read(); if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_BYTES) throw new Error('Page exceeds 512 KB limit');
          body += decoder.decode(value, {stream:true});
        }
        body += decoder.decode();
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      let text = body;
      if (/html/i.test(type)) {
        // Template contents stay inert (including resource URLs); never mount remote markup.
        const template = document.createElement('template'); template.innerHTML = body;
        template.content.querySelectorAll('script,style,noscript,template,nav,header,footer,iframe,svg').forEach(node => node.remove());
        text = (template.content.querySelector('article,main') ?? template.content).textContent ?? '';
      }
      text = text.replace(/\s+/g, ' ').trim().slice(0,100_000);
      if (!text) throw new Error('No readable page text');
      entry = {status:'ready', text, fetchedAt:this.now()};
    } catch (error) {
      signal.throwIfAborted();
      const reason = controller.signal.aborted ? 'Request timed out' : error instanceof TypeError ? 'Publisher blocked browser access (CORS) or network unavailable' : error instanceof Error ? error.message : 'Page unavailable';
      entry = cached?.text ? {...cached, status:'stale', reason} : {status:'unavailable', fetchedAt:this.now(), reason};
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); controller.abort(); }
    signal.throwIfAborted();
    this.entries.delete(source); this.entries.set(source, entry);
    while (this.entries.size > 32) this.entries.delete(this.entries.keys().next().value!);
    return entry;
  }
}

/** Two workers per search session; abort also prevents any late UI callbacks. */
export async function indexLinkTexts(sources: readonly string[], cache: LinkTextCache, signal: AbortSignal, update: (source: string, entry: LinkText) => void): Promise<void> {
  const queue = [...new Set(sources)];
  await Promise.all([0,1].map(async () => {
    while (queue.length && !signal.aborted) {
      const source = queue.shift()!;
      try { const entry = await cache.load(source, signal); if (!signal.aborted) update(source, entry); }
      catch { if (!signal.aborted) throw new Error('Link indexing interrupted'); }
    }
  }));
}
