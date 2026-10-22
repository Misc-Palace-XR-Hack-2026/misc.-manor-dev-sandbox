# VR portal and jukebox parity

## Existing production features inspected

`src/demo/demo-app.ts`, `demo-hud.ts`, `save-point.ts`, `jukebox.ts`,
`views/add-forms.ts`, `views/soundtrack.ts`, `core/random-drop.ts` and Store:

- **Portal:** animated rune column/sparks/wisps/light; Add link/file form (title,
  reference, content type, representation choice including automatic), local PNG/JPEG
  photo preparation/persistence; bookmark HTML import; multiple-file and folder
  name-only import (200 entries at a time); Random drop from committed dev-room
  content, 4–8 draws, source dedupe, varied representations, free-slot capacity,
  one Store undo/save transaction and fly-in animation; post-tutorial hold-to-clean
  returning extra placed objects to Inbox while retaining the three starters.
- **Jukebox:** animated record/neon/mouth model; random initial track when still
  following lighting, preserving an explicit track/off; Follow lighting, No music,
  every `ROOM_TRACKS` entry, Play; desktop speaker mute/unmute; the shared player's
  gesture-only initial enable, blocked-play handling, room changes, fades,
  visibility/departure suspension and embed-audio coordination. Own-music feeding
  is explicitly **not implemented in production**.
- Production desktop progression gates portal/free-mode editing and jukebox reveal.
  VR exposes these actions immediately, without replaying or completing that demo
  progression, reloading the room, or changing intro flags.

## Implementation

- Session-owned `XrAmenities` reuses the production model builders, updates only
  from XR `tick`, and disposes all model resources on exit. Both stand on the public
  build's own anchors, `SAVE_POINT_POS` and `JUKEBOX_POS`, with its facing and 0.6
  scale, so the two views describe one room; no literal coordinates remain in the XR
  scenery. From the spawn point the portal is 5.3m away and the jukebox 7.5m, inside
  the 10m controller ray. Existing green loft and short teleport effects are unchanged.
- Physical model hits respect nearer room/object occlusion and open the existing
  translucent glass `XrPanel`, positioned within reach in front of the viewer.
  Both pages are also available from room controls. Existing pill object toolbar
  and VR keyboard remain shared, not replaced.
- Desktop and VR call `randomPortalDrop` and `ensureJukeboxTrack`. Drop uses the same
  dev-room pool, `pickDrop`, `Store.dropIn` and `RoomView.flyIn`; spring clean uses
  the same `vacuumTargets` and batched Store stash operations. Release, disconnect,
  room/session/page changes stop the hold. VR clean returns items directly to Inbox
  at intervals (no desktop fly-out/camera-turn animation).
- **Audio unlock:** an immersive session's controller selects do not grant user
  activation, so an in-VR Play was always refused with a browser-blocked state. The
  Enter VR click — a trusted gesture — now calls `primeFromGesture()`, which unlocks the
  element at volume 0 and pauses it again immediately unless the user had already asked
  for music. Priming is a no-op while music is playing, never starts audio on its own,
  and never cancels a live fade. If the browser still refuses, the panel says so plainly
  instead of reporting a user mute.
- `roomSoundtrack(store)` owns the same player used by desktop/demo/XR. No second
  Audio element is created for VR. Play stays on controller-select dispatch;
  Pause and Mute synchronously suspend the same player. Selecting a track follows
  the existing enabled/muted playback policy; merely opening VR never enables audio.
- Import reuses `buildImport` and `buildAddForm` verbatim with prefixed IDs and
  async room/sheet guards. Granted DOM overlay mounts the forms inside its root;
  without a grant the labelled action exits VR and opens the same actual browser
  form. File picker support is browser/headset-dependent; the form explains that
  removing the headset may be necessary. File/folder imports still store names,
  not uploaded original bytes; local photos are the existing exception.
- Desktop demo scenery is temporarily hidden and its frame progression paused in
  VR, then restored on exit. XR entry/exit do not seed or replace saved content.
- No sound effects, own-music upload implementation, or external Tailscale routing
  changes are included.

## Verification / reproducibility

```sh
cd /home/dvgpro/Projects/manor-vr-portal-jukebox/dev-sandbox
npm ci
npm test
npm run typecheck
npm run build
npm run dev -- --host 127.0.0.1 --port 5534
# separate terminal:
PLAYWRIGHT_MODULE=/home/dvgpro/.hermes/cache/scratch/manor-hud-browser/node_modules/playwright/index.mjs \
  node tests/browser-xr-amenities.mjs
```

The new browser harness uses system Chromium, actual WebGL, real production models,
controller ray/selection dispatch and Store persistence. XR lifecycle/poses and the
AudioLike playback probe are synthetic: it proves calls into the one shared player,
not audible headset output or a trusted physical headset gesture. It also exercises
all track choices, play/pause/mute/embed coordination, hold/release/page cancellation,
DOM-overlay bookmark/file inputs, desktop fallback, animation dispatch and exit/reentry
save preservation. Screenshots and JSON go to
`~/.hermes/cache/scratch/vr-portal-jukebox-evidence/` by default (`MP_EVIDENCE` overrides).

`tests/browser-xr-amenity-anchors.mjs` asserts the mounted models' world positions
equal the shared constants, with controller-ray reach from the spawn point.

Note: a long-lived Vite dev server that has HMR-reloaded `soundtrack.ts` serves a second
module instance, so a harness importing the bare URL gets a different `players` map and
the shared-player assertions fail spuriously. Restart the dev server before running them.

Baseline `8c5addb`: 396 unit tests; feature branch: 405 unit tests. Both pass.
Existing `browser-xr-creation.mjs` also passes. Existing
`browser-xr-input-lifecycle.mjs` fails its stair walking assertion (line 127) on both
baseline and this branch: that old harness invokes `updateControllers()` without
its required `now, dt` arguments. This unrelated harness defect is left unchanged.
Vite emits its existing large-chunk advisory; build succeeds. Headset testing and
native headset file pickers remain manual verification.
