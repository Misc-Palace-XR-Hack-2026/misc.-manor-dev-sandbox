# Neat stuff room

A showroom holding one of every object kind, each linking to the Wikipedia article for that thing —
useful for seeing all 51 models side by side and for spotting a model that renders badly.

- Room file: `rooms/neat-stuff.json` (shows up in the Rooms portal and the neighborhood as **Neat Stuff**).
- Layout: `curio-hall` — the cozy loft shell (same footprint, stairs and loft, so VR walking is unchanged)
  plus a front display case, an upper wall shelf and the floor/loft slots the plain loft leaves empty.
  52 slots, which is the first layout with room for all 51 models at once.
- Article choices live in `scripts/neat-stuff-source.json`. Every entry was checked against the
  Wikipedia API: all resolve to real, non-disambiguation articles.

## Regenerating

Placement is not hand-written — it comes from the app's own auto-placer, so the room follows the same
rules a player gets. After adding an object kind, add its article to `scripts/neat-stuff-source.json`
and rerun:

```sh
./node_modules/.bin/esbuild scripts/build-neat-stuff.ts --bundle --platform=node --format=esm \
  --outfile=scripts/.bns.mjs --log-level=error && node scripts/.bns.mjs && rm scripts/.bns.mjs
```

The script fails rather than writing a partial room if a kind has no article or an object cannot be
placed. `tests/neat-stuff-room.test.ts` then checks the committed file covers every kind exactly once.
