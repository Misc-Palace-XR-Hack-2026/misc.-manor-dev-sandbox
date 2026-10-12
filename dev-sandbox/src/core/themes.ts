import type { Lighting } from './appearance';
import type { SurfaceSettings } from './surfaces';
import { SURFACE_LOOKS } from './surface-looks';

// A theme is only a look: floor, wall and background finishes plus lighting. It says nothing about who owns the
// room or what is in it. Applying one is a single undoable edit, and each part can still be changed afterwards.

export interface Theme {
  label: string;
  surfaces: SurfaceSettings;
  lighting?: Lighting;
}

export const THEMES: Record<string, Theme> = {
  // The look a new Guest room starts with: original finishes and original lighting (nothing set).
  default: {
    label: 'Default',
    surfaces: {},
  },
  'curious-web': {
    label: 'Curious web',
    surfaces: { floor: { preset: 'wood' }, wall: { preset: 'plaster' }, background: { preset: 'neutral' } },
    lighting: 'daylight',
  },
  'garden-notebook': {
    label: 'Garden notebook',
    surfaces: { floor: { preset: 'tile' }, wall: { preset: 'plaster' }, background: { preset: 'sky' } },
    lighting: 'dawn',
  },
  'greenhouse-conservatory': {
    label: 'Greenhouse conservatory',
    surfaces: { floor: { preset: 'stone' }, wall: { preset: 'plaster' }, background: { preset: 'sky' } },
    lighting: 'emerald',
  },
  'creative-atelier': {
    label: 'Creative atelier',
    surfaces: { floor: { preset: 'wood' }, wall: { preset: 'brick' }, background: { preset: 'gradient' } },
    lighting: 'sunset',
  },
  'vinyl-lounge': {
    label: 'Vinyl lounge',
    surfaces: { floor: { preset: 'wood' }, wall: { preset: 'wood' }, background: { preset: 'gradient' } },
    lighting: 'twilight',
  },
  ...Object.fromEntries(Object.entries(SURFACE_LOOKS).map(([lighting, look]) => [`look-${lighting}`, {
    label: look.label,
    lighting: lighting as Lighting,
    surfaces: {floor:{preset:look.floor.id},wall:{preset:look.wall.id},background:{preset:look.background.id}},
  }])),
};
