# Misc. Manor demo and tutorial: plan (living doc)

Sources: `demo-idea-dump-1.txt`, `demo-tutorial-follow-up.txt`, `demo-second-interaction-camera-and-imports.txt`. Branches: `feature/demo-landing` (interaction 1), `feature/demo-pt.2` (interaction 2). Update decisions and the checklist as work lands.

## Routes

One Vite multi-page app, one codebase.

- `/` the demo (the product, not a hand-off to the sandbox). `src/demo/main.ts` -> `startDemo` in `src/demo/demo-app.ts`. **Every visit starts with the intro**; a finished room is reseeded with a full box.
- `/intro` redirects to `/?intro` (same thing now).
- `/dev/` the dev sandbox (`src/main.ts`). Untouched by demo work; demo features reach it only by explicit opt-in later.
- `/about/` static skeleton, content TODO.

## Modes

- **Demo** (`/`): intro walk-in -> locked tutorial at the shelf (sequence 1) -> still the tutorial, now free to move: the goal is the save point, the "portal" (sequence 2) -> **free mode** once the portal has been used twice (or on **Exit tutorial**). One concise demo experience throughout: no old sandbox state is left over.
  - **Camera / motion choice** (bottom HUD select): **Tactile** (first-person walk, the default) or **Dollhouse** (the isometric room with orbit, walk mode's overview). Switching glides between them; Tactile returns to where the visitor stood.
  - **Sequence 2 progression**: the first use of the portal (Add link or file, Import, Random drop: any of them finishing) ends sequence 2: **Edit room** in the HUD (left of Help, no indicator), the **jukebox** fades in over 3s after the new objects have landed (no text pointing at it), and free mode starts.
  - **Free mode** (`goFree` in `demo-app.ts`): the same HUD (Edit room, Help, Camera) stays at the bottom; Exit tutorial goes; the sandbox's bar shrinks to a **Rooms** pill beside `dev` (plus Cancel move while something is held); Take photo comes in, and the mute button only while music is playing. The jukebox picks the room music. The sandbox `+` never shows in the demo (the portal replaces it). A later visit still walks through the door, then stops just inside looking into the room (no box, no turn to the shelf) and glides to `STAND` (`mp-demo:seq2-done`). Skip intro on that visit lands in free mode too.
  - **Exit tutorial** (bottom left, beside `dev`): jumps straight to free mode.
  - The editor comes from `src/demo/room-app.ts` (`mountEditor`: the sandbox `MenuView`; its own Edit room button and `+` are hidden by demo CSS, `body.demo-edit-tools` / `body.demo-free`). The Rooms picker visits built rooms while My room stays as the visitor left it.
  - A small `dev` link to `/dev/` sits bottom left the whole time.
- **Dev sandbox** (`/dev/`): the team's tool, five named rooms, orbit camera. Its + sheets use the same Add object / Import forms as the save point (`src/views/add-forms.ts`); it looks and behaves as before.

## How the demo works

- **One real room.** The demo is the sandbox's `RoomView` (cozy loft, normal lighting), not a separate stage.
- **Demo hooks.** `RoomView.setDemo(hooks)` takes optional `DemoHooks`; the sandbox never sets them.
  - `camera`: render and raycast through a perspective camera; orbit controls are off.
  - `slots`: only these slots show markers and accept a drop.
  - `yaw`: which way objects face. The demo leaves this unset so objects keep the isometric 45° rest pose from the intro through free mode; they must not snap when the camera changes.
  - `frame`: per-frame callback.
  - `dock`: the panel the preview card docks above.
  - `tap`: sees every tap before select/place, gets `{ raycaster, repId, slotId, room hit, event }`, returns true to consume.
  - `keepSelectionOnPlace`: placed objects stay selected, so the preview stays up.
  - `liftSelected: false`: a selected object stays at rest on its slot instead of lifting toward the iso camera (that lift read as "picked back up and moved aside" in first person).
  - `compactPreview`: the small preview card (see Previews).
  - Getters: `view.canvas`, `view.overview` (iso camera and orbit target).
- **Flow.** Every visit -> black -> a wooden door at the open east side swings open on bright light, everything else dark -> about 5.4s first-person spline walk through it (`core/intro-timeline.ts`, pure, tested) -> locked tutorial facing the bench and shelf -> visitor unpacks the starter objects onto the shelf, no instructions -> about 1.4s after the last one (or on Skip) the camera glides down to standing height at `STAND` [8.3, 1.6, 4.8] facing the shelf -> walk the room in first person (Tactile) with Help, Camera and Exit tutorial; the save point across the room is the goal (interaction 2).
- **Starter objects** (`src/demo/intro-objects.ts`, hardcoded, `locked` content: link and text fixed, kind can change, can be stashed): rocket = Unpacking (unpackinggame.com), drum = about page, cassette = lofi YouTube.
- **Default look.** New (and unsaved-look) demo rooms use the **slate stone** floor so the loft edge reads against the original purple walls from above. Walls stay original unless the visitor picks a theme.
- **Previews.** The card docks by its bottom-right corner above `.demo-dock` (tutorial) or `.item-sheet` (after Exit tutorial), grows upward, never covers the panel. The demo uses the **compact card** (`compactPreview`): 200px wide on phones (260 on desktop), title and `Open ↗` on one row, one short status line (`Loading…`, then `Blank? Use Open.`; never claims the page loaded), no audio-coordination notice (the demo has no room music until the visitor turns it on). The dock shows only the kind picker; the title is on the card. `/dev/` keeps the full card and main's policy copy. Link cards are clickable with Open in browser. What embeds follows main's public preview blocklist (`docs/public-preview-policy.md`): any public HTTPS page not on the list tries a sandboxed iframe, so rocket and drum may preview live; the cassette uses the YouTube player. `show(preview, art, openUrl)` takes an optional open-URL override; otherwise cards use the policy's `openHref`.
- **Persistence.** Autosave to `localStorage` `mp-demo:rooms:demo-visit` (`roomKeys` routes `demo-*` rooms to the `mp-demo:` prefix). Intro-seen flag `mp-demo:intro-seen`. An unreadable save is never overwritten; an error shows instead. Return visits replay the demo from a full box.
- **Jukebox.** Outside the room by the east wall end (`JUKEBOX_POS`), scale 0.6. Hidden until the first portal use, then it pops in (solid, brighter glow), with no line pointing at it. Tapping it (same reach rule as the portal) opens the **Jukebox** panel: Room music (Follow lighting, No music, the 11 tracks). Its mouth opens while the panel is up. Feeding it music comes later.
- **Save point.** `src/demo/save-point.ts` (`buildSavePoint`, `update(t, dt)`, `hit(raycaster)`), standing just off the room at `SAVE_POINT_POS` [2.6, 0, 8.45]. Visitors see it called the **portal**. See Interaction 2.
- **Web first.** VR is Matt's area; demo work must not touch XR code. The VR button stays hidden while locked.

## Current stage (decided 2026-10-21)

Principle: **lead from mobile.** One framing for every screen; desktop just sees more around it.

### 1. Mobile-first tutorial framing
- Cause of today's bug: `TUTORIAL_VIEW` fixed a 46° vertical FOV, about 22° wide in portrait, so only the middle object fit and the top shelf was edge-on.
- New rule: `tutorialView(aspect)` (pure, tested). A fixed set of world points (bench, shelf with room for objects, the box) must always fit. Fixed look direction, higher and tilted down more so the top shelf faces the visitor; fixed vertical FOV; the camera backs off along the view direction until everything fits with margin.
- The walk-in ends exactly on that view. Re-aimed on resize.
- **Screen bands** (`FRAME_BANDS`, fixed after the phone bug where the preview card covered the shelf): the framed points stay out of the bottom 40% of the screen (hands, dock, preview card) and the top 7% (Skip). The camera slides along its own up axis (same look direction) and backs off only if the points no longer fit. On a 390x660 phone: shelf about y 135, bench about y 237, box bottom about y 366; everything under y 396 is UI room.

### 2. Cardboard box replaces the tray (Unpacking reference)
- One open cardboard box with packing stuffing in front of the bench; contents hidden (`src/demo/cardboard-box.ts`). Idle wiggle invites a tap; no text.
- Starters begin with no slot ("in the box"). Tutorial drop slots are the shelf and bench only. Old saves with starters on the former tray slots `floor-7/8/9` move back into the box on load.
- **Tap the box** -> a random remaining starter pops out into the visitor's **hands** (drawn in front of the camera, low and left of centre, below the box so it never covers the shelf or bench spots or the dock), and its preview and kind picker show in the dock.
- **Tap a shelf or bench slot** -> placed. It stays selected, so the preview stays up until the visitor taps elsewhere.
- **While holding, any other tap** (box included) -> "Place the object down" shows briefly, then fades. The held object can't be dropped elsewhere.
- Stuffing drops a level per object taken. After the last one is placed the box vanishes, then the lock lifts. On Skip, anything still in the box or in hand goes onto free shelf or bench slots.
- Build the box as a reusable "box of objects" so random drops can use it later.

### 3. Drag to look in the tutorial
- Drag turns the camera a little around its fixed spot (about ±25° turn, ±12° tilt; grab-the-world direction), easing back after release. No moving. Taps still pick up and place (drags over 5px are not taps).

### 4. Movement after the tutorial: tap to go, then look around (demo only)
- Pluggable movement style in `src/demo/walk-mode.ts` (`mountWalkMode(view, store, { hooks, overview, start })`), pure math in `src/core/walk.ts`. `/dev/` keeps its orbit camera.
- The demo mounts it with `start` (glide from the tutorial camera to `STAND`) and `overview: false` (no Overview button, Esc doesn't leave). A Skip during the walk-in cuts through black to the tutorial view first.
- **Walking**: drag to look anywhere (turn freely, tilt clamped); tap the floor to glide there (first tap deselects if something is selected); WASD/arrows on desktop; tap objects and slots to select and place as usual. Positions clamp to the room's floors (ground and loft), so you can't leave the room or get lost.
- **Drag direction is grab-the-world** (like Street View): drag right and the view turns left, drag down and it tilts up. Same in the tutorial's drag-to-look.
- **Zoom moves the visitor**, not a wider lens or a camera arm. Scroll wheel, trackpad pinch or two-finger pinch steps them back along where they face (up to 3.5m) and lifts them (up to 2m, never above 4m; the walls top out at 4.2), with a slight downward tilt as they rise. A wall just stops the step and a ceiling (the loft's underside) just stops the lift; nothing pushes them elsewhere. Zooming back in retraces the step. Looking around only rotates in place, so turning near a wall never moves anyone. A lifted visitor can't walk in under the loft. Helpers in `core/walk.ts`: `zoomEyeY`, `ceilingAt`, `slideBack`, `walkClear`, `zoomTilt`. Stops at "high in the room" for now; all the way out to the overview is a later option for free demo mode.
- **Landing from up high.** Tapping a spot while lifted (zoomed out) or on another surface (loft to ground, onto a step) glides to eye level there, still facing the same way, with the view levelled out to the usual slight downward look; zoom resets. A tap on the same surface at eye level keeps the view as it is.
- **Stairs.** Tap a step's top to stand on it (layout boxes marked `walkable`; steps keep the eye 0.3m from their edges, and the shallow landing is stood on its centre line). From a step, tap the next step, the loft or the floor. The walk tracks which surface you stand on, since the landing is level with the loft. Hidden slot markers no longer swallow floor and step taps.
- **Blocked above, then pop.** Zooming out under the loft says "You are blocked above". Keep zooming out without a break (a gap over 0.3s ends the push) and at 1.1s the visitor pops up through the slab onto the loft, straight up, nudged in from the edge and out of the peach block (`blockedAbove`, `slabAbove`, `popLanding`). First pop: "Well, this is your room. Do you…"; every pop after: "…". No limit on pops; doing it by accident is part of the joke.
  - Motion now: a plain 0.45s glide. Planned feel (to confirm): from 0.8s a cork-in-a-bottle squeeze (the view nudges up against the slab and strains), then at 1.1s sucked up with the zoom-out motion, a small tilt up during the burst that levels out on landing, and a short camera shake.
- With `overview` on (kept for free demo mode): the isometric view is home base; tapping the floor glides down to eye level there; the Overview button (and Esc when nothing is selected) glides back up.
- Making `/dev/` work this way later: opt in through the same hooks, keeping the orbit as default; discuss before changing.

### 5. Interaction 2: get to the save point, choose your camera (built on `feature/demo-pt.2`)
- **Goal.** After the starters are placed the visitor has somewhere to go: a glowing save point across the room. Getting there teaches moving, and the Camera choice lets them pick the motion that suits them.
- **Save point** (`src/demo/save-point.ts`): Kingdom Hearts save-point vibe (`khsavepoint.png`). Teal rune circle (turning), a soft column of light (about 0.75m wide, 2.4m tall) with a brighter core, sparkles drifting up, two wisps circling, the whole thing bobbing gently upward from floor level (never below it). A teal point light reaches the front edge of the room's floor so it shows at the edge of the view. Reduced motion: still, no pulse.
- **Spot**: `SAVE_POINT_POS` [2.6, 0, 8.45]: off the room like the jukebox, but on the other side: at ground-floor level, about 0.85m past the open front edge (the jukebox sits about 0.8m off its edge), on the stairs half, not in the corner. The west side itself is walled (it would hide the save point from the dollhouse and mostly from inside). It's behind the visitor's left shoulder at `STAND`, so they have to look around; from the front of the floor it's well inside reach. Tested in `intro-timeline.test.ts`.
- **Tapping it** never walks the visitor there. Tactile: opens within `SAVE_POINT_REACH` (3m across the floor from where the visitor stands: height and the zoom-out step back don't count); from farther it says "Too far. Move closer, or switch camera, to get to the portal." Dollhouse: opens from anywhere. Something in front of it (an object, a wall) takes the tap instead.
- **Save point panel** (`mountSavePointPanel` in `src/demo/demo-hud.ts`), titled **Add objects to room**: **⭐ Random drop** first, then **Add link or file**, then **Import from bookmarks (file)**. The forms come from `src/views/add-forms.ts`, shared with `MenuView`; ids are prefixed `sp-` so they never clash once the sandbox menu mounts. Messages show as the demo hint. It keeps working after Exit tutorial.
- **Goal line**: "Choose your camera / motion to get to the portal" shows at the top for 6s the first time the save point comes into view while walking (Tactile), or 6s after the tutorial ends if the visitor never turns around. The Camera choice pulses for 8s (or until it is used or the portal opens). Any hint line (for example "Too far. Move closer, or switch camera, to get to the portal.") hides the goal line so the two never overlap.
- **Random drop** (`core/random-drop.ts`, `Store.dropIn`, `RoomView.flyIn`): 4 to 8 objects (random amount) from the devs' rooms: German, Matt, Levi, Jawan and Omari, from their committed starter content. Each draw picks a dev at random, then one of their placed objects. The copy keeps that person's link and title, but the object kind is randomized so the room does not look like a copy of theirs. Nothing repeats and nothing the room already has comes in again (same link, or same title when there's no link). Copies land on random free slots (big things and rugs on the floor while there's floor left) as one undo step, and fly out of the portal one after another in an arc to their spots. Walking, the view turns most of the way (75%, shortest way) toward the middle of the room as they launch, so the visitor sees them land. Each copy remembers its room (`ContentItem.fromRoom`), and its preview card shows *from Matt* (or whoever) in the top corner. Reduced motion: they just appear. If the room is full it says so.
- **Moving things** (sequence 2 and free mode, Tactile and Dollhouse): tap an object (it stays on its spot, its card shows), then tap an empty glowing spot to move it. Tapping another object only shows that object's card; it does not swap. Nothing lifts toward the middle of the screen. Shelf objects included. The tutorial still puts the box object in the visitor's hands.
- **skip seq 1** (dev shortcut, bottom left beside `dev`, intro and tutorial only): skips the walk-in and the unpacking (starters go on the shelf) straight to interaction 2, still in the tutorial. Exit tutorial takes its place.
- **HUD** (`mountDemoHud`): bottom (centre on desktop, right on narrow screens): (**Edit room** once unlocked), **Help** and **Camera** (Tactile / Dollhouse). Help is a small panel (Tactile walk + WASD/arrows, Dollhouse, pick up, portal, jukebox); it closes with Close, a tap outside or Esc. Bottom left beside `dev`: **Exit tutorial** (until free mode), then the Rooms pill. On phones (440px and narrower) those sit just above the HUD.
- **Walk mode API** (`mountWalkMode` returns a `WalkHandle`): `camera`, `mode`, `toOverview()` (remembers where the visitor stood), `toWalk()` (glides back down there, or turns around mid-way). Option `overviewTapWalks: false`: in the dollhouse a floor tap does not drop into Tactile. Objects keep the isometric facing in both cameras, so they do not spin on the switch.
- **Tactile <-> Dollhouse blend** (no jump at the perspective switch): going up, the eye glides to the overview pullback, then a 0.55s **dolly zoom** (`dollyLens` in `core/walk.ts`, tested) backs the camera off along the isometric line while the lens narrows from 65° to 3°, framing the orthographic view's height and clipping where it clips, then hands over to the isometric camera, which by then looks the same. Coming down runs it in reverse (dolly in, then glide to where the visitor stood). Either way can turn around mid-way.

### 6. Jukebox and music
- Built: it appears in free mode and tapping it picks the room music (see Jukebox above). Still later: feeding it music; music off until the visitor uses the jukebox; the mute button only while jukebox music plays; the room editor's Room music moving out to the jukebox; a jukebox in `/dev/`.
- Code map:
  - Tracks and the saved `RoomState.soundtrack` are in `core/soundtrack.ts` (11 mp3s in `public/audio/`).
  - Playback is `SoundtrackPlayer` (`views/soundtrack.ts`); it never autoplays before `toggleSound()`.
  - The mute button is `createSoundtrackControl`; it's always in the DOM, just disabled when music is off.
  - The picker is `#room-soundtrack` in `MenuView.buildLighting()`.
  - The jukebox is scenery (`addToScene`), so taps reach it through the `tap` hook.

## Open questions

- Interaction 2 defaults to confirm: Help as a small panel; tap reach 3m (Tactile) with a "move closer" line beyond it.
- Free mode: should the jukebox's appearance get a line ("Something new by the door")? Should Edit room hold the whole sandbox editor (name, theme, lighting, music, export) or a curated part? Keep Take photo and the mute button?
- Imported items that don't fit a slot go to the inbox, which only the sandbox menu lists (after Exit tutorial).
- Random drop, later: anticipate the motion or have the objects magically organize themselves (now they simply fly out of the portal to random spots). Maybe a box to sort through (reuses the cardboard box).
- How the visitor earns the rest of free demo mode; what Exit tutorial should eventually offer instead of the raw sandbox tools.
- Bigger slot tap targets on touch, if the new framing still feels small.
- Drum links to the about page: once hosted on that same origin, the preview policy refuses to iframe it ("Preview unavailable"). Point it elsewhere or special-case it.
- Making editing the room easy and fun from the demo (curate the edit tools).
- Per-visitor storage beyond localStorage; where starter links live (hardcoded now); policy for editing dropped-object links.
- Rocket model comes from main's toys (`views/toy-objects.ts`).

## Checklist

- [x] Multi-page routes, demo room, walk-in, locked tutorial, release, dock, locked links, persistence
- [x] Merge `origin/main` (toys, glow, icons and rename, preview blocklist, practice tutorials, VR button gating). Browser harnesses that need the sandbox point at `/dev/`.
- [x] `RoomView` hooks for this stage: `tap`, `keepSelectionOnPlace`, `canvas`, `overview`, floor tagging
- [x] Mobile-first framing (`tutorialView`: 55° FOV, 32° down, solved for aspect 0.46; camera about [8.3, 5.0, 7.5]; with the screen bands about [8.3, 3.8, 8.2])
- [x] Cardboard box (`src/demo/cardboard-box.ts`, at `BOX_POS` [8.3, 0, 2.2]), hands, hint, vanish, old-save migration
- [x] Drag to look in the tutorial (±25° turn, ±12° tilt, eases back)
- [x] Walk mode (`src/demo/walk-mode.ts`, `src/core/walk.ts`: 65° FOV, eye 1.6m, WASD/arrows on desktop)
- [x] Demo always starts with the intro; after the tutorial it stays first person (no overview) with the edit tools and Rooms picker; `dev` link bottom left
- [x] Fixes: held object no longer covers the bench spots; a placed object no longer lifts away (`liftSelected: false`)
- [x] Grab-the-world drag (tutorial and walking); zoom as step back and up with wall and loft clamping
- [x] tsc clean, 289 tests pass, `vite build` green
- [x] Phone fix: tutorial framing keeps slots and box above the UI band; compact preview card; dock without the repeated title
- [x] Save point object and idle animation at `SAVE_POINT_POS`
- [x] HUD after the tutorial: Help, Camera (Tactile / Dollhouse), Exit tutorial; no edit tools until Exit tutorial; goal line on first sight of the save point
- [x] Save point panel: Add link or file, Import from bookmarks (file), Random drop; forms shared with `/dev/` via `src/views/add-forms.ts`
- [x] tsc clean, 378 tests pass, `vite build` green
- [ ] Owner visual check on phone and desktop: tutorial with the compact card, save point look and spot, goal line, Help, Camera switching, save point panel and forms, Exit tutorial, `/dev/` + sheets unchanged
- [x] Random drop: 4-8 unique objects from the devs' rooms fly out of the portal to random free spots
- [x] skip seq 1 dev shortcut; goal line after 6s regardless; Camera pulse stops after 8s; portal at floor level, closer to the edge
- [x] Sequence 2: Edit room after the first portal use; free mode after the second (jukebox, Rooms pill, photo, music); Exit tutorial skips to free mode
- [x] Moving objects in sequence 2 (tap, tap again to pick up, tap a spot); random drop turns the view toward the room; *from <dev>* on dropped objects' cards
- [x] Jukebox picks the room music (feeding music later)

## Trying it

- `/` always plays the walk-in and tutorial with a full box.
- Reset fully: delete the `mp-demo:*` keys in localStorage.
