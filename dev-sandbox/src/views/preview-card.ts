import type { Preview } from '../core/preview';
import type { MediaArt } from '../core/media-art';

// DOM card shown for the selected object. Built with textContent only, never innerHTML, so titles and notes from
// imported bookmarks can't inject markup. Image/info cards let pointer events pass through to the room; iframe embeds
// are interactive (so a video can be played) and are sandboxed.
//
// Every card can fall back to "art": a picture of the MEDIA (video, song, article, PDF, site...) with its name. It is
// never the room object's picture. That is what a link with no thumbnail, a file, or an image that failed to load shows.

export type PreviewArt = MediaArt;

/** Space kept free at the top of the viewport (the Skip button, browser chrome) so a tall card never runs under it. */
const TOP_CLEARANCE = 64;

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Same sandboxed player used by desktop and by the VR DOM overlay. */
export function createEmbedFrame(preview: Extract<Preview, { kind: 'embed' }>): HTMLIFrameElement {
  const frame = make('iframe', 'preview-iframe');
  frame.title = `Preview of ${preview.title}`;
  frame.height = String(preview.height);
  const page = preview.provider === 'page';
  frame.setAttribute('sandbox', page ? 'allow-scripts' : 'allow-scripts allow-same-origin allow-presentation allow-popups');
  frame.allow = page ? '' : 'encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = !page;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  const destination = new URL(preview.src);
  if (destination.protocol === 'https:' && destination.origin !== globalThis.location?.origin) frame.src = preview.src;
  return frame;
}

/** Fallback picture: an icon for the media type, captioned with what it is. */
function hero(art: PreviewArt): HTMLElement {
  const frame = make('div', 'preview-frame preview-hero');
  frame.dataset.type = art.type;
  const glyph = make('span', 'preview-glyph', art.glyph);
  glyph.setAttribute('aria-hidden', 'true');
  frame.append(glyph, make('span', 'preview-hero-caption', art.label));
  return frame;
}

export class PreviewCardView {
  readonly root = make('div', 'preview-card');
  private shown: Preview | null = null;
  private shownArt = '';
  private openUrl: string | null = null;

  constructor(container: HTMLElement) {
    this.root.hidden = true;
    container.appendChild(this.root);
    // A card for a link opens it when clicked anywhere (the iframe and real anchors handle themselves).
    this.root.addEventListener('click', (event) => {
      if (!this.openUrl || (event.target as HTMLElement).closest('a, iframe')) return;
      window.open(this.openUrl, '_blank', 'noopener,noreferrer');
    });
  }

  /**
   * Show a preview, or hide the card with null. Rebuilds DOM only when the preview, its art or its link changes.
   * With `openUrl` (an http(s) link) the whole card is clickable and has an explicit Open link.
   */
  show(preview: Preview | null, art: PreviewArt | null = null, openUrl: string | null = null): void {
    const artKey = art ? `${art.type}:${art.glyph}:${art.label}` : '';
    const link = preview ? openUrl : null;
    if (preview === this.shown && artKey === this.shownArt && link === this.openUrl) return;
    this.shown = preview;
    this.shownArt = artKey;
    this.openUrl = link;
    this.root.replaceChildren();
    this.root.hidden = preview === null;
    const embed = preview?.kind === 'embed';
    this.root.classList.toggle('preview-interactive', embed);
    this.root.classList.toggle('preview-openable', link !== null && !embed);
    // Decorative cards are described by the item sheet; a focusable iframe or link must stay in the accessibility tree.
    if (embed || link) this.root.removeAttribute('aria-hidden'); else this.root.setAttribute('aria-hidden', 'true');
    if (preview) this.root.append(this.render(preview, art));
  }

  /**
   * Dock the card with its bottom-right corner at (x, y) in viewport pixels. The card is anchored by its BOTTOM and
   * RIGHT edges, so it never needs its own height: longer content grows upward and can't reach the panel below it.
   * Its max height stops short of the top of the viewport (room for the Skip button) and scrolls beyond that.
   */
  dockBottomRight(x: number, y: number): void {
    const s = this.root.style;
    const right = Math.max(12, Math.round(window.innerWidth - x));
    const bottom = Math.max(12, Math.round(window.innerHeight - y));
    s.left = 'auto';
    s.top = 'auto';
    s.right = `${right}px`;
    s.bottom = `${bottom}px`;
    s.transform = 'none';
    s.maxHeight = `${Math.max(120, window.innerHeight - bottom - TOP_CLEARANCE)}px`;
    s.overflowY = 'auto';
  }

  /** Float the card with its bottom-centre at a point in viewport pixels (for floating above objects). */
  moveTo(x: number, y: number): void {
    const s = this.root.style;
    const width = this.root.offsetWidth || 240;
    const margin = 12;
    const cx = Math.min(Math.max(x, width / 2 + margin), window.innerWidth - width / 2 - margin);
    // Grows upward from the anchor; never above the top clearance.
    const height = this.root.offsetHeight || 0;
    const cy = Math.min(Math.max(y, height + TOP_CLEARANCE), window.innerHeight - margin);
    s.right = 'auto';
    s.bottom = 'auto';
    s.left = '0';
    s.top = '0';
    s.maxHeight = `${Math.max(120, window.innerHeight - TOP_CLEARANCE - margin)}px`;
    s.overflowY = 'auto';
    s.transform = `translate(${Math.round(cx)}px, ${Math.round(cy)}px) translate(-50%, -100%)`;
  }

  private render(p: Preview, art: PreviewArt | null): HTMLElement {
    // Not `preview-${p.kind}`: for a link card that is `preview-card`, the root's class, which would make this inner
    // body position:fixed at the viewport corner and (inside the scrolling root) clip it to nothing.
    const body = make('div', `preview-body preview-kind-${p.kind}`);
    if (p.kind === 'embed') {
      const frame = createEmbedFrame(p);
      const destination = new URL(p.src);
      if (destination.protocol === 'https:' && destination.origin !== location.origin) {
        frame.src = p.src;
        body.append(frame);
      }
      body.append(make('div', 'preview-title', p.title));
      const guidance = make('div', 'preview-text', 'Loading or blank? This site may block previews or need browser features.');
      const open = make('a', 'preview-open', 'Open in browser');
      open.href = this.openUrl ?? p.src;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      body.append(guidance, open);
    } else if (p.kind === 'image') {
      const frame = make('div', 'preview-frame');
      const img = make('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      img.addEventListener('error', () => {
        if (art) frame.replaceWith(hero(art));
        else { frame.classList.add('preview-broken'); img.remove(); }
      });
      img.src = p.src;
      frame.append(img);
      body.append(frame, make('div', 'preview-title', p.title));
    } else if (p.kind === 'note') {
      if (art) body.append(hero(art));
      body.append(make('div', 'preview-title', p.title), make('div', 'preview-text', p.text));
    } else {
      const head = make('div', 'preview-head');
      if (p.faviconSrc) {
        const icon = make('img', 'preview-favicon');
        icon.alt = '';
        icon.referrerPolicy = 'no-referrer';
        icon.addEventListener('error', () => icon.remove());
        icon.src = p.faviconSrc;
        head.append(icon);
      }
      head.append(make('span', 'preview-domain', p.domain ?? p.type));
      if (art) body.append(hero(art));
      body.append(head, make('div', 'preview-title', p.title));
      if (p.detail) body.append(make('div', 'preview-text', p.detail));
    }
    if (this.openUrl && p.kind !== 'embed') {
      const open = make('a', 'preview-open', 'Open');
      open.href = this.openUrl;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      body.append(open);
    }
    return body;
  }
}
