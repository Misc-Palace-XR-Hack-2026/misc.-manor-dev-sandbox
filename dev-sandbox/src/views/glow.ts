import * as THREE from 'three';

// Emissive indicator lights for procedural objects.
//
// Every indicator is a pure function of absolute time driven by the room's existing tick through
// `animateIgnite` (userData.animate). Nothing here allocates per frame, starts a timer, or keeps
// state between frames, so a model frozen at t = 0 under reduced motion looks identical every time
// and removing a group stops its animation immediately.

export type GlowWave = 'steady' | 'sine' | 'blink' | 'flicker';

export interface GlowSpec {
  /** Emissive colour; defaults to the mesh's own colour so indicators keep their palette. */
  color?: number;
  /** Emissive intensity at the dim end of the cycle. */
  base: number;
  /** How much the intensity swings above `base`. */
  amp?: number;
  /** Cycles per second (radians/sec = speed * 2π). */
  speed?: number;
  /** Phase offset in cycles (0..1), used to chase a row or ring of lights. */
  phase?: number;
  wave?: GlowWave;
}

/** Unit wave in [0,1], pure in `t`. `blink` is a sharpened pulse; `flicker` is two detuned sines. */
export function glowWave(wave: GlowWave, t: number, speed: number, phase: number): number {
  if (wave === 'steady') return 1;
  const x = (t * speed + phase) * Math.PI * 2;
  if (wave === 'sine') return 0.5 + 0.5 * Math.sin(x);
  if (wave === 'blink') {
    const s = 0.5 + 0.5 * Math.sin(x);
    return s * s * s; // most of the cycle dark, a short bright beat
  }
  return 0.62 + 0.26 * Math.sin(x) + 0.12 * Math.sin(x * 2.37 + 1.1);
}

/** Make `m` an emissive indicator that animates off the room tick. Returns the same mesh. */
export function glowIndicator<T extends THREE.Mesh>(m: T, spec: GlowSpec): T {
  const material = m.material as THREE.MeshStandardMaterial;
  const color = spec.color ?? material.color.getHex();
  material.emissive.setHex(color);
  const base = spec.base;
  const amp = spec.amp ?? 0;
  const speed = spec.speed ?? 0.5;
  const phase = spec.phase ?? 0;
  const wave = spec.wave ?? (amp > 0 ? 'sine' : 'steady');
  const apply = (t: number) => {
    material.emissiveIntensity = base + amp * glowWave(wave, t, speed, phase);
  };
  apply(0);
  if (amp > 0) m.userData.animate = apply;
  return m;
}

/**
 * A real local light that joins the EXISTING lamp light budget (`applyLampLightBudget` keeps only
 * the first LAMP_LIGHT.maxCount lights named `lamp-light` lit). `baseIntensity` lets a moodier
 * source be dimmer than a table lamp without escaping the cap, and `lit` is the budget's verdict,
 * which any per-frame pulse must respect.
 */
export function budgetedLight(color: number, intensity: number, distance: number): THREE.PointLight {
  const light = new THREE.PointLight(color, intensity, distance, 2);
  light.name = 'lamp-light';
  light.castShadow = false;
  light.userData.baseIntensity = intensity;
  light.userData.lit = true;
  return light;
}

/** Pulse a budgeted light without ever overriding the budget's decision to switch it off. */
export function pulseBudgetedLight(light: THREE.PointLight, spec: GlowSpec): void {
  const base = spec.base;
  const amp = spec.amp ?? 0;
  const speed = spec.speed ?? 0.3;
  const phase = spec.phase ?? 0;
  const wave = spec.wave ?? 'sine';
  light.userData.animate = (t: number) => {
    light.intensity = light.userData.lit === false ? 0 : base + amp * glowWave(wave, t, speed, phase);
  };
}

/**
 * Kinds whose real-world counterpart has indicator lights, so they animate a glow. Kinds without
 * lights on the real object (dice, cactus, skateboard, telescope, a bare cartridge...) are left alone.
 */
export const GLOWING_KINDS = [
  'flyingSaucer', 'lavaLamp', 'tv', 'console', 'boombox', 'synthesizer', 'robot', 'coffeeMaker', 'lantern',
] as const;
