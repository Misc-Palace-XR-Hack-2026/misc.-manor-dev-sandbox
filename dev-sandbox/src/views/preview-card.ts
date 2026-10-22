import { publicPreviewUrl, previewOpenUrl, type Preview } from '../core/preview';
import { registerEmbedAudio, supportsEmbedAudio } from './embed-audio';
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
  // Main's public-HTTPS preview policy decides eligibility; audio coordination only ever attaches to a frame
  // that policy already allowed to load. No proxying, no header rewriting, no sandbox relaxation.
  if (publicPreviewUrl(destination)) {
    frame.src = preview.src;
    registerEmbedAudio(frame, preview.provider);
  }
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

/** Open in browser: the one action that must be reachable in every preview state. */
function openAction(href: string | null | undefined, label = 'Open in browser'): HTMLAnchorElement | null {
  if (!href) return null;
  const open = make('a', 'preview-open', label);
  open.href = href;
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  return open;
}

export class PreviewCardView {
  readonly root = make('div', 'preview-card');
  private shown: Preview | null = null;
  private shownArt = '';
  private openUrl: string | null = null;
  private compact = false;
  /** Rebuild on the next show() even if the preview is the same (the layout changed). */
  private stale = false;

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
   * Compact cards (the demo): smaller on phones, one short status line, title and Open on one row. Same policy and
   * Open action as the full card.
   */
  setCompact(on: boolean): void {
    if (on === this.compact) return;
    this.compact = on;
    this.stale = true;
    this.root.classList.toggle('preview-compact', on);
  }

  /**
   * Show a preview, or hide the card with null. Rebuilds DOM only when the preview, its art or its link changes.
   * `openUrl` overrides where Open in browser goes (e.g. the watch page behind a provider embed); otherwise a card
   * uses its policy `openHref`. A card with a link is clickable anywhere.
   */
  show(preview: Preview | null, art: PreviewArt | null = null, openUrl: string | null = null): void {
    const artKey = art ? `${art.type}:${art.glyph}:${art.label}` : '';
    const link = !preview ? null
      : (openUrl ? previewOpenUrl(openUrl) : null) ?? (preview.kind === 'card' ? preview.openHref ?? null : null);
    if (!this.stale && preview === this.shown && artKey === this.shownArt && link === this.openUrl) return;
    this.stale = false;
    this.shown = preview;
    this.shownArt = artKey;
    this.openUrl = link;
    this.root.replaceChildren();
    this.root.hidden = preview === null;
    const embed = preview?.kind === 'embed';
    // A card that offers Open in browser is a real control: it must be clickable (pointer-events)
    // and present in the accessibility tree, or the "always reachable" fallback is a lie.
    const actionable = embed || link !== null;
    this.root.classList.toggle('preview-interactive', actionable);
    this.root.classList.toggle('preview-openable', link !== null && !embed);
    // Decorative cards are described by the item sheet; a focusable iframe or link must stay in the tree.
    if (actionable) this.root.removeAttribute('aria-hidden'); else this.root.setAttribute('aria-hidden', 'true');
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
    if (this.compact) return this.renderCompact(body, p, art);
    if (p.kind === 'embed') {
      const frame = createEmbedFrame(p);
      if (frame.getAttribute('src')) body.append(frame);
      body.append(make('div', 'preview-title', p.title));
      const fallback = 'This site may block previews or need browser features.';
      const guidance = make('div', 'preview-text', `Loading preview… Blank? ${fallback}`);
      guidance.setAttribute('role', 'status');
      // Cross-origin failures often fire load too. Never mark the page as successfully rendered.
      frame.addEventListener('load', () => { guidance.textContent = `Preview availability unverified. ${fallback}`; });
      frame.addEventListener('error', () => { guidance.textContent = `Preview could not load. ${fallback}`; });
      const open = openAction(this.openUrl ?? previewOpenUrl(p.src));
      // Order matters: main's preview policy checks `.preview-text` first-match for the load guidance,
      // so the guidance stays first and PR #81's manual-mute notice follows it.
      body.append(guidance);
      // PR #81: providers without a supported player API cannot be coordinated automatically; tell the user how to
      // avoid double audio instead of silently overlapping the room soundtrack.
      if (!supportsEmbedAudio(p.provider, p.src)) {
        body.append(make('div', 'preview-text', 'Automatic audio coordination is unavailable for this preview. Mute room music before playing media here, or use Open in browser.'));
      }
      if (open) body.append(open);
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
      // A blocked / unsupported / ineligible destination must still offer the external handoff.
      const open = openAction(this.openUrl);
      if (open) body.append(open);
    }
    if (p.kind === 'image' || p.kind === 'note') {
      const open = openAction(this.openUrl);
      if (open) body.append(open);
    }
    return body;
  }

  /** Picture on top, then the title with Open beside it, then at most one short line. Never claims a page loaded. */
  private renderCompact(body: HTMLElement, p: Preview, art: PreviewArt | null): HTMLElement {
    const row = (title: string, href: string | null | undefined) => {
      const r = make('div', 'preview-title-row');
      r.append(make('div', 'preview-title', title));
      const open = openAction(href, 'Open ↗');
      if (open) r.append(open);
      return r;
    };
    if (p.kind === 'embed') {
      const frame = createEmbedFrame(p);
      const loads = Boolean(frame.getAttribute('src'));
      if (loads) body.append(frame);
      const status = make('div', 'preview-text', loads ? 'Loading…' : 'No preview here.');
      status.setAttribute('role', 'status');
      frame.addEventListener('load', () => { status.textContent = 'Blank? Use Open.'; });
      frame.addEventListener('error', () => { status.textContent = 'No preview here.'; });
      body.append(row(p.title, this.openUrl ?? previewOpenUrl(p.src)), status);
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
      body.append(frame, row(p.title, this.openUrl));
    } else if (p.kind === 'note') {
      if (art) body.append(hero(art));
      body.append(row(p.title, this.openUrl), make('div', 'preview-text', p.text));
    } else {
      if (art) body.append(hero(art));
      body.append(row(p.title, this.openUrl));
    }
    return body;
  }
}
