# Misc. Manor demo and tutorial: plan (living doc)

Sources: `demo-idea-dump-1.txt`, `demo-tutorial-follow-up.txt`. Branch: `feature/demo-landing`. Update decisions and the checklist as work lands.

## Routes

One Vite multi-page app, one codebase.

- `/` the demo (the product, not a hand-off to the sandbox). `src/demo/main.ts` -> `startDemo` in `src/demo/demo-app.ts`. **Every visit starts with the intro**; a finished room is reseeded with a full box.
- `/intro` redirects to `/?intro` (same thing now).
- `/dev/` the dev sandbox (`src/main.ts`). Untouched by demo work; demo features reach it only by explicit opt-in later.
- `/about/` static skeleton, content TODO.

## Modes

- **Demo** (`/`): intro walk-in -> locked tutorial at the shelf -> first-person walk around the room. Never leaves first person. Only UI after the tutorial: `+` add objects (bottom right, placeholder) and a small `dev` link to `/dev/` (bottom left, visible the whole time).
- **Free demo mode**: the open room with the isometric overview and edit tools (`src/demo/room-app.ts`, `mountEditTools`), what `/` used to land on after release. **Not reachable for now**; the visitor earns it through more interactions, to be designed next.
- **Dev sandbox** (`/dev/`): the team's tool, five named rooms, orbit camera.

## How the demo works

- **One real room.** The demo is the sandbox's `RoomView` (cozy loft, normal lighting), not a separate stage.
- **Demo hooks.** `RoomView.setDemo(hooks)` takes optional `DemoHooks`; the sandbox never sets them.
  - `camera`: render and raycast through a perspective camera; orbit controls are off.
  - `slots`: only these slots show markers and accept a drop.
  - `yaw`: which way objects face.
  - `frame`: per-frame callback.
  - `dock`: the panel the preview card docks above.
  - `tap`: sees every tap before select/place, gets `{ raycaster, repId, slotId, room hit, event }`, returns true to consume.
  - `keepSelectionOnPlace`: placed objects stay selected, so the preview stays up.
  - `liftSelected: false`: a selected object stays at rest on its slot instead of lifting toward the iso camera (that lift read as "picked back up and moved aside" in first person).
  - Getters: `view.canvas`, `view.overview` (iso camera and orbit target).
- **Flow.** Every visit -> black -> a wooden door at the open east side swings open on bright light, everything else dark -> about 5.4s first-person spline walk through it (`core/intro-timeline.ts`, pure, tested) -> locked tutorial facing the bench and shelf -> visitor unpacks the starter objects onto the shelf, no instructions -> about 1.4s after the last one (or on Skip) the camera glides down to standing height at `STAND` [8.3, 1.6, 4.8] facing the shelf -> walk the room in first person.
- **Starter objects** (`src/demo/intro-objects.ts`, hardcoded, `locked` content: link and text fixed, kind can change, can be stashed): rocket = Unpacking (unpackinggame.com), drum = about page, cassette = lofi YouTube.
- **Previews.** The card docks by its bottom-right corner above `.demo-dock` (tutorial) or `.item-sheet` (after release), grows upward, never covers the panel. Link cards are clickable with Open in browser. What embeds follows main's public preview blocklist (`docs/public-preview-policy.md`): any public HTTPS page not on the list tries a sandboxed iframe, so rocket and drum may preview live; the cassette uses the YouTube player. `show(preview, art, openUrl)` takes an optional open-URL override; otherwise cards use the policy's `openHref`.
- **Persistence.** Autosave to `localStorage` `mp-demo:rooms:demo-visit` (`roomKeys` routes `demo-*` rooms to the `mp-demo:` prefix). Intro-seen flag `mp-demo:intro-seen`. An unreadable save is never overwritten; an error shows instead. Return visits replay the demo from a full box.
- **Jukebox.** Scenery outside the room by the east wall end (`JUKEBOX_POS`), scale 0.6, about 55% opaque, not interactive yet.
- **Web first.** VR is Matt's area; demo work must not touch XR code. The VR button stays hidden while locked.

## Current stage (decided 2026-10-21)

Principle: **lead from mobile.** One framing for every screen; desktop just sees more around it.

### 1. Mobile-first tutorial framing
- Cause of today's bug: `TUTORIAL_VIEW` fixed a 46° vertical FOV, about 22° wide in portrait, so only the middle object fit and the top shelf was edge-on.
- New rule: `tutorialView(aspect)` (pure, tested). A fixed set of world points (bench, shelf with room for objects, the box) must always fit. Fixed look direction, higher and tilted down more so the top shelf faces the visitor; fixed vertical FOV; the camera backs off along the view direction until everything fits with margin.
- The walk-in ends exactly on that view. Re-aimed on resize.

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

### 5. Jukebox and music (later, not now)
- Usable only after the tutorial, once the room is free to explore. Tapping it opens the music choice, which moves out of the demo's edit tools. Music is off until the visitor uses the jukebox; the mute button only shows while jukebox music plays. `/dev/` gets a jukebox later.
- Code map:
  - Tracks and the saved `RoomState.soundtrack` are in `core/soundtrack.ts` (11 mp3s in `public/audio/`).
  - Playback is `SoundtrackPlayer` (`views/soundtrack.ts`); it never autoplays before `toggleSound()`.
  - The mute button is `createSoundtrackControl`; it's always in the DOM, just disabled when music is off.
  - The picker is `#room-soundtrack` in `MenuView.buildLighting()`.
  - The jukebox is scenery (`addToScene`), so taps reach it through the `tap` hook.

## Open questions

- Next interaction (owner to describe): what `+` does, and how the visitor earns free demo mode.
- Random drops / imports: 5-10 objects from other rooms arriving in a box to sort through (reuses the cardboard box). Not yet.
- Bigger slot tap targets on touch, if the new framing still feels small.
- Drum links to the about page: once hosted on that same origin, the preview policy refuses to iframe it ("Preview unavailable"). Point it elsewhere or special-case it.
- Making editing the room easy and fun from the demo (curate the edit tools).
- Per-visitor storage beyond localStorage; where starter links live (hardcoded now); policy for editing dropped-object links.
- Rocket model comes from main's toys (`views/toy-objects.ts`).

## Checklist

- [x] Multi-page routes, demo room, walk-in, locked tutorial, release, dock, locked links, persistence
- [x] Merge `origin/main` (toys, glow, icons and rename, preview blocklist, practice tutorials, VR button gating). Browser harnesses that need the sandbox point at `/dev/`.
- [x] `RoomView` hooks for this stage: `tap`, `keepSelectionOnPlace`, `canvas`, `overview`, floor tagging
- [x] Mobile-first framing (`tutorialView`: 55° FOV, 32° down, solved for aspect 0.46; camera about [8.3, 5.0, 7.5])
- [x] Cardboard box (`src/demo/cardboard-box.ts`, at `BOX_POS` [8.3, 0, 2.2]), hands, hint, vanish, old-save migration
- [x] Drag to look in the tutorial (±25° turn, ±12° tilt, eases back)
- [x] Walk mode (`src/demo/walk-mode.ts`, `src/core/walk.ts`: 65° FOV, eye 1.6m, WASD/arrows on desktop)
- [x] Demo always starts with the intro; after the tutorial it stays first person (no overview, no edit tools); `+` placeholder bottom right, `dev` link bottom left
- [x] Fixes: held object no longer covers the bench spots; a placed object no longer lifts away (`liftSelected: false`)
- [x] Grab-the-world drag (tutorial and walking); zoom as step back and up with wall and loft clamping
- [x] tsc clean, 289 tests pass, `vite build` green
- [ ] Teach the camera (drag, tap to walk, pinch) in the next interaction
- [ ] Owner visual check on phone and desktop: `/`, Skip during walk-in and during tutorial, `/dev/`
- [ ] `+` behaviour and earning free demo mode (next)
- [ ] Jukebox music (later)

## Trying it

- `/` always plays the walk-in and tutorial with a full box.
- Reset fully: delete the `mp-demo:*` keys in localStorage.
