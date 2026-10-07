# Dev Sandbox Plan

Status: scaffold built and ready for team playtesting.

## Why this exists

Misc. Palace is a playful room where users arrange saved media (links, videos, music, files) as objects. The core experience is tinkering with rooms and objects. Each dev (German, Levi, Jawen, Daniel) needs this tinkering loop at hand and speaking the same language as future users.

The sandbox gives each dev a room to build, customize, and share from day one. Rooms and visuals change constantly—that's the point. What stays stable is the data model: media saved as objects with stable IDs, placements that map to any visual representation, and the ability to export and carry rooms into the final product.

## Principles

1. **Data first.** Rooms, objects, and placements live in versioned JSON. Views are disposable.
2. **Views are replaceable adapters.** A view draws room state and sends commands back to core. It holds no truth of its own.
3. **Menu view always works.** If the 3D room breaks, devs can still save, find, and organize their stuff.
4. **Simplest tools now.** Plain Three.js, Vite, TypeScript. No WebXR, IWSDK, Babylon, or backend this week.
5. **Git is the share mechanism.** One room file per dev, no merge conflicts.
6. **Ugly is fine.** Primitives and placeholder colors until the loop feels good.

## Architecture

Single Vite + TypeScript app at `dev-sandbox/` (the repo root also holds `pitch-off-materials/` and the build docs):

```
index.html, package.json, tsconfig.json
rooms/                 one JSON file per dev, plus sample.json
                       (auto-listed in "Load repo room" dropdown)
src/core/              engine-free
  types.ts             schema
  layout.ts            room as boxes + slots
  store.ts             state, commands, undo, validation,
                       localStorage save with atomic backup
  content.ts           type guessing, safe URLs
  bookmarks.ts         browser bookmark HTML parser
src/views/
  menu.ts              2D DOM view, always works
  room.ts              plain Three.js isometric view (replaceable)
  objects.ts           primitive placeholder objects
src/main.ts, src/style.css
```

**Rule:** `src/core` never imports Three.js or touches the scene. Views only draw store state and send commands back.

## Data Model

| Entity | Purpose |
| --- | --- |
| ContentItem | Media: `id`, `type`, `title`, `sourceKind`, `sourceRef`, `tags`, `createdAt` |
| Representation | The object showing it: `id`, `contentItemId`, `objectKind` (book, record, tv, etc.) |
| Placement | Where it sits: `representationId`, `slotId` (no placement = held in hand) |
| Room | `id`, `owner`, `layoutId`, `schemaVersion` plus the three lists above |

**Rules:**
- Stable IDs throughout the room's lifetime.
- Moving an object changes placement only; never the content.
- Stashing an object removes it from the room but keeps its content in the inbox; only Delete removes content.
- One object per slot; placing onto an occupied slot swaps the two.
- Every change is undoable. Each save keeps the previous save as a backup, and a bad or corrupt file is rejected with a readable message instead of loaded.
- Include `schemaVersion` in every file for future migration.

### Room as data

The reference image (`pitch-off-materials/references/isometric-vibey-room-idea-zoom.jpeg`) was rebuilt by eye as a list of boxes (position, size, material) plus named slots (id, label, position) in `src/core/layout.ts`. No source model file exists, and image-to-3D was skipped on purpose because slots are needed anyway. This approach:
- Keeps no hidden file format; everything is transparent JSON.
- Gives semantic placement spots that auto-layout tools cannot produce.
- Ports to any engine (Babylon, WebGPU, etc.) without touching saved placements.
- Later: a modeled GLB can replace the box list while slot IDs stay stable.

## Week 1 Schedule

| Day | Goal | Done when |
| --- | --- | --- |
| 1 | Scaffold built; first playtest and polish | Team tests the core loop: add, place, move, save, reload |
| 2 | Menu and 3D room verified by team; rough out issue list | All four devs confirm both views show the same room state |
| 3 | Bookmark import, type mapping, auto-organize | A real bookmark export populates a room in under 1 min |
| 4 | Polish placement UX, test undo/export/import | Moves feel responsive; saves survive reloads reliably |
| 5 | Each dev builds their own room, fills it | Four people tinkering with four rooms in parallel |
| 6 | Devs commit rooms to git, load each other's work | Four room files in `rooms/`; teammates load them via dropdown |
| 7 | Buffer, screenshots/footage, retro, next steps | Written list of what stays, rewrites, or ships |

## Default Object Set

Book, photo frame, record player, TV, boombox, cardboard box, plant, mug, notebook, trophy. Each is a primitive or simple GLB with a preview of its media (thumbnail or title) regardless of shape.

## How to run

```
cd dev-sandbox
npm install
npm run dev
```

Open the printed localhost URL. From the menu, add a URL, assign it an object, and click to place it in the 3D room.

## How to share your room

Click **Export room**, save the JSON into `rooms/<yourname>.json`, and commit. Teammates pick your room from the **Load repo room** dropdown.

## Out of scope for week 1

WebXR and headset support, IWSDK, Babylon, backend or auth, live sharing, OAuth connectors, avatars and movement, zip/folder upload, cul-de-sac of rooms.

## Later (not committed)

- IWSDK for grab, locomotion, and emulator if the demo must be headset-capable.
- Babylon adapter (only `src/views/room.ts` changes).
- Shared shelf from `shared/` folder.
- Zip and folder upload; real "magic cleanup".
- Replace box list with a modeled GLB room.

## Open Questions

- **Roles:** Who leads coordination, video, design, programming? Who is second on each?
- **Placement model:** Does slot-based placement stay, or move to free/grid?
- **Headset requirement:** Must the demo run on a headset? (Decides IWSDK adoption.)
