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
    surfaces: { floor: { preset: SURFACE_LOOKS.daylight.floor.id }, wall: { preset: SURFACE_LOOKS.daylight.wall.id }, background: { preset: SURFACE_LOOKS.daylight.background.id } },
    lighting: 'daylight',
  },
  'garden-notebook': {
    label: 'Garden notebook',
    surfaces: { floor: { preset: SURFACE_LOOKS.dawn.floor.id }, wall: { preset: SURFACE_LOOKS.dawn.wall.id }, background: { preset: SURFACE_LOOKS.dawn.background.id } },
    lighting: 'dawn',
  },
  'greenhouse-conservatory': {
    label: 'Greenhouse conservatory',
    surfaces: { floor: { preset: SURFACE_LOOKS.emerald.floor.id }, wall: { preset: SURFACE_LOOKS.emerald.wall.id }, background: { preset: SURFACE_LOOKS.emerald.background.id } },
    lighting: 'emerald',
  },
  'creative-atelier': {
    label: 'Creative atelier',
    surfaces: { floor: { preset: SURFACE_LOOKS.sunset.floor.id }, wall: { preset: SURFACE_LOOKS.sunset.wall.id }, background: { preset: SURFACE_LOOKS.sunset.background.id } },
    lighting: 'sunset',
  },
  'vinyl-lounge': {
    label: 'Vinyl lounge',
    surfaces: { floor: { preset: SURFACE_LOOKS.twilight.floor.id }, wall: { preset: SURFACE_LOOKS.twilight.wall.id }, background: { preset: SURFACE_LOOKS.twilight.background.id } },
    lighting: 'twilight',
  },
  ...Object.fromEntries(Object.entries(SURFACE_LOOKS).map(([lighting, look]) => [`look-${lighting}`, {
    label: look.label,
    lighting: lighting as Lighting,
    surfaces: {floor:{preset:look.floor.id},wall:{preset:look.wall.id},background:{preset:look.background.id}},
  }])),
};
