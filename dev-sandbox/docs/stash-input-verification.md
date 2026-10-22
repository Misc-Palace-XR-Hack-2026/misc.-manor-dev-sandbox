# Stash kind / selection gesture regression

## Scope and baseline

Branch `fix/stash-kind-and-selection-input`, isolated worktree `/home/dvgpro/Projects/palace-stash-input-fix`, based on fetched `origin/main` **1b02ba0**. Configured origin is `Misc-Palace-XR-Hack-2026/misc.-palace-dev-sandbox` (not the requested `misc.-manor-dev-sandbox` spelling); no remote was changed. No push, merge, GitHub write, personal browser profile, live-preview change, or room-seed edit. The separate `palace-matt-room-update` worktree at `1a90850` was not modified or incorporated.

## Ranked hypotheses and evidence

1. **Kind is lost when its representation is removed. Confirmed.** `unplace` only removes placement; `pickUp` uses it and preserves kind. `stash` removes the representation, formerly the only persisted copy of kind. `bringOut` and `autoOrganize` recreate via `createRep`, formerly choosing only the content-type default. XR Put away/Stash and creation cancellation use the same Store stash command.
2. **Opening overlays during pointerup changes later event hit testing. Confirmed for Chromium touch.** A real raycast-selected object was positioned under each future action button center using camera translation. Trusted events on baseline were `pointerdown CANVAS`, `pointerup CANVAS`, then compatibility `mousedown`, `mouseup`, `click` on **stash**, **pick-up**, or **delete**. Stash/delete removed the representation; Pick up immediately held it. Mouse input at the same geometry did not reproduce in this Chromium, but is retained as regression coverage.
3. **Drag/cancel or capture state causes ordinary clicks to select incorrectly. Not the cause of the reproducing tap.** The trace has a completed stationary touch gesture. OrbitControls capture does not protect the later compatibility mouse hit test. Drag and trusted touch cancellation are independently covered.
4. **Serialization drops a preference. Rejected as primary cause.** No preference existed to serialize; immediate restore also reverted.

## Fix

- Add optional validated `ContentItem.lastObjectKind`, capturing the representation kind at the shared stash boundary before removal. `createRep` priority is explicit kind, remembered kind, then content-type default. All original media fields and content IDs stay unchanged. Existing `setKind` overrides remain effective through the next stash/restore cycle.
- Preserve schema version 1. Absent fields remain valid. Legacy placed objects acquire the preference on their next stash. Legacy inbox items without a preference still use defaults: already-lost historical kinds cannot be reconstructed. New exports/imports and local save reload retain the field; older app versions may ignore it and do not implement the new behavior. Representation IDs still regenerate on restore, as before; content IDs do not.
- Validate the pointerup gesture, but perform scene selection/placement only when its canvas click completes. Thus a newly opened sheet cannot receive the event that opens it. No timeout, disabled-button window, global click suppression, or changes to native button keyboard behavior. New pointerdown, pointercancel and window blur clear pending gesture state; nonprimary/non-left input is not a selection gesture.
- Existing save/backup/quota behavior is unchanged; this change does not redesign persistence recovery or guarantee persistence if storage reports failure.

## RED before production changes

1. New `stash-kind.test.ts`: save a link represented as guitar, choose robot, stash, reload and restore. **Failed: `book !== robot`**.
2. New `browser-selection-gesture.mjs` against baseline source: all six mouse/touch × Stash/Pick up/Delete scenarios traced with trusted input. **All three touch scenarios activated the new button.** Assertion run failed at `touch stash: selection must survive initial gesture` (selected null, representation missing). Mouse scenarios passed. This was a real browser regression, not synthetic invocation of view methods.

## GREEN and commands

Run from `dev-sandbox`:

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5207 --strictPort
ARTIFACT_DIR="$TMPDIR/stash-input-green" node tests/browser-selection-gesture.mjs
npm test
npm run typecheck
npm run build
MP_URL=http://127.0.0.1:5207/dev/ node tests/browser-desktop-chrome.mjs
MP_URL=http://127.0.0.1:5207/dev/ node tests/browser-mobile-chrome.mjs
MP_URL=http://127.0.0.1:5207/dev/ node tests/browser-tutorials.mjs
TEST_URL=http://127.0.0.1:5207/dev/ EVIDENCE_DIR="$TMPDIR/stash-vr-button" node tests/browser-vr-button.mjs
```

- **274 unit tests passed, 0 failed.** New persistence coverage includes all 51 object kinds through placed/unplaced/held/XR stash paths, local storage and JSON import/export, auto-organize, latest explicit kind changes, undo, full-room restore failure/retry, absent legacy fields and invalid preference rejection without replacing state. The practice invariant now explicitly allows preference metadata while checking every original media field unchanged.
- **Typecheck and production build passed.** Existing Vite large-chunk warning remains; npm reported blocked dependency install scripts, but installed esbuild, compilation and tests ran successfully. No dependencies changed.
- **Six trusted browser overlap scenarios passed**, mouse desktop 1440×1000 and touch mobile 390×844, each at the exact future button center. Selection survives; deliberate subsequent click/tap works; Enter and Space activate each action; mouse/touch drags do not select; CDP-delivered trusted pointercancel does not select; Escape restores picked-up objects. Real localStorage reload/restore preserves the stashed box kind on both devices. Zero page errors.
- **Desktop and mobile chrome suites passed.** Tutorial suite passed desktop, mobile, small-mobile and landscape: actual creation, kind picker, scene placement, move/cancel/stash/restore, imports, room changes, appearance changes, stale async work and personal-save isolation.
- **VR availability suite passed all ten device/capability combinations.** XR stash/restore shared commands are unit-tested; no physical headset was tested.

Browser uses `/usr/bin/chromium` with `--use-angle=gl --enable-webgl --ignore-gpu-blocklist`, fresh contexts only. Server process cwd was checked against this worktree; the regression also compares served source-map originals for main/view/store/types against local sources. Current landing uses `/`; the actual editable app is `/dev/`.

The overlap fixture exposes the actual RoomView through a test-only response rewrite, moves its camera (not its input handlers or raycaster), and hides unrelated floating utility controls so they cannot cover the test ray. Item-sheet buttons/layout remain unmodified. Restoring after browser reload uses the shared Store command; tutorial coverage separately exercises real Bring out buttons. Touch is Chromium emulation, not physical mobile Safari/Firefox validation.

## Independent re-verification (second session, port 5221)

The first session timed out before committing. Everything above was re-run from scratch on an
isolated dev server at `http://127.0.0.1:5221` (`--host 127.0.0.1 --strictPort`), whose process cwd
was checked to be this worktree and whose served source maps were compared against these files.
`origin` was fetched: this branch's base is exactly `origin/main` **1b02ba0** (0 commits ahead,
0 behind), so no rebase or merge was needed and no selection/stash code or test was reconciled.

RED was reproved by `git checkout 1b02ba0 --` on the three production sources only, keeping the new
tests in place so the suite total could not shrink:

1. **Bug 1, unit:** 274 tests, 265 pass, **9 fail**, including `'book' !== 'robot'` in
   `stash remembers the latest chosen kind across local save and JSON reload`.
2. **Bug 1, real browser:** the gesture suite failed at `undefined !== 'box'` after an actual page
   reload, i.e. the kind was absent from the real localStorage save.
3. **Bug 2, real browser trace (full baseline, PROBE_ONLY=1):** one trusted tap per scenario gave
   `pointerdown CANVAS, pointerup CANVAS, mousedown/mouseup/click` on **stash**, **pick-up** and
   **delete**; touch stash and touch delete left `selected=null` with the representation gone, touch
   pick-up was instantly held. All three mouse scenarios stayed on CANVAS.
4. **Bug 2, isolated assertion:** with the store fix applied and only `src/views/room.ts` at
   baseline, the three mouse scenarios passed and the run failed at
   `touch stash: selection must survive initial gesture` (`null` vs the representation id).

GREEN after restoring the fix: 274 unit tests pass / 0 fail; typecheck and build pass (build emits
the current multi-entry output — index, demo, dev, about, intro — with only the pre-existing
large-chunk warning); all six trusted mouse/touch overlap scenarios pass with selection surviving,
deliberate second click/tap working, Enter and Space working, drags not selecting and trusted touch
cancellation not selecting, zero page errors; `browser-desktop-chrome.mjs`,
`browser-mobile-chrome.mjs`, `browser-tutorials.mjs` (desktop, mobile, small-mobile, landscape) and
`browser-vr-button.mjs` (all ten device/capability combinations) pass.

Unresolved verification: touch is Chromium emulation plus CDP-dispatched trusted touch, not physical
mobile Safari/Firefox; no physical XR headset was exercised (XR stash/restore is covered only
through the shared Store commands in unit tests). Mouse input never reproduced bug 2 in this
Chromium build, so the three mouse scenarios are regression coverage rather than reproductions.

Evidence retained outside the repo at `/home/dvgpro/.hermes/artifacts/stash-input-fix/`: first-session `red/` and `green/` (results.json plus six screenshots each), `unit.log`, `tutorials/`; second-session `red2/` (full-baseline assertion run), `red2-probe/` (full-baseline trusted event traces), `red2-gesture/` (room.ts-only baseline), `green2/`, `green3/` and `tutorials-rerun/`. No SFX, pipe, glow, preview-policy, room seeds or tutorial production code changed.
