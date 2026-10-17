# Meta Quest VR implementation plan

Status: first VR slice on `feat/quest-webxr`. Desktop editor remains the default. Quest hardware acceptance is still pending.

## Outcome

Enter the existing palace at human scale in the Quest browser, look around with head tracking, teleport between safe floor/loft locations, select any content object, assign its representation, move it to a slot, undo, stash/restore, and retain the result after leaving VR and reloading.

Use Three.js + WebXR, not a Unity rewrite or a native APK. Keep the desktop isometric editor and the same room data. VR is another way to interact with the same environment, not another appearance theme.

Assumptions to confirm before hardware acceptance: Quest model, Quest OS/browser version, controller availability, and whether the headset is on the desktop's LAN or a remote network. Controllers are the first input target. Hand tracking is deferred.

## Current code and gaps

- `src/views/room.ts`: Three.js scene, orthographic camera, OrbitControls, pointer raycasting, lighting, object reconciliation and an existing `setAnimationLoop`. No XR session or controller input.
- `src/core/layout.ts`: roughly meter-based boxes and stable placement slots. The open diorama and tall stair steps are not a locomotion mesh; placement circles are not teleport destinations.
- `src/core/store.ts`: shared content, representations, placement/swap, stash, undo and JSON persistence. Preserve this authority rather than making an XR-only copy.
- `src/views/objects.ts` and `study-decor.ts`: reusable object geometry. Current objects face the isometric camera and selected objects bob/rotate; adapt presentation for comfortable first-person inspection.
- `src/views/menu.ts`: DOM controls. These are not sufficient inside immersive VR; implement the essential controls as world-space UI.
- Current remote preview uses HTTP. That link can display the editor but is not a secure headset WebXR deployment.

## Architecture

One Store, one scene model and one renderer, with desktop and XR input adapters.

Suggested modules (names may change after the first tested slice):
- `views/room-scene.ts`: shared room/object construction, lighting, synchronization, semantic hit targets.
- `xr/session.ts`: capability checks, user-initiated entry/exit, perspective camera, player rig, reference space and cleanup.
- `xr/input.ts`: controller rays and actions, handedness, connection/disconnection, interaction mode arbitration.
- `xr/locomotion.ts`: safe landing regions, teleport and snap turning.
- `xr/panel.ts`: world-space inventory, selected-object details and commands.
- `core/interaction.ts`: shared selection/place/cancel commands where extraction reduces duplication.

Keep renderer and session ownership explicit; do not create duplicate animation loops, subscriptions or WebGL contexts. The desktop camera remains orthographic; XR uses a perspective camera and runtime-provided eye poses/projections. OrbitControls must not update the XR camera. Move the player rig for locomotion, not the headset's tracked pose.

Persist content and placements through the existing schema. Player pose, controller hover and placement ghosts are transient. If a later feature needs persisted orientation, introduce a validated optional field and migration rather than changing slot meanings.

## Milestones and acceptance gates

### 1. Secure access and immersive entry

- Choose headset access without exposing personal room data publicly: trusted LAN HTTPS, a private HTTPS endpoint reachable from the headset, or USB localhost forwarding for tethered development.
- Tailscale HTTPS requires both a valid certificate and a working route from the headset; a laptop's Tailscale connection does not make Quest routing automatic. Test access on the actual headset first. Do not enable public Funnel by default.
- Detect secure context, `navigator.xr` and support for `immersive-vr`. Offer an explicit Enter VR button and useful unsupported/permission-denied messages.
- Enable renderer XR; use the existing animation loop. Request `local-floor`, with an explicit documented fallback if unavailable. Avoid adding a second eye-height offset to tracked floor-relative height.
- Add safe initial position and heading; disable desktop controls during the session and restore the desktop view on exit.
- Handle session end, focus/visibility changes and input reconnection. Cancel incomplete interactions without changing placements.

Gate: on Quest, stereo head tracking works at plausible scale; enter/exit/re-enter works; desktop editing and saved-room IDs remain intact. An enabled button or emulator is not sufficient evidence.

### 2. Controller selection and slot placement

- Use WebXR controller target rays and grip poses; identify handedness/input profiles rather than assuming controller index means left or right.
- Trigger selects an object; highlight its name and representation. Trigger on a valid slot commits via Store.place, retaining existing swap rules. Provide explicit Cancel.
- Separate object-hit and destination-hit queries; enforce room occlusion so objects cannot be selected through walls or platforms.
- Keep a placement ghost outside persisted state. Invalid drops, session exit or controller loss must not lose the original placement.
- Support all object kinds, including furniture, without a decor-only category. Use accessible hit targets without making them visible or shadow-casting.
- First slice is ray-based pickup/place, matching the existing app. Near-hand grab is a later enhancement, not required to prove the shared placement model.

Gate: every representation can be selected and moved; occupied slots swap correctly; cancel, undo and stash preserve content and IDs; controller disconnect during movement is safe.

### 3. Comfortable navigation

- Default to teleport plus snap turn; no forced smooth movement or camera animation.
- Define separate walkable landing regions for the ground floor and loft, with room bounds, edge margins, obstacle footprints and head clearance.
- Never treat decorative stairs or all upward-facing meshes as valid landing surfaces. Exclude furniture and areas underneath the loft with insufficient clearance.
- Move the rig so the tracked user's floor position lands at the destination, including room-scale offset. Snap turn around the user's current tracked position.
- Provide a visible invalid-destination cue and Home/recenter command. Support stationary/seated operation without requiring real-world walking or crouching.
- Keep teleport and placement modes unambiguous; controller commands must not move the user when they intend to place an item.

Gate: user can reach both levels without clipping, unintended falls or camera jolts. Real-world guardian/boundary safety remains the headset's responsibility.

### 4. Essential VR tools and content access

- Add a controller-opened world-space panel, comfortably positioned in front of the user rather than permanently locked to the face.
- Include selected title/details, all object kinds, inventory/stashed items, place/cancel, stash/restore, undo, lighting and exit VR.
- Use readable text, clear focus, generous ray targets and a visible save-failure message. Retain existing URL safety checks.
- Display local photos and book titles in-world. For external links, use an explicit handoff: save first, exit immersive mode when required, then let the user activate the browser link. Do not assume popups or DOM overlays work inside VR.
- Keep bulk bookmark import, file upload and JSON file management in the browser editor for the first release; explain that workflow in the panel.

Gate: a user completes the core placement/assignment loop without removing the headset. External-link handoff is explicit and does not lose edits.

### 5. Quest rendering and first-person quality

- Inspect scale, readable surfaces, normals, object back faces, clipping and the open diorama from human height. Preserve the existing environment and palette; do not turn VR into a new theme.
- Remove constant selected-object bob/spin in VR. Keep object orientation stable rather than chasing the user's head.
- Profile representative furnished rooms, photos and each lighting preset on the actual Quest model.
- Start with one shadow-casting key light, reduced shadow-map/texture budgets and conservative rendering resolution. Avoid multiplying candle point lights; prefer emissive material or a bounded lighting budget.
- Tune resolution/foveation only where supported. Record render calls, triangles, texture memory indicators and observed frame stability. Optimize semantic assemblies without losing per-object interaction/disposal.
- Establish a refresh target for the tested headset/session, initially aiming at stable 72 Hz where available; higher refresh is optional and must be measured. Do not label desktop FPS as headset performance.

Gate: a representative room remains comfortable in a sustained headset session, text is legible, and re-entering/reloading does not cause accumulating resource problems. Visual acceptance remains a separate user review.

### 6. Regression and release evidence

- Model tests: common interaction commands, swap/cancel/undo, all kinds, migrations, no invalid pose data entering saves.
- Desktop integration: existing browser smoke continues passing; unsupported XR leaves the editor usable; session lifecycle cleanup is tested with mocks/emulation where useful.
- Hardware checklist: entry/exit/re-entry, head tracking, both controllers, floor alignment, seated use, both levels, occlusion, all kinds, stash/restore, content handoff, focus loss, controller loss, save/reload, performance and comfort.
- Record headset model, OS/browser versions, URL/access method, branch/commit and evidence for each hardware run.
- Storage is browser/origin-local, not automatically synchronized between PC and Quest. Use existing JSON export/import to seed the headset. HTTPS origin changes may require explicit data migration/export; do not promise cross-device shared state.
- Share a tested private HTTPS link and short controller guide. Push the feature branch only when requested; no merge to main without approval.

Gate: automated regression checks pass, actual Quest testing covers the complete loop, and unresolved visual/performance issues are stated rather than hidden behind an Enter VR button.

## Deferred

Hand tracking, physics/free throwing, continuous freeform furniture transforms, passthrough/MR, multiplayer, cross-device account sync, in-headset bulk text/file entry, native packaging, and Vision Pro certification. Do not remove controller or desktop support to make room for these.

## Recommended first deliverable

Ship milestones 1–2 as the first testable slice: secure access, human-scale entry, controller selection, move one armchair between existing slots, undo, exit and reload the same saved placement. Then add safe locomotion and the essential panel before calling the VR MVP complete.

## Technical references

- Three.js WebXR setup: https://threejs.org/manual/en/how-to-create-vr-content.html
- Three.js WebXR basics and headset HTTPS requirement: https://threejs.org/manual/en/webxr-basics.html
- MDN secure contexts: https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts

The plan is grounded in the current repository. Target-device capability, routing and performance remain unverified until tested on the user's headset.
