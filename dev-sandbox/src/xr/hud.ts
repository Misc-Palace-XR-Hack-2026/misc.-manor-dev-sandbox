/** Shared canvas skin: opaque reading surfaces, fine double rims and quiet game-HUD accents.
 * No animation loop or external fonts: canvas uploads only happen when content/state changes. */
export const HUD = {
  base: '#0b2028', inset: '#102e37', surface: '#173e47', hover: '#245c61',
  rim: '#426b70', mint: '#83f5ce', warm: '#f7c785', text: '#effcf7', muted: '#b4d0d0',
  danger: '#ffb5a5',
} as const;

export function hudRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number, color: string): void {
  c.fillStyle = color;
  if (typeof c.roundRect === 'function') {
    c.beginPath(); c.roundRect(x, y, w, h, radius); c.fill();
  } else c.fillRect(x, y, w, h); // minimal canvas implementations used by unit tests
}

export function hudPanel(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.clearRect?.(0, 0, w, h);
  hudRect(c, 2, 2, w - 4, h - 4, 32, HUD.rim);
  hudRect(c, 4, 4, w - 8, h - 8, 30, HUD.base);
  hudRect(c, 14, 14, w - 28, h - 28, 22, HUD.inset);
  hudRect(c, 16, 16, w - 32, h - 32, 20, HUD.base);
  hudRect(c, 40, 20, Math.min(120, w / 4), 4, 2, HUD.mint);
}

export function hudButton(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  state: { hover?: boolean; selected?: boolean; primary?: boolean; muted?: boolean; danger?: boolean } = {}): void {
  const accent = state.danger ? HUD.danger : state.selected ? HUD.warm : HUD.mint;
  hudRect(c, x, y, w, h, Math.min(18, h / 3), state.hover || state.selected || state.primary ? accent : HUD.rim);
  hudRect(c, x + 2, y + 2, w - 4, h - 4, Math.min(16, h / 3 - 2), state.hover ? HUD.hover : state.muted ? HUD.inset : HUD.surface);
  if (state.primary || state.selected) hudRect(c, x + 7, y + 12, 4, h - 24, 2, accent);
  c.fillStyle = HUD.text;
}
