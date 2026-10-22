# Misc. Palace Sandbox — Developer Standards

## 1. Rooms

A room belongs to one person. The fixed set of room slots:

| Room ID | Display Name | Seed Repo Room | Purpose |
|---------|--------------|----------------|---------|
| guest | Guest room | — | Landing room for new users; starts EMPTY locally |
| german | German's room | german | Dev personal room |
| matt | Matt's room | vinyl-lounge | Dev personal room |
| levi | Levi's room | creative-atelier | Dev personal room |
| jawan | Jawan's room | garden-notebook | Dev personal room |

**How it works:** Display names are stored in `RoomState.owner` and are editable by room owner. On first load, each dev room seeds from `rooms/<id>.json` if committed; otherwise from the seed's starter content (Guest room has no seed). Each room saves independently on its own localStorage key (see `roomKeys()` in store.ts). The last open room is remembered via `ACTIVE_KEY`.

**Sharing:** Export room JSON → commit as `rooms/<roomId>.json` (e.g., `rooms/german.json`).

## 2. Look, Lighting, Layout

All three are **independent per-room selections** tied to the room only, never to who owns it.

### Theme
A preset bundle: floor/wall/background surfaces + lighting. Applying a theme is one undo step (`Store.applyLook`); each part can be changed after. Six themes. `default` is the look a new Guest room starts with (original finishes, original lighting), so it can be picked to return to that look:

| Theme ID | Label |
|----------|-------|
| default | Default |
| curious-web | Curious web |
| garden-notebook | Garden notebook |
| greenhouse-conservatory | Greenhouse conservatory |
| creative-atelier | Creative atelier |
| vinyl-lounge | Vinyl lounge |

### Layout
Currently one only: `cozy-loft`, a 10.3 × 7.3 meter rectangle with ~32 slots (floor, loft, stairs, bench, shelf). **Layout contract:** slot IDs are stable forever; layouts may only ADD slots, never rename/move/remove, because saved placements reference them by ID.

A layout picker comes later.

## 3. Data Model

- **ContentItem** – the media itself (link/article/image/video/music/doc/file/note/tool). Never changes when moved or swapped. Contains title, URL or note text, optional `imageData` (PNG/JPEG), tags, and metadata.
- **Representation** – the visible object standing in for a ContentItem (book/photoFrame/record/tv/etc.). Stores `objectKind` (one of 28 kinds, see `OBJECT_KINDS` in types.ts).
- **Placement** – where a Representation sits: `{ representationId, slotId }`. No placement = held/unplaced.
- One ContentItem → max one Representation (per-room). Placing onto occupied slot swaps.
- **Stash vs. delete:** `Store.stash()` removes the object from layout but keeps content in inbox. `Store.deleteContent()` removes both forever.
- **schemaVersion** – currently 1. Validation rejects mismatches.
- **Core principle:** src/core imports no three.js or DOM; views only draw state and send commands.

## 4. Interaction Vocabulary

Use these terms consistently in UI and code:

- **Pick up** – move an object (triggers `Store.pickUp`).
- **Edit** – modify content (title, URL, imageData).
- **Open link** – launch URL in new tab.
- **View** – focus/zoom on object for inspection.

**Edit-room mode** vs **Preview mode** (desktop/mobile):

- A fresh page starts in **Edit-room**, preserving the existing editing workflow. **Preview** in the room chrome (or **Preview room** inside the editor) enters read-only browsing. **Edit room** explicitly leaves Preview and opens the editor. Close an inspected item's card to reveal the room chrome again.
- Preview keeps object selection/inspection, embedded previews and **Open link**, room switching, the session speaker control and **Take photo**. It hides Edit / Pick up / Stash / Delete, rename, kind selection, add/import, Undo, room/style/music editors and the editing tutorial. The room still fills the viewport; chrome and inspect cards remain overlays on desktop and mobile.
- Store mutation commands are guarded as well as the UI: stale click handlers and delayed work cannot write a room while Preview is active. Switching to Preview restores a picked-up object before locking edits, closes editor sheets and discards an unsaved content-editor draft. The content dialog's Preview room button explicitly offers this exit; saved changes are not undone. In-flight imports/photo/surface work is invalidated even if the user returns to Edit-room before it finishes.
- Mode is **session-only**: retained when switching rooms, reset to Edit-room on reload. It is not a room field or localStorage preference; room JSON, schemaVersion, save keys and saved links are unchanged. Browsing another room may update the existing last-open-room preference, but does not overwrite either room's content save.
- **VR Preview is deferred.** The visible Preview notice says desktop/mobile only, and VR entry is disabled until the user explicitly returns to Edit-room. Existing headset object/menu actions are unchanged; this is not a headset read-only guarantee or a security/permissions boundary.

Run `node tests/browser-interaction-mode.mjs` against an isolated dev server (`MP_URL` overrides its default `http://127.0.0.1:5187`). It checks desktop 1440×1000 and mobile 390×844, safe inspection/Open, editor/action visibility, room navigation, pickup restoration, draft cancellation, delayed import invalidation and reload behavior. `MP_SCREENSHOTS` overrides the evidence directory. Real headset and iOS Safari behavior still require device testing.

**Safety rule:** Picking up an object and dropping it on an invalid location, pressing Esc, or selecting another object **returns** it to original slot (`Store.pickUp` → `Store.cancelPickup`). Objects must never silently vanish.

New objects (Add object, import, bookmarks) go to first free slot. If room is full, they remain in inbox list.

### Preview card
Every selected object shows a card. It docks above the item sheet (bottom-right of the screen); with no sheet open it floats above the object, anchored to its slot so it stays steady while the object bobs. `buildPreview()` (core/preview.ts) maps a ContentItem to one of four shapes:
- **embed**: a sandboxed iframe, for hosts known to allow framing: YouTube (privacy-enhanced player), Vimeo, Spotify, SoundCloud, and Wikipedia articles. Embeds are interactive, so a video can be played in the card.
- **image**: thumbnail for a local photo or a direct image URL.
- **note**: title plus an excerpt.
- **card**: favicon + domain + title for any other link, or the stored name for files.

**Why an allow-list:** a browser can't read another site's `X-Frame-Options` / `frame-ancestors`, so framability can't be detected per URL (GitHub and MDN both send `X-Frame-Options: deny`). To add a host, confirm with `curl -I` that it sends no frame-blocking header (or has a documented embed URL), then add it to `embedFor()` with a test. Embed URLs are always rebuilt from parsed ids on the provider host, never passed through from user input.

**Fallback art:** when there is no embed or thumbnail (plain links, files, notes, or an image that fails to load), the card shows a "hero": an icon for the MEDIA (never the room object), captioned with what it is, tinted per media type. `mediaArt()` (core/media-art.ts) picks it from the content type, refined by file extension (PDF, archive, code...) or well-known host (video, music, repository...), e.g. "Video · youtube.com". The card and item sheet share one flex column (`.item-dock`, bottom-right) with the card first, so layout stacks them and they cannot overlap; there are no measured positions to go stale. Whole sites confirmed framable go in `FRAMABLE_SITES` (core/preview.ts); `gungo.dev` is the first.

Only http(s) URLs are used. Images load with `referrerPolicy=no-referrer`, favicons come from the site's own origin (no third-party favicon service), and the card is built with `textContent` only.

## 5. Audio

- Music never starts on its own; silent until the user presses the speaker once.
- After that, it follows room's lighting (via `currentTrack()`) unless manually muted.
- Explicit mute (mode: 'off') stays muted across room switches.
- Soundtrack state: `{ mode: 'follow' | 'off' | 'track'; track?: RoomTrack }`.

## 6. Adding Things

The **+** button (bottom right) shows:
- **Add object** – single entry (link/note/file/media) → placed in first free slot.
- **Import from bookmarks/files** – bulk import with optional auto-placement.

**Files/folders:** Stored by name or relative path only (browser does not expose real paths; file bytes are not copied). Opening the actual file is a later feature (see Open decisions).

## 7. Testing and Conventions

- `npm test` – must pass before PR.
- `npm run typecheck` – must pass before PR.
- `npm run build` – must pass before PR.
- Add a test for any new Store command.
- Keep src/core free of DOM/three.js imports.
- `?debug=1` – shows debug panel.

## 8. Open Decisions

| Decision | Context |
|----------|---------|
| Glued action popup & click-hold-drag | Omari's idea; needs formal interaction spec. |
| Previews for arbitrary pages | Only allow-listed hosts get an iframe, and generic links get an info card, because most sites forbid framing. A real page thumbnail/og:image needs a server-side screenshot/metadata service (CORS blocks fetching it from the browser). |
| Thumbnail caching | Not built (deliberately skipped). Previews are built on selection; revisit if remote thumbnails feel slow. |
| Local file access | File System Access API (Chromium only, handles in IndexedDB, permission re-prompt per session) vs. name-only storage. |
| Photo storage scaling | localStorage ~5 MB limit; IndexedDB likely needed for growth. |
| More layouts | Iconic pop-culture rooms (Drake & Josh, Scarface desk, etc.); inspiration-only, no logos/copied assets. |
| Built-in furniture/structures | Shelves, bookshelves as room components (not selectable objects). |
| Procedural generation | See docs/procedural-room-generation-plan.md. |
| Drop-from-above on layout change | Objects fall from above when switching layouts to signal re-organization needed. |
| Magic auto-organize animation | Objects fly one-by-one into sorted positions smoothly (not instant, not too slow). |
