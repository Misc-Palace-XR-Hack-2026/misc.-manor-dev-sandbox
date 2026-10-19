# Scenes Mode — Phase 1 Implementation (Complete)

**Completed:** 2026-10-18
**Status:** ✅ Proof of concept ready for testing

---

## WHAT WAS BUILT

A minimal **Scene composition mode** layered on top of the existing dev sandbox that lets you:

1. **Create scenes** — Named compositions with a room layout and camera framing
2. **Frame shots** — Use orbit camera (0-360° azimuth, height offset, zoom) to frame exact shots
3. **Save scenes** — localStorage persistence, just like rooms
4. **Toggle mode** — Dedicated UI (sidebar + controls) separate from main room/menu

---

## ARCHITECTURE

### New Core Modules

**`src/core/scenes.ts`** — Scene data model
- `Scene` interface: room snapshot + camera state + effects
- Validation and normalization (mirrors room store pattern)
- `DEFAULT_CAMERA_STATE`: 45° azimuth, 0.5 height offset, 1.0 zoom

**`src/core/scene-store.ts`** — Persistence layer
- localStorage keys: `mp-sandbox:scenes:{sceneId}`
- Functions: `createScene()`, `loadScene()`, `saveScene()`, `deleteScene()`, `listSceneIds()`
- Mirrored from room store architecture

**`src/views/scenes.ts`** — Main SceneView component
- Left sidebar: scene list + create button
- Main area: 3D room view (powered by existing RoomView)
- Right panel: camera controls + save/delete
- Orbit slider (0-360°), zoom slider (0.5-3x)
- Vignette toggle
- Full scene description editing

**`src/views/room.ts`** (modified)
- Added `setCameraState(orbitAngle, orbitHeight, zoom)` public method
- Allows ScenesView to control camera position without manual interaction

### UI Integration

**Menu bar** — Added "Scenes" button
- Toggles Scenes mode on/off
- Hides menu + room when active
- Shows full-screen Scenes editor

**Wiring** — `src/main.ts`
- Creates `ScenesView` with scenes root container
- Exposes `toggleScenes()` globally for menu integration
- RoomView stays available (reused for 3D rendering in Scenes)

### Styling

**`src/style.css`** (added ~220 lines)
- Scenes container: flex layout, sidebar + main + controls
- Scene list items: hover/active states
- Camera controls: sliders with labels
- Delete/close buttons with distinct colors
- Responsive design

---

## SCENES MODE vs NORMAL MODE (CURRENT DESIGN)

Scenes mode is a separate, simplified view, not an overlay on normal mode. One class on `<body>`, `scenes-active`,
(set by `toggleScenes()` in `src/main.ts`) is the single switch.

**What scenes mode does NOT have:** audio/music button (room music stops on entry and resumes on exit), "Take photo",
the nav bar, the "+" button, VR / "VR not supported", the preview card, hover tooltips, the item sheet. These are hidden
by `body.scenes-active ...` rules in `style.css`, which also catch elements created later.

**Layout (nothing overlaps the 3D window):**
- Top HUD bar: scene name on the left, **Exit Scene Mode** and **Edit room** centered. Edit room opens the normal room
  editor panel.
- Left: scene list. Center: the room (objects only). Right: selected-object actions, camera sliders, scene notes, Save/Delete.

**Objects never move.** Scenes uses its own `RoomView` created with `{ scenes: true }`. In that instance `tick()` only
sets position/rotation/scale from the object's slot and its rotation value. There is no bob, no pull to center, no scale
change, no auto-rotate. A selected object just gets an emissive glow. Only the "Turn" slider rotates an object.
The hidden normal-mode `RoomView` stops animating/rendering while `scenes-active` is set.

**Selected-object actions live in the right HUD panel** (same actions as the normal item sheet): Edit, kind picker,
Pick up (then click a slot marker in the room to place it), Stash, Delete, plus Turn (rotation).

**Camera sliders mirror the real camera.** Every frame `ScenesView.syncCameraUi()` reads `RoomView.getCameraState()` and
writes the sliders, so dragging/scrolling in the 3D window moves them.
- Orbit slider and Tilt slider call `setCameraState(angle, tilt, <the camera's current zoom>)`.
- Zoom slider calls `RoomView.setZoom()` only. It never touches position or orbit.
- `getCameraState()` is the exact inverse of `setCameraState()`.
- Save Scene captures the current room layout (including edits made from the HUD), the camera, and rotations.

---

## HOW TO USE (WALKTHROUGH)

### First Time
1. Click **"Scenes"** in menu bar
2. Scenes mode opens fullscreen
3. Click **"+ New Scene"**
4. Name it (e.g., "Shot 1: Opening")
5. Scene created with default camera angle (45°)

### Frame a Shot
1. Scene loads with 3D room view
2. Adjust **Orbit slider** left/right to rotate around room
3. Adjust **Zoom slider** in/out for framing
4. Description field: add notes for this shot
5. Toggle **Vignette** if needed (for reference; can add in post)
6. Click **"Save Scene"**

### Later
- Scene list shows all saved scenes
- Click a scene to load it and adjust camera
- **Delete** removes it
- **Close Scenes** exits mode and returns to room

---

## DATA MODEL

```typescript
interface Scene {
  schemaVersion: number
  id: string                          // "scene_abc123def456"
  name: string                        // "Shot 1: Opening"
  description: string                 // Markdown notes
  baseRoom: RoomState                 // Full room snapshot
  cameraState: {
    orbitAngle: number               // 0-360° around room center
    orbitHeight: number              // Vertical offset (-1 to 1)
    zoom: number                     // 0.5-3.0
  }
  effects: {
    vignette?: boolean              // Visual effect flag
  }
  createdAt: string                   // ISO timestamp
  updatedAt: string                   // ISO timestamp
}
```

---

## TECHNICAL NOTES

### Camera System

- **Center orbit:** spherical orbit around the OrbitControls target (the room focus point)
- **`orbitAngle`:** azimuth in degrees, `atan2(dx, dz)`. 45° is the normal isometric view.
- **`orbitHeight` (Tilt):** elevation relative to the isometric elevation. 0 = normal iso view, each unit = 30°.
- **`zoom`:** `camera.zoom` (orthographic), 0.2-5. Independent of orbit and tilt.
- **Distance** from the target is preserved (it doesn't change what an orthographic camera sees).
- Default scene camera = `{ orbitAngle: 45, orbitHeight: 0, zoom: 1 }`, identical to normal mode.
  Scenes saved before this change used a different height convention and may look tilted.

### Room State

- Each scene stores a **deep copy** of the room at save time
- When loading a scene, `Object.assign()` replaces store state
- RoomView automatically re-renders via `store.select(null)`

### Storage

- Scenes saved independently in `localStorage`
- Backup key per scene (follows room pattern)
- List of scene IDs stored in `mp-sandbox:scenes`
- Active scene ID tracked in `mp-sandbox:active-scene`

---

## WHAT'S NEW (POST-PHASE-1)

✅ **Camera monitoring:** Manual camera adjustments (dragging, zooming) now update the orbit/zoom sliders automatically
✅ **Increased zoom range:** 0.2x to 5.0x (was 0.5x to 3.0x) for tighter framing
✅ **Object rotation:** Click objects to select them, then use rotation slider (0-360°) to orient them
✅ **Persistent rotations:** Object orientations saved with scene

## CURRENT LIMITATIONS (BY DESIGN)

- ❌ No timeline/keyframe animations (you'll do via real filming + post)
- ❌ No audio sync (sync in video editor)
- ❌ No multi-shot composition (one scene = one shot composition)
- ❌ No free camera (orbit only; can add later)
- ❌ No screenshot capture automation (record screen manually)

---

## NEXT PHASES (WHEN READY)

### Phase 2: Shots within Scenes
- Break each scene into multiple **shots**
- Each shot has own camera framing, notes, duration estimate
- Thumbnail screenshots per shot for reference
- Shot sequence visible in sidebar

### Phase 3: Effects & Export
- Vignette visual effect rendering
- Export scene as JSON (version control, sharing)
- Screenshot generation at scene save

### Phase 4: Advanced Camera
- Free camera movement (WASD + mouse)
- Camera path keyframing
- Zoom presets / named views

---

## FILES CREATED/MODIFIED

**New files:**
- `src/core/scenes.ts` — Scene model (91 lines)
- `src/core/scene-store.ts` — Persistence (98 lines)
- `src/views/scenes.ts` — ScenesView component (280 lines)

**Modified files:**
- `src/main.ts` — Import + wire scenes (~10 lines added)
- `src/views/menu.ts` — Add Scenes button (~10 lines added)
- `src/views/room.ts` — Add `setCameraState()` method (~30 lines added)
- `src/style.css` — Scenes styling (~220 lines added)

**Total new code:** ~600 lines across TypeScript + CSS

---

## TESTING CHECKLIST

- [ ] Click "Scenes" button, mode opens; no audio button, Take photo, nav bar, +, VR pill
- [ ] Top bar shows Exit Scene Mode + Edit room in the center; Edit room opens the room editor
- [ ] Clicking an object only makes it glow (no movement); selected-object panel appears at right
- [ ] Edit / kind / Pick up (then click a slot) / Stash / Delete work from that panel
- [ ] "New Scene" creates scene with default camera (sliders read 45° / 0 / 1.00x, view matches normal mode)
- [ ] Orbit slider rotates view smoothly with no jump
- [ ] Zoom slider changes only zoom (orbit and tilt sliders do not change, view doesn't swing)
- [ ] Dragging/scrolling in the 3D window moves the sliders
- [ ] Description edits work
- [ ] "Save Scene" persists to localStorage
- [ ] Reload page, scene persists
- [ ] "Exit Scene Mode" returns to room mode (audio resumes)
- [ ] Multiple scenes can be created and listed
- [ ] Clicking a scene loads it
- [ ] Delete removes scene
- [ ] Browser console: `window.scenesView` accessible for debugging

---

## NOTES FOR NEXT SESSION

1. **Start with intro scene:** Create "Opening: Vignette" scene and test framing
2. **Document shots:** For each storyboard shot, list:
   - Scene name
   - What's visible (objects, layout)
   - Camera angle (orbit/height/zoom estimates)
   - Notes (e.g., "Remove comic", "Add preview in post")
3. **Then implement shots:** Add shot-level data structure under scenes (Phase 2)
4. **Capture workflow:** Screen record each shot scene → edit in Premiere with real footage

---

**Ready for trailer production!**
