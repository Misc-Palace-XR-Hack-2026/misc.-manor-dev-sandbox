# Lighting-complementary finishes

Each lighting preset has an optional coordinated theme, plus three independently selectable finishes. Lighting changes **never** replace surface choices. Themes deliberately apply floor, wall, background and lighting in one undoable edit; they do not change the soundtrack setting, content, furniture or geometry.

| Lighting | Optional theme | Floor | Wall | Background |
| --- | --- | --- | --- | --- |
| Daylight | Daylight gallery | Gallery limestone | Chalk limewash | Daylight cumulus |
| Dawn | Golden-hour retreat | Honey oak | Oat linen | Peach morning clouds |
| Sunset | Terracotta dusk | Terracotta terrazzo | Rose stucco | Amber horizon |
| Candlelight | Fireside library | Smoked walnut | Hearth brick | Fireside starlight |
| Overcast | Rainy-day atelier | Silver slate | Mist plaster | Layered rain clouds |
| Cyber | Neon observatory | Graphite circuitry | Neon ribbed panels | Ion aurora |
| Twilight | Indigo reading room | Indigo marble | Violet linen | Indigo starfield |
| Emerald | Fern conservatory | Moss slate | Sage limewash | Forest mist ridges |
| Ember | Ember salon | Veined basalt | Copper fluted panels | Ember horizon haze |
| Vaporwave | Pastel dreamscape | Pearl terrazzo | Lavender stucco | Peach orbital sunset |

## Architecture

- `src/core/surface-looks.ts` is a lighting-keyed, type-checked catalog. Existing surface and theme IDs remain unchanged; all new IDs are additive.
- Web selects and the paginated XR panel already enumerate shared registries, so they expose the same choices without duplicate lists.
- `src/views/procedural-finishes.ts` creates local 512×512 canvases with seeded grain and material-specific detail: masonry joints, timber grain, terrazzo chips, marble veins, linen weave, fluting, circuitry, clouds, stars, aurora ribbons and distant ridgelines.
- Existing texture ownership/disposal, world-space UV tiling, sRGB and custom image behavior are retained. No external images, new geometry, animation loop, save migration or automatic lighting-to-surface binding is introduced.
- Pixel-readback canvases explicitly use a software-friendly 2D context to avoid Chromium's automatic GPU/CPU raster migration causing nondeterministic one-channel rounding.

## Verification

```sh
npm test
npm run build
node tests/browser-lighting-surfaces.mjs
node tests/browser-surfaces.mjs
```

Browser scripts use the existing local Playwright installation and system Chromium, with `--use-angle=gl --enable-webgl --ignore-gpu-blocklist`. Start Vite on localhost:5173 first. The new script accepts `MP_URL` and `MP_ARTIFACTS`; by default screenshots go into the Hermes scratch `lighting-surfaces` directory. Each browser runs in an isolated context, not the user's saved room.

The new unit test covers all ten coordinated themes, independent XR selections, lighting independence, explicit music preservation, saves/import/export and atomic undo. The browser test checks all thirty new textures for spatial detail, distinctness and deterministic regeneration; exercises every surface selector and theme selector; verifies lighting independence, visible renderer changes, furnished-room preservation and reload; captures all ten looks.

A physical headset remains necessary to assess immersive comfort and controller ergonomics. Automated XR coverage verifies registry/action compatibility, not an actual immersive session. These are color-map finishes, not physically displaced or normal-mapped materials.
