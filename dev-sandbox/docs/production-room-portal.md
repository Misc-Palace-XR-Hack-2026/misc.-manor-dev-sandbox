# Production Rooms portal and VR camera

## Scope and existing behavior inventory

This is the public `/` experience in **this repository**, not a separate website or a replacement `/dev/` shell. It starts from `origin/main` at `9b311fa`.

- Production already owns a `Store` pinned to `demo-visit`, a `RoomView`, a scripted intro/unpacking flow, and Tactile/Dollhouse camera preferences. Intro replay, owner normalization, and the production seed/migration helpers remain in place.
- The existing item portal uses `buildSavePoint`, shared production anchors, the shared add/import forms, `randomPortalDrop`, batched spring cleaning, and the existing dedupe/capacity rules. None are duplicated or replaced here.
- `ROOM_DIRECTORY` describes personal/named rooms; `REPO_ROOMS` includes every committed JSON example. Named room seeds are constructed through `seedRoom`, without calling the persistence/reseed path `openRoom`.
- The existing `Store.visit` / `returnHome` path protects the personal save from visits. This change additionally isolates visit undo history and cancels held-object moves before taking the home snapshot. Otherwise, Undo after returning home could accidentally save the visited room over My room, or visiting while holding an object could snapshot a missing placement.
- Room JSON remains `Store.exportJson` / `Store.replaceState`: validation, normalization, undo, local persistence, and previous-save backup remain the authority. There is no second schema/importer.
- Lighting/walls/floors remain the existing production editor and shared XR appearance actions. Music remains the single `roomSoundtrack` player, primed on the actual entry gesture. No sound effects were added.
- XR keeps its existing translucent glass panel material, pagination, ray hit-testing, object action pills, and session-owned amenities. Desktop-only scenery stays hidden during XR and restored on exit.

## Placement and interaction

The room's open front is **+Z**, beyond the front floor edge at `z=7.3`; the existing item portal is `[2.6, 0, 8.45]`. The new portal mirrors it across the room's X midpoint: `[ROOM_EAST - SAVE_POINT_POS[0], 0, 8.45]`, approximately **`[7.7, 0, 8.45]`**. This puts both portals off the same open front edge, on opposite sides rather than through a rear wall. Desktop and XR import the same builder and anchor.

The Rooms portal reuses the production rune/column model with a restrained lavender tint and no overhead label, matching the unlabeled item pillar. Production Dollhouse framing has extra margin so both portals remain visible. Tactile retains the existing reach check; Dollhouse opens from afar. The pillar appears with free-mode progression. Per live-review feedback, the production bottom Edit button, floating Rooms button, and on-screen dev shortcut are hidden; all room actions and customization remain in the physical pillar. The ordinary `/dev/` editor and Rooms controls remain unchanged.

The menu provides:

- **Visit a random room:** a reversible visit, excluding home/current destination.
- **Save room · JSON:** real downloadable room JSON, including objects, appearance, and supported embedded data.
- **Load room · JSON:** the existing validated replacement operation; invalid JSON leaves the room unchanged and Undo restores a successful load.
- **Neighborhood / Overworld:** selectable isometric schematic dioramas, generated from actual room placements and lighting, not a relabeled text list. All **16 destinations** are included: My room, five named directory rooms, and all ten committed examples. Named rooms and their underlying raw examples remain separately accessible. Desktop/mobile scroll; XR shows six islands per page over three pages.
- **Customize · lighting, walls & floors:** opens the real production editor; XR opens shared lighting/surface controls and offers Undo and a JSON backup action.
- **Dev sandbox:** BASE_URL-relative navigation inside the pillar, with XR exit before navigation.
- **Return to My room:** reversible even after multiple visits, edits, or imported JSON in a visited room. Edits to visits are temporary and never autosave over My room. Export a visit to keep its changes.

## VR entry and file capabilities

The third camera option, **VR**, is absent until a completed, successful secure-context `immersive-vr` support probe. A missing API, insecure origin, rejected probe, or unsupported device does not show it. The entry selection primes shared music and calls `requestSession` without another asynchronous capability probe between the gesture and request.

VR is a session action, not a saved desktop camera preference. Requests are locked while pending; cancellation/rejection restores the prior selection and reports a visible message, without overwriting the remembered Tactile/Dollhouse choice.

Controller selects cannot be assumed to grant native file/download activation:

- With granted DOM overlay, room JSON opens a browser form inside that overlay; the visitor selects the actual Save/Load button using browser input.
- Without granted overlay, selection explicitly exits VR before presenting the same browser form. Re-entry closes stale forms. The world-space menu explains this boundary before selection.
- File forms do not expose desktop-only customization behind the headset overlay. Controller world interactions are blocked while the room file form is open.
- Async reads are guarded against room transitions, intervening edits, closed/reopened dialogs, and XR lifecycle changes. Closing the form cancels a late read.

## Verification

Base `9b311fa`: **405/405 tests pass**. Feature: **415/415 tests pass**, plus `npm run typecheck`, `npm run build`, and `git diff --check`. Build retains the existing large-chunk advisory; it is not a build failure.

Reproduce the browser harness from `dev-sandbox/` with a Vite dev server on port 5534:

```sh
MP_URL=http://127.0.0.1:5534 \
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
node tests/browser-prod-room-portal.mjs
```

This launches real `/usr/bin/chromium` WebGL 2 with `--use-angle=gl --enable-webgl --ignore-gpu-blocklist`. The harness instruments the Vite-served RoomView to capture the instance **only in the test browser**; no debug hook is shipped in the application.

Verified browser behavior:

- Actual public route, hidden production screen shortcuts, exact random-action label, Dev sandbox menu link/navigation and ordinary `/dev/` control visibility, rendered portal ray clicks in Dollhouse and Tactile (the Tactile fixture uses a synthetic nearby camera pose).
- Real browser JSON download, valid upload/Undo, invalid upload, stale closed-form read cancellation, and reversible room visits.
- Desktop and 390×844 mobile map rendering, all 16 destinations, last mobile island scrolling/selection and return home.
- Reload/replayed intro keeps the existing room JSON intact.
- Delayed support probe keeps VR absent until resolution. Trusted keyboard selection calls the mocked XR request with browser user activation present; rejection restores Dollhouse and leaves its saved preference unchanged.
- Real WebGL-rendered glass XR panel textures; synthetic controller rays open the actual Rooms portal, paginate all islands, visit/return home, select random rooms, change lighting, and undo.
- Overlay file form, no-overlay exit fallback, session exit/re-entry cleanup, and personal-room preservation. Zero page errors.

**Limits:** the XR session/poses and capability response are synthetic. These checks do not claim real-headset comfort, browser-native picker availability on every headset, or a successfully negotiated hardware XR session. The overworld is a browsable schematic diorama neighborhood, not a free-roaming avatar terrain or screenshot-accurate miniature of custom surface images. JSON export does not upload rooms anywhere; native file content follows the capabilities of the existing schema. No sound effects, new backend, separate website, publishing, merge, or production deployment is included.

## Screenshot evidence

Committed under `docs/evidence/prod-room-portal/`:

- `desktop-portals.png`: both front-edge portals and production HUD.
- `desktop-overworld.png`: selectable data-derived neighborhood cards.
- `mobile-overworld.png`: responsive mobile neighborhood.
- `xr-room-portal.png`: rendered world-space glass menu.
- `xr-overworld.png`: rendered world-space diorama islands.
- `xr-file-fallback.png`: real browser file fallback form.
- `result.json`: browser assertions/capability/lifecycle results.

Local originals: `/home/dvgpro/.hermes/cache/scratch/prod-room-portal-evidence/`. Automated suite logs: `/home/dvgpro/.hermes/cache/scratch/room-portal-tests.log` and `room-portal-base-tests.log`.

This branch is for review only. **Do not merge without the user's separate approval.**
