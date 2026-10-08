// Preset values adapted verbatim from DataMemoryPalace/src/xr/study.js.
export const LIGHTING_PRESETS = {
  daylight: { label: 'Crisp daylight (Midday)', category: 'natural', color: '#fff4e6', sunColor: 0xfff4e6, sunIntensity: 1.65, hemiSky: 0xfff8ee, hemiGround: 0x9b8f76, hemiIntensity: 1.5, lampColor: 0xffd8a8, lampIntensity: 0.55 },
  dawn: { label: 'Warm dawn (Golden hour)', category: 'natural', color: '#ffd199', sunColor: 0xffc580, sunIntensity: 1.75, hemiSky: 0xffe4c2, hemiGround: 0x8a6f52, hemiIntensity: 1.4, lampColor: 0xffbb6e, lampIntensity: 0.65 },
  sunset: { label: 'Sunset amber (Dusk)', category: 'natural', color: '#ff9d5c', sunColor: 0xff8940, sunIntensity: 1.8, hemiSky: 0xffb885, hemiGround: 0x6e3c28, hemiIntensity: 1.35, lampColor: 0xff9944, lampIntensity: 0.7 },
  candlelight: { label: 'Candlelight & fireside (Intimate warm)', category: 'natural', color: '#ffb454', sunColor: 0xffa034, sunIntensity: 0.95, hemiSky: 0xffd18a, hemiGround: 0x523018, hemiIntensity: 1.1, lampColor: 0xff9a30, lampIntensity: 0.85 },
  overcast: { label: 'Soft overcast (Diffused cool)', category: 'natural', color: '#d8e2ec', sunColor: 0xd0e0ed, sunIntensity: 1.3, hemiSky: 0xe2ecf5, hemiGround: 0x7a838a, hemiIntensity: 1.6, lampColor: 0xf0e6d2, lampIntensity: 0.5 },
  cyber: { label: 'Cyber neon (Electric cyan & magenta)', category: 'mood', color: '#00f0ff', sunColor: 0x00f0ff, sunIntensity: 1.75, hemiSky: 0xd02670, hemiGround: 0x0f2838, hemiIntensity: 1.5, lampColor: 0xff007f, lampIntensity: 0.8 },
  twilight: { label: 'Moody twilight & violet (Indigo)', category: 'mood', color: '#8c7dff', sunColor: 0x7b6cf0, sunIntensity: 1.3, hemiSky: 0x4a3a8a, hemiGround: 0x181433, hemiIntensity: 1.4, lampColor: 0xb594ff, lampIntensity: 0.7 },
  emerald: { label: 'Emerald conservatory (Lush forest)', category: 'mood', color: '#52e396', sunColor: 0x42d686, sunIntensity: 1.6, hemiSky: 0x82f0b8, hemiGround: 0x1a3828, hemiIntensity: 1.45, lampColor: 0x70ebb3, lampIntensity: 0.65 },
  ember: { label: 'Crimson ember (Cinematic warm)', category: 'mood', color: '#ff4d4d', sunColor: 0xff4040, sunIntensity: 1.65, hemiSky: 0xff8585, hemiGround: 0x3d1010, hemiIntensity: 1.35, lampColor: 0xff6644, lampIntensity: 0.75 },
  vaporwave: { label: 'Vaporwave pastel (Lavender & peach)', category: 'mood', color: '#e599f7', sunColor: 0xff9ec2, sunIntensity: 1.55, hemiSky: 0xdda0f8, hemiGround: 0x422452, hemiIntensity: 1.45, lampColor: 0xfcb0c7, lampIntensity: 0.7 },
};
export type Lighting = keyof typeof LIGHTING_PRESETS;
export function validLighting(value: unknown): value is Lighting {
  return typeof value === 'string' && Object.hasOwn(LIGHTING_PRESETS, value);
}

/** Drop the retired loft/study theme split. Keep lighting if the old field was valid. */
export function lightingFromUnknown(input: unknown): Lighting | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as { lighting?: unknown; appearance?: { lighting?: unknown } };
  const candidate = raw.lighting ?? raw.appearance?.lighting;
  return validLighting(candidate) ? candidate : undefined;
}
