import { OBJECT_LABELS, type ObjectKind } from '../core/types';

const GLYPHS: Record<ObjectKind, string> = {
  book: '📕',
  photoFrame: '🖼️',
  record: '📀',
  tv: '📺',
  boombox: '📻',
  box: '📦',
  plant: '🌿',
  mug: '☕',
  notebook: '📓',
  trophy: '🏆',
  armchair: '🪑',
  sideTable: '🪵',
  turntable: '🎛️',
  rug: '🧶',
  cat: '🐱',
  teapot: '🫖',
  lantern: '🏮',
  headphones: '🎧',
  cassette: '📼',
  cushion: '🟥',
  console: '🎮',
  cartridge: '💾',
  vhs: '📼',
  recordSleeve: '💿',
  spoon: '🥄',
  robot: '🤖',
  telescope: '🔭',
  car: '🚗',
  motorcycle: '🏍️',
};

export function kindThumbnail(kind: ObjectKind): HTMLElement {
  const thumb = document.createElement('span');
  thumb.className = 'kind-thumb';
  thumb.dataset.kind = kind;
  thumb.setAttribute('aria-hidden', 'true');
  thumb.textContent = GLYPHS[kind] ?? OBJECT_LABELS[kind].slice(0, 1);
  return thumb;
}
