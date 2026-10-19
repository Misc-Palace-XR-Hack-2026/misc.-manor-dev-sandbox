// Fixtures are room add-ons: built-in pieces of the room (a fireplace) that are not objects in slots.
// They have no content item, no icon and no slot; they are just placed in the room and saved with it.

export const FIXTURE_KINDS = ['fireplace', 'loungeChair', 'avatar', 'neighborhood'] as const;
export type FixtureKind = (typeof FIXTURE_KINDS)[number];

export interface Fixture {
  id: string;
  kind: FixtureKind;
  /** World position of the fixture's back-center at floor level (layout units, meters). */
  pos: [number, number, number];
  /** Rotation about Y in radians. 0 = front faces +z (against the right/back wall, z = 0). */
  rotationY: number;
}

/** Where the fireplace stands by default: flat against the right wall, between its window mullions. */
export const FIREPLACE_DEFAULT_POS: [number, number, number] = [4.4, 0, 0];
/** Range the Scenes "position" slider moves the fireplace along the right wall. */
export const FIREPLACE_X_RANGE = { min: 1.4, max: 9.0 } as const;

export function newFireplace(): Fixture {
  return { id: 'fireplace', kind: 'fireplace', pos: [...FIREPLACE_DEFAULT_POS], rotationY: 0 };
}

/** Lounge set: a reclined chair with a headphone-wearing avatar in it. Both face the default camera. */
export const LOUNGE_DEFAULT_POS: [number, number, number] = [5.0, 0, 3.4];
export const LOUNGE_DEFAULT_ROTATION = Math.PI / 4;

export function newLoungeChair(): Fixture {
  return { id: 'lounge-chair', kind: 'loungeChair', pos: [...LOUNGE_DEFAULT_POS], rotationY: LOUNGE_DEFAULT_ROTATION };
}

export function newAvatar(): Fixture {
  return { id: 'avatar', kind: 'avatar', pos: [...LOUNGE_DEFAULT_POS], rotationY: LOUNGE_DEFAULT_ROTATION };
}

/** The neighborhood diorama is centered on the room (its position is the room's floor center). */
export const NEIGHBORHOOD_CENTER: [number, number, number] = [5.15, 0, 3.65];

export function newNeighborhood(): Fixture {
  return { id: 'neighborhood', kind: 'neighborhood', pos: [...NEIGHBORHOOD_CENTER], rotationY: 0 };
}

export function validFixtures(value: unknown): value is Fixture[] {
  if (!Array.isArray(value) || value.length > 8) return false;
  const ids = new Set<string>();
  for (const f of value as Partial<Fixture>[]) {
    if (!f || typeof f !== 'object') return false;
    if (typeof f.id !== 'string' || !f.id.trim() || ids.has(f.id)) return false;
    if (!(FIXTURE_KINDS as readonly string[]).includes(String(f.kind))) return false;
    if (!Array.isArray(f.pos) || f.pos.length !== 3 || f.pos.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return false;
    if (typeof f.rotationY !== 'number' || !Number.isFinite(f.rotationY)) return false;
    ids.add(f.id);
  }
  return true;
}

export function cloneFixtures(fixtures: Fixture[] | undefined): Fixture[] | undefined {
  return fixtures ? (JSON.parse(JSON.stringify(fixtures)) as Fixture[]) : undefined;
}
