# Feature Plan: File Storage & Sharing Infrastructure

## Executive Summary

Current state: Everything stored in localStorage as base64 (max ~5-10 MB per room). No sharing, no collaboration, no cloud persistence.

Goal: Build a robust, user-friendly system for:
1. **Personal room persistence** across devices and browsers
2. **Room sharing** with other devs (read-only or collaborative)
3. **File optimization** for uploads (images, documents, media)
4. **Preview caching** for fast load times
5. **Easy collaboration** on room designs and object placement

**Recommended tech stack:** Supabase (PostgreSQL + Realtime + Storage) + local-first caching

---

## Problem Analysis

### Current Limitations
1. **Storage**: 5-10 MB localStorage limit → can't store large files or many images
2. **Portability**: Base64 in JSON → room data isn't portable across devices
3. **Sharing**: No way to share a room with someone else
4. **Collaboration**: No real-time sync; single-device only
5. **Media handling**: All images embedded → bloat; no separate file storage
6. **Thumbnails**: Generated on-demand; no caching layer

### Why Supabase?
- **PostgreSQL**: Structured data (rooms, users, placements) + full-text search
- **Realtime**: Live collaboration (if desired later)
- **Storage**: S3-compatible file hosting for media
- **Auth**: Built-in user management (JWT)
- **Reasonable free tier**: 500 MB storage, 1 GB/month bandwidth

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────┐
│  Browser (Misc Palace)                          │
│  ┌───────────────────────────────────────────┐  │
│  │ LocalStorage / IndexedDB (cache)          │  │
│  │ - Room state (quick load)                 │  │
│  │ - Thumbnail cache (avoid re-rendering)    │  │
│  └────────────────────┬──────────────────────┘  │
│                       │                          │
│  (Auto-save on change, sync on idle)            │
│                       │                          │
└───────────────────────┼──────────────────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │   Supabase            │
            │  ┌─────────────────┐  │
            │  │ PostgreSQL      │  │
            │  │ - rooms         │  │
            │  │ - objects       │  │
            │  │ - permissions   │  │
            │  │ - users         │  │
            │  └─────────────────┘  │
            │  ┌─────────────────┐  │
            │  │ Storage (S3)    │  │
            │  │ - Images        │  │
            │  │ - Documents     │  │
            │  │ - Thumbnails    │  │
            │  └─────────────────┘  │
            │  ┌─────────────────┐  │
            │  │ Realtime        │  │
            │  │ (future: live   │  │
            │  │  collab)        │  │
            │  └─────────────────┘  │
            └───────────────────────┘
```

---

## Data Model

### Supabase Tables

#### `users`
```sql
id UUID PRIMARY KEY
email TEXT UNIQUE
displayName TEXT
avatarUrl TEXT (optional, from local photo)
createdAt TIMESTAMP
```

#### `rooms`
```sql
id UUID PRIMARY KEY
ownerId UUID (FK users.id)
title TEXT
description TEXT (optional)
isPublic BOOLEAN (default false)
isCollaborative BOOLEAN (default false)
thumbnail TEXT (S3 path to preview image)
createdAt TIMESTAMP
updatedAt TIMESTAMP
data JSONB (
  {
    layout: string (id),
    theme: string (id),
    lighting: object,
    surfaces: { [target]: { preset, imageId? } },
    contentItems: [{ ... with imageId instead of imageData }],
    representations: [...],
    placements: [...]
  }
)
```

#### `roomMembers`
```sql
id UUID PRIMARY KEY
roomId UUID (FK rooms.id)
userId UUID (FK users.id)
role ENUM ('owner', 'editor', 'viewer')
addedAt TIMESTAMP
```

#### `mediaAssets`
```sql
id UUID PRIMARY KEY
roomId UUID (FK rooms.id)
uploadedBy UUID (FK users.id)
filename TEXT (original)
mimeType TEXT
size INT (bytes)
s3Path TEXT (e.g. 'rooms/{roomId}/{id}.jpg')
width INT? (for images)
height INT? (for images)
thumbnailPath TEXT? (cached small version)
createdAt TIMESTAMP
```

---

## Phase Implementation Plan

### Phase 0: Local-First Foundation (Week 1)
**Goal:** Decouple imageData from room JSON; prepare for cloud migration

**Changes:**
1. Add `imageId` field to ContentItem (UUID reference to media asset)
2. Keep `imageData` as fallback for offline use
3. Create `MediaStore` class to manage local + remote media
4. Use IndexedDB for thumbnail cache (fast retrieval)
5. Auto-migrate: scan existing rooms, generate IDs, cache thumbnails

**Files affected:**
- `src/core/types.ts` - add `imageId?: string` to ContentItem
- `src/core/media-store.ts` - **NEW** local cache layer
- `src/views/photo-upload.ts` - when user uploads, store locally first
- `src/core/store.ts` - serialize/deserialize with imageId

**No UI changes yet.** Still localStorage; just prepare the schema.

---

### Phase 1: Supabase Integration (Week 2-3)
**Goal:** Cloud persistence with offline fallback

**Changes:**
1. Set up Supabase project, define tables
2. Add auth (email/password or anonymous)
3. Create `SupabaseSync` class:
   - Push room changes to DB (debounced)
   - Pull changes from DB (on load, periodic check)
   - Conflict resolution (last-write-wins for now)
4. Upload images to S3 on save (background job)
5. Generate thumbnails on server (Supabase Edge Functions)
6. Cache S3 URLs locally to avoid repeat queries

**Files affected:**
- `src/core/supabase.ts` - **NEW** client setup
- `src/core/supabase-sync.ts` - **NEW** auto-sync logic
- `src/views/auth.ts` - **NEW** login/signup UI
- `src/views/room.ts` - integrate sync, handle offline
- `src/core/store.ts` - emit events for sync layer

**UI changes:**
- "Sign in" button (top-right corner)
- "Save to cloud" badge / indicator
- "Sharing" button on room

---

### Phase 2: Room Sharing (Week 4)
**Goal:** Share rooms with others, see public gallery

**Changes:**
1. Add sharing modal:
   - Generate share link (public read-only)
   - Invite specific users (set permissions)
   - Copy link or email invite
2. Create public room browser:
   - Filter by owner, theme, etc.
   - Search by title/description
   - View thumbnail preview
3. Permissions enforcement:
   - Check `roomMembers.role` on every operation
   - Owner: full edit
   - Editor: move/edit objects, but not delete room
   - Viewer: read-only

**Files affected:**
- `src/views/share-modal.ts` - **NEW** share UI
- `src/views/room-browser.ts` - **NEW** public gallery
- `src/core/permissions.ts` - **NEW** check access
- Backend rules (Supabase Row Level Security)

**UI changes:**
- Share button next to room title
- Browse public rooms menu
- Permission indicators on shared room

---

### Phase 3: Real-Time Collaboration (Week 5-6, future)
**Goal:** Multiple users edit same room live

**Changes:**
1. Switch to Operational Transformation (OT) or CRDT for conflict resolution
2. Listen to Realtime pubsub channel: `room_{roomId}_changes`
3. Apply remote changes optimistically, then validate
4. Show user cursors/selections (who's editing what)

**Complexity:** High. Can defer to later.

---

## File Handling Strategy

### Current Flow (localStorage)
```
User uploads photo
  ↓
validate (max 1.5 MB, PNG/JPEG, 1024px)
  ↓
convert to base64
  ↓
store in ContentItem.imageData
  ↓
save room JSON to localStorage
```

### New Flow (Hybrid)

**During edit (offline-friendly):**
```
User uploads photo
  ↓
validate
  ↓
store in IndexedDB temporarily (with UUID imageId)
  ↓
update ContentItem.imageId
  ↓
save room to localStorage immediately (small JSON + local UUID)
  ↓
generate thumbnail in worker, cache locally
```

**On sync (background, low priority):**
```
Check for unsync'd media (imageId with no S3 path)
  ↓
upload to Supabase Storage (`/rooms/{roomId}/{imageId}.jpg`)
  ↓
update mediaAssets table with S3 path
  ↓
sync room to rooms.data in DB
  ↓
cleanup: delete local cache after confirmed upload
```

**On load (smart cache):**
```
Load room JSON from localStorage (fast!)
  ↓
Check if cloud version newer (updatedAt)
  ↓
If online and newer, fetch remote version
  ↓
For each media: try IndexedDB cache first, fallback to S3 URL
  ↓
Lazy-load S3 images (intersection observer)
```

---

## Thumbnail Strategy

### Current
- Generated from original on-demand (slow on first view)
- No caching

### Proposed
1. **Local cache (IndexedDB)**
   - Store 200x200px preview as blob
   - Instant load from disk
   - TTL: 30 days or until source changes

2. **Server-side generation (Supabase)**
   - On upload, trigger Edge Function to generate thumbnails
   - Store as separate asset: `{imageId}-thumb.webp` (smaller, faster)
   - Client requests thumbnail URL from DB

3. **CDN cache**
   - S3 objects expire after 90 days of no access
   - CloudFlare in front (if scaling)
   - Aggressively cache thumbnails

**Result:** Room preview in ~100ms (cached) vs 2s (generate)

---

## Sharing & Permissions Model

### Public Room (isPublic: true)
- Anyone with link can view
- Anonymous preview
- Can't edit
- Appears in "Browse public rooms"

### Collaborative Room (isCollaborative: true)
- Invited users can edit together
- Real-time sync (Phase 3)
- Permission levels: owner, editor, viewer
- Audit log: who changed what when

### Private Room (default)
- Only owner
- No sharing
- Full localStorage-only option (offline-only mode)

---

## Migration Path

### Step 1: Prepare Schema (Week 1)
- Update ContentItem type with `imageId`
- Keep imageData as fallback
- Test localStorage serialization

### Step 2: Optional Cloud (Week 2-3)
- User sees "Sign in to sync to cloud" button
- If declined, app works 100% offline (existing behavior)
- If accepted, new users default to cloud-backed

### Step 3: Sharing (Week 4)
- Share modal only visible if logged in
- Sharing URL format: `/rooms/{roomId}?invite={token}`

### Step 4: Realtime (Week 5-6, if time)
- For collaborative rooms, apply remote changes
- Conflict resolution rules

---

## Security & Privacy

### Authentication
- Supabase Auth (JWT)
- Email verification optional (allow anon first time)
- User account optional for offline use

### Authorization
- Supabase RLS (Row Level Security) policies:
  ```sql
  -- Users can only see their own rooms + shared rooms
  SELECT * FROM rooms
  WHERE ownerId = auth.uid()
     OR id IN (SELECT roomId FROM roomMembers WHERE userId = auth.uid())
     OR isPublic = true;
  ```

### Data Privacy
- No tracking/analytics by default
- User can export room JSON anytime (portable)
- User can delete account + all rooms
- GDPR: data residency options (EU, US, etc.)

---

## Success Metrics

- **Week 1:** Schema ready, existing rooms loadable with imageId fields
- **Week 3:** Cloud save working, users can persist across devices
- **Week 4:** 5+ users sharing rooms, 50+ public rooms browsable
- **Week 6:** Real-time collab working, 2+ users editing same room live

---

## Questions for Gungo

1. **Offline-first or cloud-first?** Keep localStorage as primary (offline), cloud as backup? Or cloud-first with local cache?
2. **Free tier or paid tier?** Supabase free tier supports ~5 users + 500 MB. Enough for start?
3. **Realtime collaboration priority?** Nice-to-have or must-have?
4. **User auth friction:** Email-based or Discord OAuth or anonymous with optional account?
5. **Export/import:** Should rooms be portable JSON files (download/drag-drop) even after cloud migration?

---

## Rough Effort Estimate

| Phase | Effort | Timeline |
|-------|--------|----------|
| 0: Schema + IndexedDB | 8 hrs | 1 day |
| 1: Supabase sync | 16 hrs | 2-3 days |
| 2: Sharing UI + perms | 12 hrs | 2 days |
| 3: Realtime collab | 20 hrs | 3-4 days |
| **Total** | **56 hrs** | **~2 weeks** |

(Assumes small team, MVP only)

---

## Alternative: Firebase vs Supabase

| Feature | Supabase | Firebase |
|---------|----------|----------|
| Storage | S3-compatible | Firebase Storage |
| Database | PostgreSQL | Firestore (NoSQL) |
| Realtime | WebSocket pub/sub | Real-time listener |
| RLS | Native SQL policies | Firestore rules DSL |
| Cost | Cheaper at scale | Pay per operation |
| **For this project** | **Better** (structured data, SQL) | Works, but pricier |

**Recommendation: Supabase** - better for room/object/permission modeling.

---

## Parking Lot (Future)

- Undo/redo sync across devices
- Conflict resolution UI (merge rooms)
- Version history (rollback)
- Room templates + forking
- Team workspaces
- Thumbnail CDN (Cloudinary, Imgix)
- WebRTC P2P collab (p2pcollab.js)
