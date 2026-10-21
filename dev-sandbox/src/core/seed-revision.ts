// A short, stable fingerprint of a committed room seed (rooms/*.json).
//
// Saved showcase rooms record the revision they were seeded from. When the committed JSON changes the
// fingerprint changes with it, which is how a returning visitor's stale save is spotted and refreshed.
// Nothing here depends on the build, the clock or key order, so the same JSON always fingerprints the same.

/** JSON with object keys in a fixed order, so `{a,b}` and `{b,a}` fingerprint alike. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** FNV-1a, 32-bit. Small, dependency-free, and plenty to tell one committed seed from the next. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Fingerprint of a room seed: `r1-<hash>-<length>`. The `r1-` prefix leaves room for a different
 * scheme later without mistaking old stamps for new ones.
 */
export function seedRevision(seed: unknown): string {
  const text = canonicalJson(seed);
  return `r1-${fnv1a(text).toString(16).padStart(8, '0')}-${text.length.toString(36)}`;
}
