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
- **Neighborhood / Overworld:** a real, navigable shared Three.js world with **16 furnished, open-front room pavilions**, not cards, islands or a modal map. My room, five directory rooms and ten committed examples remain separately visitable. Dollhouse pans/zooms the same scene that Tactile walks and VR inhabits.
- **Customize · lighting, walls & floors:** opens the real production editor; XR opens shared lighting/surface controls and offers Undo and a JSON backup action.
- **Dev sandbox:** BASE_URL-relative navigation inside the pillar, with XR exit before navigation.
- **Return to my room:** reversible even after multiple visits, edits, or imported JSON in a visited room. Edits to visits are temporary and never autosave over My room. Export a visit to keep its changes.

## Shared neighborhood world and themed cul-de-sacs

`views/neighborhood-world.ts` owns one metre-scale scene graph, not 16 full RoomViews. Paths join metadata-themed, capacity-bounded round-ended courts to a continuous main promenade. Low-poly grass/land, distant faceted hills, trees, benches, lamp posts, physical room signs and cutaway architecture make the destinations visible from the street. Pavilions reuse capped previews of each room’s actual placements/object kinds, cached once per kind with shared geometry/materials; no media fetches, per-house renderer or per-house shadow light.

`core/neighborhood-plan.ts` deterministically groups actual saved seed metadata:

- **Daylight Court:** daylight / overcast lighting (and default fallback).
- **Fireside Court:** dawn / sunset / candlelight / ember.
- **Conservatory Court:** emerald.
- **Twilight Court:** twilight / cyber / vaporwave.
- Explicit lighting wins. Only when absent, surface preset keywords select garden (forest/moss/garden/leaf/fern), twilight (neon/violet/lavender/cosmic/dusk), or fireside (wood/brick/terracotta/amber). No owner/title guessing. IDs sort within each court so input ordering does not shuffle addresses. My room uses its real personal snapshot. A court can be sparse; rooms are not artificially reassigned to balance counts.

### Capacity and actual room surfaces

Each cul-de-sac holds **at most six** pavilions on a fixed 16 m radius, with 52 m branch spacing and a consistent +Z opening. Sorted theme IDs are chunked into deterministic branches; overflow gets a new same-theme branch and a spur to a shared trunk, never a tighter ring or overlapping houses. Terrain bounds, camera far plane and overview framing grow with the plan. Unit fixtures cover 61 mixed-theme rooms, unique inclusion, branch capacity, footprint separation and trunk connection; a 16-room single-theme physical-world fixture exercises safe doorway spawns across overflow branches. New IDs sort deterministically but may rebalance addresses when inserted before older IDs; this is not a persisted street-address service.

Walls/floors call the **same `surfaceTexture` and `surfaceGeometry`** as full RoomView, including procedural finishes, tiling and local custom image selections. Equivalent materials/maps are cached, selected maps use white tint, and no-selection materials use that room layout’s real original palette. My room always uses `Store.personalRoom`; the active visited room uses its current temporary snapshot; all other destinations use committed seed data. It does not load another user’s browser saves or apply a remote save to My room. Decode failures report a non-destructive warning; maps/listeners are disposed normally.

Court centers reuse the existing object palette, deterministically: **Daylight → globe**, **Fireside → fireplace**, **Conservatory → plant**, **Twilight → telescope**. Each model is grounded on a solid island plinth; the center island is excluded from walking/teleport, has no room ID and never becomes an enter-room target. Existing flame animation hooks are cached and advanced with reduced-motion support; model lights are removed so the four-active-light budget stays bounded even as branches grow.

Street/court signs use two separate outward-facing `FrontSide` text meshes, sharing the same glyph texture with opposite Y orientations, separated by a wooden backing. They are not `DoubleSide` text that mirrors from behind. Posts stop below the sign face. The browser harness ray-tests both faces of all four court signs and renders opposite-side screenshots.

Each branch has theme-local terrain/accents and one bounded, non-shadow-casting colored point light; only the nearest four are active. Walls/floors instead preserve the real room surfaces, never a cluster recolor. A neutral daylight rig keeps the whole world legible; changing courts does **not** mutate the personal lighting preset or swap a global light color. Point lights have finite distance/physical falloff and no per-frame light rebuild.

Opening the world reads `store.visiting` (or `home`) and spawns outside that pavilion on its safe front walkway, eye height 1.65 m, facing outward along the ring street. Unknown identities fall back to My room. Tactile/Dollhouse swaps retain the same world and street pose. XR starts from that nearby pose; XR exit transfers the player’s position/yaw back into Tactile, including across re-entry. Exterior movement/teleport rejects oriented pavilion bounds and land edges.

- **Dollhouse:** drag pan, scroll/pinch zoom, ray-click any physical pavilion.
- **Tactile:** WASD/arrows, drag to look, touch/tap a path to walk; selecting a pavilion enters the full actual room through `visitCatalogRoom` → `Store.visit`.
- **VR:** the identical world at street scale; controller ray selects pavilions, floor selects teleport, stick-forward uses the aimed safe floor and lateral stick snap-turns. Menu/grip opens a reachable glass Home/Camera panel with **Return to my room**, **Camera · exit VR**, and Keep exploring; the physical My room trailhead/pavilion can also be selected. No smooth XR locomotion or artificial camera animation was added.
- Desktop has **Return to my room** in a reserved LEFT slot before the existing Help/Camera controls. Hiding it retains the slot, so their bounding boxes do not move; the mobile HUD stays right-docked. It is visible while exploring/visiting, hidden at home, and the whole desktop HUD hides during immersive VR. 320 px mobile fit and before/after bounding boxes are browser-tested. No room-button grid is overlaid on the environment. On visit/return, original room/scenery/lighting are restored; intro progression is paused while exploring. All neighborhood listeners, OrbitControls, geometries, materials and textures are disposed (shared resources once).

## Pack item and the item pillar’s Unpack tray

The existing new-item pillar now contains an expandable **Unpack** tray on desktop. In VR, **Unpack** expands the shared glass tray page, with Back to Items, all packed content, and existing pagination for long collections. It is not a new floating control or a second unrelated home-menu inbox.

- Lists every content item without a representation, including import overflow and previously packed items.
- Calls the existing `Store.bringOut` restoration path. The chosen `lastObjectKind` survives packing; restoration creates one representation only when a valid free spot is available.
- Empty trays explain there are no packed items. Full/incompatible-capacity rooms explicitly say to pack an item and retry; packed content and remembered model remain intact. Successful restoration reports Unpacked.
- Visible desktop/XR actions now read **Pack item** / **Unpack**; editor rows and import/status/tutorial copy use **Packed items**. Internal `stash`, `bringOut`, inbox page/class IDs, tutorial event/target IDs, commands, and persistence keys are deliberately unchanged for compatibility.
- Regression and actual browser checks pack and unpack a guitar, assert the same content/chosen model, exactly one representation, saved/reloaded restoration, and XR full-room feedback without losing packed content. The ordinary editor retains its existing actions with the updated wording.

## VR entry and file capabilities

The third camera option, **VR**, is absent until a completed, successful secure-context `immersive-vr` support probe. A missing API, insecure origin, rejected probe, or unsupported device does not show it. The entry selection primes shared music and calls `requestSession` without another asynchronous capability probe between the gesture and request.

VR is a session action, not a saved desktop camera preference. Requests are locked while pending; cancellation/rejection restores the prior selection and reports a visible message, without overwriting the remembered Tactile/Dollhouse choice.

Controller selects cannot be assumed to grant native file/download activation:

- With granted DOM overlay, room JSON opens a browser form inside that overlay; the visitor selects the actual Save/Load button using browser input.
- Without granted overlay, selection explicitly exits VR before presenting the same browser form. Re-entry closes stale forms. The world-space menu explains this boundary before selection.
- File forms do not expose desktop-only customization behind the headset overlay. Controller world interactions are blocked while the room file form is open.
- Async reads are guarded against room transitions, intervening edits, closed/reopened dialogs, and XR lifecycle changes. Closing the form cancels a late read.

## Verification

Base `9b311fa`: **405/405 tests pass**. Feature: **424/424 tests pass**, plus `npm run typecheck`, `npm run build`, and `git diff --check`. Build retains the existing large-chunk advisory; it is not a build failure.

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
- Desktop and 390×844 mobile world rendering; real pointer clicks visit **all 16** pavilions and restore exact personal JSON, including each visited room’s matching outdoor spawn; street clicks, keyboard walking, native CDP touch-to-path walking, and camera changes.
- Reload/replayed intro keeps the existing room JSON intact.
- Delayed support probe keeps VR absent until resolution. Trusted keyboard selection calls the mocked XR request with browser user activation present; rejection restores Dollhouse and leaves its saved preference unchanged.
- Real WebGL-rendered glass XR panel textures; synthetic controller rays open the actual Rooms portal, enter the shared world, select a physical pavilion and enter its actual room, visit/return home, select random rooms, change lighting, and undo. Safe teleport, shared-world identity and XR exit/re-entry are also exercised.
- Overlay file form, no-overlay exit fallback, session exit/re-entry cleanup, and personal-room preservation. Zero page errors.

**Limits:** the XR session/poses and capability response are synthetic. These checks do not claim real-headset comfort, browser-native picker availability on every headset, or a successfully negotiated hardware XR session. The overworld is now actual navigable terrain, but previews intentionally cap furniture and do not reproduce the entire room architecture/background or object-specific custom media. Actual wall/floor finish/image selections are reproduced. Hardware comfort/performance and real-headset input remain unverified. Exterior collision uses conservative pavilion bounds rather than a physics engine; no avatar multiplayer/networking is implied. JSON export does not upload rooms anywhere; native file content follows the capabilities of the existing schema. No sound effects, new backend, separate website, publishing, merge, or production deployment is included.

## Screenshot evidence

Committed under `docs/evidence/prod-room-portal/`:

- `desktop-portals.png`: both front-edge portals and production HUD.
- `desktop-overworld.png`: the shared world’s themed cul-de-sac overview.
- `street-overworld.png`, `street-pavilion.png`: real street-height neighborhood and furnished pavilion.
- `mobile-street.png`: native touch-to-path walking on phone viewport.
- `mobile-overworld.png`: responsive mobile neighborhood.
- `xr-room-portal.png`: rendered world-space glass menu.
- `xr-overworld.png`: the same neighborhood rendered through the synthetic XR camera.
- `xr-file-fallback.png`: real browser file fallback form.
- `desktop-unpack.png`: expanded item-pillar Unpack tray.
- `xr-unpack.png`: rendered glass XR Unpack tray.
- `surface-pavilion.png`: actual My room brick walls and saved custom floor image; browser compares all 80 shell meshes across 16 pavilions against actual selections/default palettes and shared procedural texture output.
- `mobile-hud-320.png`: stable left Home slot, Help and Camera at 320 px with no clipping.
- `street-sign-front.png`, `street-sign-back.png`: the same Fireside sign viewed from opposite sides, readable without mirrored glyphs.
- `centerpiece-daylight.png`, `centerpiece-warm.png`, `centerpiece-garden.png`, `centerpiece-electric.png`: grounded themed central islands.
- `result.json`: browser assertions/capability/lifecycle results.

Local originals: `/home/dvgpro/.hermes/cache/scratch/neighborhood-world-evidence/`. Automated suite logs: `/home/dvgpro/.hermes/cache/scratch/manor-neighborhood-tests.log` and `manor-neighborhood-build.log` (base comparison retained in `room-portal-base-tests.log`).

This branch is for review only. **Do not merge without the user's separate approval.**
