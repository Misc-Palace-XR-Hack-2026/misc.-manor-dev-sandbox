import type { Preview } from '../core/preview';
import type { MediaArt } from '../core/media-art';

// DOM card shown for the selected object. Built with textContent only, never innerHTML, so titles and notes from
// imported bookmarks can't inject markup. Image/info cards let pointer events pass through to the room; iframe embeds
// are interactive (so a video can be played) and are sandboxed.
//
// Every card can fall back to "art": a picture of the MEDIA (video, song, article, PDF, site...) with its name. It is
// never the room object's picture. That is what a link with no thumbnail, a file, or an image that failed to load shows.

export type PreviewArt = MediaArt;

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};

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

  constructor(container: HTMLElement) {
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  /** Show a preview, or hide the card with null. Rebuilds DOM only when the preview or its art changes. */
  show(preview: Preview | null, art: PreviewArt | null = null): void {
    const artKey = art ? `${art.type}:${art.glyph}:${art.label}` : '';
    if (preview === this.shown && artKey === this.shownArt) return;
    this.shown = preview;
    this.shownArt = artKey;
    this.root.replaceChildren();
    this.root.hidden = preview === null;
    const embed = preview?.kind === 'embed';
    this.root.classList.toggle('preview-interactive', embed);
    // Decorative cards are described by the item sheet; a focusable iframe must stay in the accessibility tree.
    if (embed) this.root.removeAttribute('aria-hidden'); else this.root.setAttribute('aria-hidden', 'true');
    if (preview) this.root.append(this.render(preview, art));
  }

  /** Dock the card with its bottom-right corner at (x, y) in viewport pixels. Clamps to stay in viewport. */
  dockBottomRight(x: number, y: number): void {
    const rect = this.root.getBoundingClientRect();
    const cardWidth = rect.width || 240; // fallback to default width
    const cardHeight = rect.height || 200;
    // Clamp x so the card's right edge doesn't exceed viewport, leaving 12px margin
    const viewportWidth = window.innerWidth;
    const clampedX = Math.min(x, viewportWidth - 12);
    const clampedX2 = Math.max(clampedX - cardWidth, 12);
    // Clamp y so card's bottom edge stays in viewport
    const viewportHeight = window.innerHeight;
    const clampedY = Math.min(y, viewportHeight - 12);
    // Position with bottom-right corner at the clamped point
    this.root.style.transform = `translate(${Math.round(clampedX2)}px, ${Math.round(clampedY - cardHeight)}px)`;
  }

  /** Float the card with its bottom-centre at a point in viewport pixels (for floating above objects). */
  moveTo(x: number, y: number): void {
    this.root.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }

  private render(p: Preview, art: PreviewArt | null): HTMLElement {
    const body = make('div', `preview-body preview-${p.kind}`);
    if (p.kind === 'embed') {
      const frame = make('iframe', 'preview-iframe');
      frame.title = `Preview of ${p.title}`;
      frame.height = String(p.height);
      // Scripts + same-origin are needed by the players themselves (their own origin, not ours). No top navigation,
      // forms or downloads. A referrer is sent because YouTube refuses to play embeds without one.
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
      frame.allow = 'encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.src = p.src;
      body.append(frame, make('div', 'preview-title', p.title));
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
    return body;
  }
}
