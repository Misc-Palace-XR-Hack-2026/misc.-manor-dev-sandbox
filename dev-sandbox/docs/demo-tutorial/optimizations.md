You are working in `/Users/gungo/Documents/misc-palace/build-docs/dev-sandbox` on branch `feature/demo-pt.2`.

## What this app is

**Misc. Manor** is Three.js + TypeScript. One Vite app, two experiences:

- `/` (the product) — `src/demo/main.ts` → `startDemo` in `src/demo/demo-app.ts`. Door walk-in → unpack 3 starters (seq 1) → portal (seq 2: random drop / add / import) → Edit room, jukebox, free mode. Tactile = first-person walk; Dollhouse = isometric. Same `RoomView` via `DemoHooks`. Saves: `mp-demo:*`.
- `/dev/` (team sandbox) — `src/main.ts`. Orbit camera, named rooms, full editor. Do not change `/dev/` look or behavior unless a shared-core fix is required and you verify `/dev/` still feels the same. Never touch Matt’s `src/xr/*` or `demo-landing-vr-wt`.
- `/about/` — ignore.

Protect: `ContentItem` / `Representation` / `Placement` (`src/core`). `RoomView` (`src/views/room.ts`) is the only 3D adapter. Demo-only behavior goes through `DemoHooks`.

## Constraints

- Only `build-docs/dev-sandbox`.
- Do not commit notes txts in `docs/demo-tutorial/` (including `demo-tutorial-follow-up.txt`).
- Verify: `npm run typecheck`, `npm test`, `npx vite build` (from `dev-sandbox`). No screenshots unless asked.
- No new product features. Don’t break demo feel: pickup, intro, jukebox, camera switch, portal, spring-clean, HUD.
- Testing is the visitor path at `/` first; `/dev/` must not regress.

## Already shipped on this branch (keep working; don’t redo)

Pickup: double-tap to move, object stays on slot, pads only in move mode, clear on place / Esc / camera switch; no swap on second object. Random drop randomizes kinds except spoons stay spoons, skip kinds already in the room. Fly-in: `FLY_IN` delay 0, stagger 0.1, duration 0.85; pose at portal the same frame as `dropIn`; first-drop `portalUsed()` waits a frame. Spring-clean: hold button / Space; while holding, only the hold pill stays; `Store.beginBatch` / `endBatch` so stashes don’t save/undo per object (persist + one undo on release). Portal walk reach `SAVE_POINT_REACH = 6`. Seq-2 return visits; isometric yaw; slate floor; jukebox random track + fade; don’t mute on `window.blur`. Camera Tactile/Dollhouse persisted (`mp-demo:camera`). Help mentions WASD/arrows. Mobile: dev slightly above the HUD, Rooms beside it (not on Edit room). Right-click: OrbitControls no longer steals context menu; walk ignores non-left button. `sync()` contentKey is `id:title:imageData.length` (not full photo stringify). `stash` no longer double-emits.

Not built (don’t start unless asked): fireplace easter egg, turn slider, VR in Camera, import flatten, seq 3 rooms.

## Your job

1. Deep-dive demo + shared core. Treat `docs/tech-debt-cleanup.md` as dated. Re-measure. Skip work already done above.
2. Rank bang-for-buck, low-risk speed / clean / efficiency / crisp rendering wins. Then implement only the top clear ones unless I say otherwise.
3. Make the 3D view as crisp and smooth as we can without cooking phones or changing the look.

### Rendering — what’s in code now (re-check)

`RoomView` (`src/views/room.ts`):

- `WebGLRenderer({ antialias: true })` — no `powerPreference`.
- `setPixelRatio(Math.min(devicePixelRatio, 2))` — Retina capped at 2.
- No `outputColorSpace` / `toneMapping` / `toneMappingExposure` set.
- Shadows: `PCFShadowMap`, sun 2048², bias `-0.0004`, `normalBias` 0.03.
- `setSize(w,h)` on resize; CSS `#room canvas { width:100%; height:100% }`. Confirm drawing buffer matches CSS × pixelRatio (no extra stretch blur).
- Ortho dollhouse + perspective tactile share one renderer.
- Canvas textures mixed `SRGBColorSpace`; anisotropy / mipmaps likely defaults.
- Per-frame: `tick` still `matchMedia` every frame; `animateIgnite` traverses; selection math allocates vectors; portal ~48 sparkles.
- XR statically imported into `room.ts`.

### Still worth evaluating (don’t shotgun)

Crisp: desktop pixelRatio ladder (`powerPreference: 'high-performance'`); `outputColorSpace = SRGBColorSpace` + consistent canvas textures; `anisotropy` on floor/wall (`getMaxAnisotropy()`); PCFSoft vs PCF (don’t jump to 4096); no post stack unless SMAA is proven cheaper than MSAA.

Smooth: cache `prefers-reduced-motion`; debounce `save()` (~300ms, flush `pagehide`) — spring-clean already batches, random drop / edits still stringify the whole room (photos) twice (history + localStorage + backup); lazy-load XR; vendor-chunk three.js; tick: don’t alloc Vector3/Vector2 in the tutorial pad loop when not practicing.

Don’t: on-demand rendering (bob/pulse/ignite/jukebox need the loop); rebuild objects every frame; giant kind-registry / DemoHooks rewrite; raise shadow maps blindly; change `/dev/` chrome.

### Output

Ranked list: what, why (measured if you can), risk to demo/`/dev/`, effort (S/M). Then do the top crisp + hitch wins. Verify typecheck / test / vite build.