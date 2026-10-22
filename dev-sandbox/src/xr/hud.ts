/** Neutral smoke glass with real CanvasTexture alpha; no simulated backdrop blur.
 * Keep text opaque: fading a whole Three material would fade the labels as well.
 * Canvas uploads only happen when content/state changes. */
export const HUD = {
  base: 'rgba(18, 20, 24, 0.38)', inset: 'rgba(18, 20, 24, 0.30)',
  surface: 'rgba(18, 20, 24, 0.50)', hover: 'rgba(18, 20, 24, 0.62)',
  rim: 'rgba(255, 255, 255, 0.30)', mint: '#d7e6ef', warm: '#f0dfba',
  text: '#ffffff', muted: '#e2e5eb', danger: '#ffd2c9',
} as const;

export function hudRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number, color: string): void {
  // Reset text-only shadow before painting a surface; never bake a dark slab underneath glass.
  c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
  c.fillStyle = color;
  if (typeof c.roundRect === 'function') {
    c.beginPath(); c.roundRect(x, y, w, h, radius); c.fill();
  } else c.fillRect(x, y, w, h); // minimal canvas implementations used by unit tests
}

/** Stroke only: filled nested rims accidentally accumulate alpha across the whole panel. */
function rim(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string): void {
  if (typeof c.stroke !== 'function' || typeof c.roundRect !== 'function') return;
  c.beginPath(); c.roundRect(x, y, w, h, r);
  c.strokeStyle = color; c.lineWidth = 1.5; c.stroke();
}

export function hudPanel(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.clearRect?.(0, 0, w, h);
  hudRect(c, 3, 3, w - 6, h - 6, 30, HUD.base);
  rim(c, 3, 3, w - 6, h - 6, 30, HUD.rim);
  // A faint inner bevel, never another full-area opaque substrate.
  rim(c, 9, 9, w - 18, h - 18, 25, 'rgba(255, 255, 255, 0.09)');
  hudRect(c, 48, 20, Math.min(64, w / 8), 2, 1, 'rgba(255, 255, 255, 0.65)');
  c.shadowColor = 'rgba(0, 0, 0, 0.95)'; c.shadowBlur = 4; c.shadowOffsetY = 2;
}

export function hudButton(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  state: { hover?: boolean; selected?: boolean; primary?: boolean; muted?: boolean; danger?: boolean; floating?: boolean } = {}): void {
  const accent = state.danger ? HUD.danger : state.selected ? HUD.warm : HUD.mint;
  const radius = Math.min(14, h / 3);
  hudRect(c, x, y, w, h, radius, state.hover ? HUD.hover : state.floating ? 'rgba(18, 20, 24, 0.70)' : HUD.surface);
  rim(c, x + 1, y + 1, w - 2, h - 2, radius, state.hover || state.selected ? 'rgba(255, 255, 255, 0.78)' : HUD.rim);
  if (state.primary || state.selected) hudRect(c, x + 7, y + 14, 3, h - 28, 1.5, accent);
  c.fillStyle = HUD.text;
}
