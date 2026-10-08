import { LIGHTING_PRESETS, type Lighting } from './appearance';

export const ROOM_TRACKS = [
  'original',
  'daylight', 'dawn', 'sunset', 'candlelight', 'overcast',
  'cyber', 'twilight', 'emerald', 'ember', 'vaporwave',
] as const;
export type RoomTrack = (typeof ROOM_TRACKS)[number];

export const LIGHTING_TRACKS: Record<Lighting, RoomTrack> = {
  daylight: 'daylight',
  dawn: 'dawn',
  sunset: 'sunset',
  candlelight: 'candlelight',
  overcast: 'overcast',
  cyber: 'cyber',
  twilight: 'twilight',
  emerald: 'emerald',
  ember: 'ember',
  vaporwave: 'vaporwave',
};

export const TRACK_LABELS: Record<RoomTrack, string> = {
  original: 'Cozy room trailer',
  daylight: 'Crisp daylight',
  dawn: 'Warm dawn',
  sunset: 'Sunset amber',
  candlelight: 'Candlelight',
  overcast: 'Soft overcast',
  cyber: 'Cyber neon',
  twilight: 'Moody twilight',
  emerald: 'Emerald conservatory',
  ember: 'Crimson ember',
  vaporwave: 'Vaporwave pastel',
};

export type Soundtrack =
  | { mode: 'follow' }
  | { mode: 'off' }
  | { mode: 'track'; track: RoomTrack };

export function validTrack(value: unknown): value is RoomTrack {
  return typeof value === 'string' && (ROOM_TRACKS as readonly string[]).includes(value);
}

export function validSoundtrack(value: unknown): value is Soundtrack {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as { mode?: unknown; track?: unknown };
  if (s.mode === 'follow' || s.mode === 'off') return s.track === undefined;
  return s.mode === 'track' && validTrack(s.track);
}

export function soundtrackFromUnknown(input: unknown): Soundtrack | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const raw = (input as { soundtrack?: unknown }).soundtrack;
  return validSoundtrack(raw) ? raw : undefined;
}

export function currentTrack(state: { lighting?: Lighting; soundtrack?: Soundtrack }): RoomTrack | undefined {
  const soundtrack = state.soundtrack;
  if (!soundtrack || soundtrack.mode === 'follow') {
    return state.lighting ? LIGHTING_TRACKS[state.lighting] : 'original';
  }
  if (soundtrack.mode === 'off') return undefined;
  return soundtrack.track;
}

export function trackUrl(track: RoomTrack): string {
  return `/audio/${track}.mp3`;
}

export function lightingKeys(): Lighting[] {
  return Object.keys(LIGHTING_PRESETS) as Lighting[];
}
