import { validPhotoData } from './photos';

export const SURFACE_PRESETS = {
 floor: {wood:'Warm wood',stone:'Slate stone',tile:'Cream tile'},
 wall: {plaster:'Soft plaster',brick:'Terracotta brick',wood:'Wood paneling'},
 background: {neutral:'Neutral studio',sky:'Blue sky',gradient:'Dusk gradient'},
} as const;
export type SurfaceTarget = keyof typeof SURFACE_PRESETS;
export interface SurfaceSelection { preset: string; imageData?: string }
export type SurfaceSettings = Partial<Record<SurfaceTarget, SurfaceSelection>>;
export function validSurface(target: SurfaceTarget, value: unknown): value is SurfaceSelection {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
 const s = value as SurfaceSelection;
 if (s.preset === 'custom') return validPhotoData(s.imageData);
 return typeof s.preset === 'string' && Object.hasOwn(SURFACE_PRESETS[target], s.preset) && s.imageData === undefined;
}
export function validSurfaces(value: unknown): value is SurfaceSettings {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
 return Object.entries(value).every(([target, selection]) => Object.hasOwn(SURFACE_PRESETS,target) && validSurface(target as SurfaceTarget,selection));
}
