# misc.-palace-dev-sandbox

Miscellaneous Manor ("Misc. Manor") build-off repo (XR Hack 2026): a dev sandbox where each dev tinkers with their own room, plus the pitch-off materials.

```
dev-sandbox/           Vite + TypeScript + Three.js app (see dev-sandbox/plan.md)
pitch-off-materials/   presentation PDF, idea dump, reference images
build-concept.txt      build-off concept
development-sandbox-brain-dump-1.txt
```

## Run

Needs Node 20+.

```
cd dev-sandbox
npm install
npm run dev
```

## Share your room

Click **Export room**, save the JSON as `dev-sandbox/rooms/<yourname>.json`, commit, and push. Teammates pick it from **Load repo room**.

## Levi's room

Choose **Levi's room** in the Rooms list for a warm maker studio based on Matt's
loft implementation, with sunset lighting, terracotta terrazzo, rose stucco, and
an amber horizon. The Sunset amber soundtrack stays selected when lighting changes;
No music remains available in the editor. The 31 placed objects include a
listening corner, engineering resources, a furnished maker loft, greenery,
coffee corner, and a paper lantern.
A second reading nook adds an armchair, side table, rug, fireplace, and sleeping
cat; a telescope, retro console, drum, and boombox fill out the creative corners.
Public bookmarks add CodingBat Java, Excalidraw, Photopea, WebGradients, and a
Java OOP video to the book, sketch notebook, toolkit, frame, and TV.
The former project placeholders now open Build Your Own X, MIT’s Missing
Semester, Nand to Tetris, and Red Blob Games’ interactive A* guide. Music and
video objects open Levi’s supplied Rick Astley, Pure Moods, Bon Iver, araabMUZIK,
Sequelitis, and Salad Fingers videos; the cat opens Kittens Game and the console
opens The Binding of Isaac: Rebirth. YouTube links use direct video URLs without
personal playlist IDs or tracking parameters. Select an object and choose
**Edit** to change its content.

The dedicated starter is `dev-sandbox/rooms/levi.json`. Existing local room saves
still take priority. If you already have a Levi save, export it first, then use
**Load repo room** and choose `levi` to load the new starter into your room.
