# Matt seed item refresh

Scoped to `rooms/matt.json`; no model code, schema, soundtrack, SFX, pipe, or save migration changes.

| Content ID (representation ID is `matt-object-…`) | Before → after | Slot before → after |
|---|---|---|
| matt-lamp | lamp → lamp; note content → URL link, `notes: "I love lamp"` | floor-2 unchanged (Floor, back middle) |
| matt-youtube-3 | headphones → lavaLamp | block-2 unchanged (Loft shelf, right) |
| matt-apollo | notebook → flyingSaucer | bench-1 unchanged (Bench, left) |
| matt-solar-book | book → telescope | bench-2 unchanged (Bench, middle) |
| matt-os | box → fireplace | floor-front-loft-2 → floor-front-loft-1 |
| matt-cyber-funk | turntable unchanged | floor-front-loft-1 → floor-front-loft-2 |

`floor-front-loft-1` is “Floor, under the loft (back)”; `floor-front-loft-2` is “Floor, under the loft”. Baseline has exactly one box and one turntable, and no fireplace, so the requested new fireplace/record-table swap is unambiguous. Apollo's website is https://apolloslearningcorner.com, not the unchanged `/Games/` arcade; the solar book is https://amzn.to/3Snypsv. All non-lamp content (including original notes), IDs, metadata, and other placements are preserved exactly.

## Clip provenance

https://www.youtube.com/watch?v=Ld35lMnFQ10 — **I love lamp - Anchorman**, uploader **Small Words / Small Worlds**. Search returned the actual scene transcript (“I love carpet… I love desk… I love lamp”); YouTube's public oEmbed endpoint returned HTTP success, matching title and an official player iframe. This is not claimed to be a studio-official upload. The existing provider pipeline produces `https://www.youtube-nocookie.com/embed/Ld35lMnFQ10`; no direct video extraction or new embed implementation was added. The existing title “Neon lamp”, identity, tags and creation time remain unchanged. The existing `notes` string is exactly `I love lamp`.

Browser verifies correct player URL and external-open fallback, not successful video playback: the captured player was blank/loading. Playback availability can vary with YouTube/network policy. Other website frames can emit existing sandbox localStorage errors; their sandbox has not been weakened.

## Save policy

Fresh Matt rooms receive this seed. Existing saved Matt rooms **do not update automatically**: `Store.loadSaved` wins over `seedRoom`; regression coverage confirms custom Matt and unrelated Guest saves survive. No personal save was modified. To intentionally replace an existing room, export it first, then use **Load repo room → matt** (an explicit replacement, not a merge). A fresh private context is the safe non-destructive preview.

## Verification

- Two sequential RED→GREEN slices: exact kind/slot/unchanged-content comparison, then exact lamp content and official embed resolution.
- `npm test`: 268 passed, 0 failed, including existing save priority and every-item pickup/place/undo/roundtrip.
- `npm run typecheck` and `npm run build`: passed; existing >500 kB bundle warning remains.
- `node tests/browser-matt-refresh.mjs`: 12 mappings at 1440×1000 and 390×844, using isolated Chromium contexts and the actual room UI; Notes and URL fields read through Edit then Cancel, no user saves touched. No first-party page errors; third-party sandbox exceptions logged separately.
- Screenshots visually inspected: `/home/dvgpro/.hermes/cache/scratch/matt-refresh-artifacts/` (desktop/mobile room, six selected objects and their edit dialogs, `checks.json`, contact sheet). UFO/telescope appear on the right bench; lava lamp on loft shelf; fireplace/turntable under loft, partially occluded from default camera.
- Local-only server used port 5298 after strict-port startup rejected occupied 5197. No existing server was stopped or changed.
- Base: fetched origin/main `1b02ba0384cf66950d23dd0a8217d583a8713fdc`. Configured origin uses `misc.-palace-dev-sandbox`; requested `misc.-manor-dev-sandbox` URL resolves to the same main SHA (verified with ls-remote). No remote writes.
