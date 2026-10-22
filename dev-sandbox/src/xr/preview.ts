import * as THREE from 'three';
import { HUD, hudPanel, hudRect } from './hud';
import type { ContentItem } from '../core/types';
import { buildPreview, youtubeId } from '../core/preview';
import { mediaArt } from '../core/media-art';
import { safeUrl } from '../core/content';

/** Same content resolver as the desktop card, rendered into a world-space texture.
 * HTML/iframe players cannot be composited into WebXR; Open hands off to the browser. */
export class XrPreview {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private canvas = document.createElement('canvas');
  private texture: THREE.CanvasTexture;
  private disposed = false;
  private image: HTMLImageElement | null = null;

  constructor(content: ContentItem) {
    this.canvas.width = 1024;
    this.canvas.height = 720;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.7875),
      new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true }));
    this.mesh.name = 'xr-preview';
    this.mesh.position.y = 0.48;
    this.mesh.renderOrder = 20;
    const preview = buildPreview(content);
    const art = mediaArt(content);
    const href = content.sourceKind === 'url' ? safeUrl(content.sourceRef) : null;
    const videoId = href ? youtubeId(new URL(href)) : null;
    const src = preview.kind === 'image' ? preview.src : videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
    const detail = preview.kind === 'note' ? preview.text : preview.kind === 'card' ? preview.detail ?? preview.domain ?? '' : href ?? '';
    const draw = (image?: HTMLImageElement) => {
      if (this.disposed) return;
      const c = this.canvas.getContext('2d')!;
      hudPanel(c, 1024, 720);
      hudRect(c, 24, 32, 976, 272, 20, HUD.inset);
      if (image) {
        const scale = Math.min(976 / image.naturalWidth, 280 / image.naturalHeight);
        const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
        c.drawImage(image, (1024 - w) / 2, 24 + (280 - h) / 2, w, h);
      } else {
        c.fillStyle = HUD.text; c.font = '80px system-ui, sans-serif';
        c.textAlign = 'center'; c.fillText(art.glyph, 512, 160);
        c.font = '28px system-ui, sans-serif'; c.fillText(art.label, 512, 240, 920);
      }
      c.textAlign = 'left'; c.fillStyle = HUD.text; c.font = '700 38px system-ui, sans-serif';
      this.text(c, content.title, 350, 2, 46);
      c.fillStyle = HUD.muted; c.font = '30px system-ui, sans-serif';
      this.text(c, detail, 462, 4, 38);
      c.fillStyle = HUD.warm; c.font = '26px system-ui, sans-serif';
      c.fillText(href ? 'Open leaves VR · continues in your browser' : content.sourceKind === 'file' ? 'File reference only · no file bytes stored' : 'Preview · select Close to dismiss', 32, 684, 960);
      this.texture.needsUpdate = true;
    };
    draw();
    if (src) {
      const image = new Image();
      this.image = image;
      // CORS is mandatory for WebGL textures. Keep fallback art on failure.
      image.crossOrigin = 'anonymous'; image.referrerPolicy = 'no-referrer';
      image.onload = () => draw(image);
      image.onerror = () => draw();
      image.src = src;
    }
  }

  private text(c: CanvasRenderingContext2D, value: string, y: number, maxLines: number, lineHeight: number): void {
    const lines: string[] = [];
    let line = '';
    // Prefer whole words, splitting only oversized tokens such as URLs.
    for (const word of value.split(/(\s+)/)) {
      if (word.includes('\n')) { lines.push(line.trimEnd()); line = ''; continue; }
      if (line && c.measureText(line + word).width > 960) {
        lines.push(line.trimEnd()); line = '';
      }
      if (!line && /^\s+$/.test(word)) continue;
      for (const char of word) {
        if (c.measureText(line + char).width > 960) { lines.push(line); line = ''; }
        line += char;
      }
    }
    lines.push(line.trimEnd());
    lines.slice(0, maxLines).forEach((text, i) => {
      if (i === maxLines - 1 && lines.length > maxLines) text = text.slice(0, -2) + '…';
      c.fillText(text, 32, y + i * lineHeight, 960);
    });
  }

  dispose(): void {
    this.disposed = true;
    if (this.image) { this.image.onload = null; this.image.onerror = null; }
    this.texture.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose();
  }
}
