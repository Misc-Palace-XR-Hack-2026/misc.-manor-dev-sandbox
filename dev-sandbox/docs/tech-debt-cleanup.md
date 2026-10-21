# Tech Debt and Cleanup Plan

App-wide review of the sandbox, the public demo (`/`, `/intro`), `/dev/` and `/about/`. Trailer scenes are mostly done, so this ignores them and focuses on the code.

Sizes: **S** under an hour, **M** a few hours, **L** a day or more.
Every number below was measured (build output, `wc`, `esbuild`) or read from the code. Anything marked *suspected* was not confirmed. Nothing was profiled in a browser.

## 1. What we want vs. what we need

| Area | Want (the product) | Need now | Verdict |
|------|--------------------|----------|---------|
| Data model (ContentItem / Representation / Placement, schemaVersion) | Stable, exportable rooms | Yes, it's the part that must not break | **Keep. Protect it.** |
| Public demo + intro | The thing visitors see | Fast first load, no dev UI | **Keep. Slim the first load (section 3).** |
| `/dev/` sandbox with five named rooms | A place for the team to tinker | Yes, but as a dev tool, not shipped weight | **Keep. Don't let it grow.** |
| VR (`src/xr`, ~1,350 lines) | Real VR ending, Quest plan | Most visitors never enter VR | **Keep. Load it only when VR is entered.** |
| 28 procedural object kinds in 5 files | A cozy, varied room | Adding a kind should be one edit | **Keep the kinds. Add a registry, share the mesh helpers.** |
| Music that follows lighting (11 tracks) | Mood per lighting preset | 40 MB of MP3s in the repo and deploy | **Keep the feature. Shrink the files.** |
| 8 `rooms/*.json` | Starter content | 4 seed 4 dev rooms, `levi`/`matt` override two of those, 2 are menu-only imports | **Prune or document.** |
| Legacy single-room save keys and the loft/study migration | Don't lose old saves | Only if such saves still exist | **Drop after one last migration.** |
| Many `docs/` plans, research JSON, superseded drafts | Context | Mostly history | **Archive.** |
| Per-frame render loop, material pooling, scene diffing | Smooth rooms | Rooms hold about 30 slots. Diffing already exists. | **Don't build more. See "checked, not a problem".** |

## 2. Do first (cheap, real, low risk)

1. **Delete dead code (S).** `lightingKeys()` in `src/core/soundtrack.ts:72` and `nearestLanding()` in `src/xr/interaction.ts:114` are referenced nowhere, not even in tests.
2. **Test-only XR helpers (S to M).** `landingAt`, `teleportOffset`, `snapTurnOffset`, `objectHitFrom`, `destinationHitFrom`, `dedicatedRooms`, `objectMenuHit` and `XR_LANDINGS` in `src/xr/interaction.ts` are exported and tested but never called from `src/`. `session.ts` has its own `teleport` and landing logic. *Suspected* duplicate implementations. Either make `session.ts` call them, or delete them with their tests. Right now the tests prove code the headset never runs.
3. **`window.matchMedia(...)` every frame** in `RoomView.tick` (`src/views/room.ts:377`). Read it once and listen for `change`. (S)
4. **Stringifying images on every store change.** `sync()` builds `JSON.stringify([content.title, content.imageData])` per object (`room.ts:335`), and sync runs on every store event, including selection. With photo frames (up to 1.5 MB base64 each) that's megabytes of string work per click. Key on `content.id` plus a cheap revision or `imageData.length`. Also `store.slotOf` and `layout.slots.find` make `sync` O(reps x slots). A `Map<slotId, slot>` fixes it. (S)
5. **Magic numbers in `tick`.** `1.6` (object scale) and `1.25` are repeated inline with comments saying they mirror a constant. The selection pull/push/boost math is about 40 lines inline. Extract `OBJECT_SCALE` and a `selectionOffset()` function. It would also be unit-testable. (S)
6. **Shared mesh helpers.** `box/cyl/rod` in `objects.ts`, `part/block/cylinder/disc` in `cozy-objects.ts`, `mesh/block/rod` in `study-decor.ts` do the same job. One `mesh-builders.ts`. (S)
7. **Stale references.** `src/audio/README.md` documents files that live in `public/audio/`. `src/core/layout.ts:4` points at `pitch-off-materials/...`, which isn't in this repo. `PROVENANCE.md` cites `/home/dvgpro/...` paths. Fix or move them. (S)
8. **Archive docs.** Move `matt-research*.json`, `web-preview-checks.json` and `marketing-video-plan.previous-direct-concept.md` into `docs/archive/`. Update root `plan.md` (it still says "No WebXR" and lists Daniel). (S)

## 3. Load size (the biggest user-visible win)

Measured from `vite build`:

| Chunk | Size | gzip | Notes |
|-------|------|------|-------|
| `room-*.js` | 705 kB | 189 kB | three.js, `RoomView`, objects, XR. Loaded by the demo. Triggers the 500 kB warning. |
| `tutorial-*.js` | 69 kB | 18 kB | Demo and sandbox UI |
| `public/audio/*.mp3` | ~40 MB (11 files, 3.4 to 3.9 MB each) | | Copied into `dist` too |

- **Lazy-load XR (M).** `room.ts` statically imports `XrSession` and `../xr/interaction`. The XR session bundle alone is about 57 kB minified (19 kB gzip), measured with `esbuild`. Move to `import()` inside the Enter VR path. `canEnterVr` and `enterReason` are pure helpers that can stay in a small module that doesn't pull in the session.
- **Name a three.js vendor chunk (S).** `build.rollupOptions.output.manualChunks` for `three`. Our own code then changes without busting the 600 kB cache. It also gives an honest size to budget against. Add `chunkSizeWarningLimit` once that's done so the warning means something.
- **Measure before cutting three.js (S).** Run a bundle visualiser once. Most of the 705 kB is three.js itself, and we only know that by size, not by breakdown.
- **Re-encode the audio (M).** 3.6 MB per track is roughly 128 to 192 kbps for a long loop. At about 96 kbps mono/joint stereo that's roughly a third of the size. Audio is already lazy (`preload = 'none'`, source set on play), so visitors only download the tracks they hear. The cost is deploy size and a 110 MB git pack (all 11 tracks are committed). If the repo size matters, move them out of git (LFS or a bucket) and keep `/audio/<id>.mp3` as the URL.
- **Keep the sandbox UI out of the demo.** Already true: the edit tools load via `import('./room-app')`. Add a size budget check to `npm run build` so it stays true.

## 4. Memory and storage

- **Undo history holds whole-room JSON snapshots, 60 deep** (`store.ts:596`, `MAX_HISTORY = 60`), including `imageData`. Worst case is 60 x (room with several 1.5 MB photos), which is tens of MB of strings. Fix (M): keep images out of snapshots (store them in a side table keyed by id and snapshot only the key), or cap history by bytes rather than count.
- **Each edit stringifies the room twice**: once for history, once for `save()` (`store.ts:597`, `:623`). `save()` also copies the previous save to `:backup` first, so localStorage holds two copies of every room and its photos. Against a ~5 MB quota that halves the photo budget. Fixes (M): debounce `save()` (about 300 ms, flush on `pagehide`), and only back up when the schema or content count changes, or drop the rolling backup now that unreadable saves are quarantined.
- **localStorage is the ceiling.** Photos inside the room JSON will hit 5 MB. The plan is already IndexedDB (`docs/standards.md` open decisions, `feature-plans/01-file-storage-and-sharing.md`). Until then, show the `saveError` visibly instead of only keeping it in state. (S now, L later)
- **Quarantine copies pile up** (`mp-sandbox:rooms:<id>:unreadable-<ts>`) and each is a full room. Add a cleanup or a "recovered copies" list. (S)
- **Unreadable-save recovery matches an error message with a regex** in `menu.ts` `switchTo` (`/could not be loaded/i`). Throw a typed `SavedRoomUnreadableError` from `Store.loadSaved`. (S)
- **Storage namespace is inferred from a string prefix** (`roomId?.startsWith('demo-')` in `roomKeys()`). Pass an explicit namespace into `Store`. (M)
- **Legacy keys and migrations** (`mp-sandbox:room`, `:backup`, loft/study theme migration in `validateRoom`). Ship one last migration, then delete the read paths and the tests that exist only for them (`rooms.test.ts`, `appearance.test.ts`, `surfaces.test.ts`, `furniture-kinds.test.ts`). (M)
- **`localStorage` is accessed directly in five places**, with `try/catch` only in `src/demo/main.ts`. Blocked storage (private mode, some embeds) throws elsewhere. Put one `safeStorage` helper in front. (S)

## 5. Structure

- **No object-kind registry (M).** A kind's label is in `core/types.ts`, glyph in `views/kind-thumbnail.ts`, placement rule in `core/placement.ts`, builder in one of five view files. Adding a kind touches 4 to 6 places. One `kindRegistry` (`label`, `glyph`, `builder`, `placement`) with the existing `kind-inventory` and `kind-thumbnails` tests asserting every kind is complete.
- **Big files.** `room.ts` (645), `store.ts` (629), `menu.ts` (572), `objects.ts` (495), `xr/interaction.ts` (473). Cut lines to follow:
  - `store.ts`: persistence (keys, load, save, quarantine) vs. commands.
  - `room.ts`: preview-card docking and follow loop (`followSheet`, `updatePreviewCard`) vs. scene sync.
  - `menu.ts`: room switcher, add/import sheet, appearance sheet. It also rebuilds its whole list with `replaceChildren` on every store event (`menu.ts:467`). That's fine at this size, but don't grow it.
- **`DemoHooks` threaded through `RoomView`** (`this.demo?.` in about ten places). Replace with a camera/slot-policy object that has a sandbox default, so `RoomView` has no demo branches. (M)
- **Wiring through globals and events.** `window.tutorial` is set in `room-app.ts`. The tutorial and menu talk via a `palace-tutorial` `CustomEvent` on `document`. Use an injected controller or typed emitter. (M)
- **`MenuView` is reused wholesale in the demo** (`TODO(demo)` in `room-app.ts`). Decide: curated demo menu, or hide the dev-only controls. (L, or S for hiding)
- **Typed errors and `Window`** (S). A handful of `as unknown as` casts, mostly `window.tutorial`.

## 6. Tests

- 47 test files; `npm test` bundles each with esbuild and runs them under `node --test`. The 12 `browser-*.mjs` / `*.browser.mjs` scripts are **not** part of `npm test` and need Playwright and a Chromium path. Decide which (smoke, onboarding, lofi) are worth running in CI and delete the rest. Several repeat the same launch and `getByPlaceholder('Title (optional)')` steps. (M)
- Add `data-testid`s so copy edits don't break browser tests. (S)
- Move the `localStorage` mock (rebuilt in 4+ test files) into `tests/fixtures/`. (S)
- No DOM-level test for `PreviewCardView` (the class collision bug only showed in a browser) and none for `MenuView.switchTo` recovery. (S each)
- Test-only code: see section 2, item 2.

## 7. Data and content

- `rooms/` has 8 files. Which one wins is hidden in `seedRoom` (`rooms/<id>.json`, else the seed repo room). `curious-web.json` and `greenhouse-conservatory.json` seed no room (they're menu-only imports and theme names). `levi.json` and `matt.json` override `creative-atelier` and `vinyl-lounge`. Write the rule into `docs/standards.md`, or collapse so each dev room has one file.
- German's room still seeds from `sample`. Commit `rooms/german.json`, then restore the seed. Reproduce the original load failure first using the quarantined copy. (S)
- `about/index.html` still has five `TODO` paragraphs. Write them or hide the sections before linking it. (S)

## 8. Checked, not a problem (don't spend time here)

These came up in a first-pass review and did not hold up against the code:

- **"Scene rebuilds every object on every change."** False. `sync()` reuses an object unless its kind or content key changed (`room.ts:336-342`), and removes only those no longer placed. Only the key computation is wasteful (section 2, item 4).
- **"Per-frame allocation storm."** Only the one selected object allocates a few vectors per frame (`room.ts:396-432`). Not worth pooling.
- **"Render loop runs in hidden tabs."** `setAnimationLoop` uses `requestAnimationFrame`, which browsers already pause in background tabs. On-demand rendering isn't worth it: the selected-object bob, marker pulse and ignite animations all need frames.
- **"All audio loads eagerly."** No. `preload = 'none'` and the source is set on play (`soundtrack.ts:123`, `:97`). The cost is repo and deploy size, not page load.
- **"Soundtrack listeners accumulate."** There is one `SoundtrackPlayer` per page (`main.ts:56`, `room-app.ts:26`). Not a leak today. Only matters if it is ever created per room.
- **Material and geometry pooling in `objects.ts`.** True that each object builds its own, but rooms hold about 30 slots and `disposeGroup` frees them. Revisit only if rooms get much larger or the Quest frame rate drops.

## 9. Suggested order

1. **One sitting (section 2):** dead code, `matchMedia`, content key, shared mesh helpers, stale references, archive docs.
2. **Load and weight (section 3):** lazy XR, vendor chunk, re-encode audio.
3. **Safety (section 4):** debounce and slim `save()`, history without images, typed unreadable-save error, `safeStorage`, visible `saveError`.
4. **Real German room and about copy (section 7).**
5. **Structure (section 5):** kind registry, split `store.ts` and `room.ts`, replace demo hooks.
6. **Later:** IndexedDB for photos, drop legacy keys, curated demo menu, CI browser tests.
