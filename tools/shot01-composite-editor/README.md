# Shot 01 composite editor

A browser tool for the trailer's Shot 1 composite: the fireplace-room plate from
`docs/trailer-materials/scenes/shots/shot 1/`, animated fire from this repo's own `buildFireplace()` rig,
the green-screen footage of German keyed live in WebGL, an adjustable solid back matte that follows his
silhouette, a front chair-arm holdout, and a camera that reframes the finished composite.

Edit in the browser, then render full-length H.264/AAC MP4s of the original takes with a render queue.

No footage lives in this repo. The camera originals and the working set (settings, plates, proxies, renders)
stay on disk next to the footage; this folder is only the code.

```
camera original (green screen)
  └ orientation fix → chromakey → despill → crop → scale
      → base colorbalance → grade (hue/sat/warmth/tint/RGB gains) → contrast/exposure
      → flips → rotate about the subject's centre
animated plate (fireplace loop)  →  back matte (subject alpha, blurred by Spread, solid colour)
  →  keyed subject  →  front chair-arm holdout  →  camera crop/zoom  →  MP4
```

`shot01_look.py` holds the shared look math; `shot01_editor.html` implements the same formulas in WebGL so the
live preview matches the FFmpeg render.

## Requirements

- Python 3.11+ with Pillow, FFmpeg/FFprobe with libx264 + AAC
- A browser with WebGL (Chromium, Firefox, Safari, iPadOS Safari)

## Layout

Set two environment variables, or put the code in the working directory (the default is "beside me"):

| Variable | Meaning | Default |
|---|---|---|
| `SHOT01_WORK_DIR` | settings, plates, `editor_media/`, `composite/full/` outputs | the folder holding these scripts |
| `SHOT01_FOOTAGE_DIR` | the camera originals, `<TAKE>.MOV` | parent of the work dir |
| `SHOT01_PUBLIC_ORIGIN` | extra allowed browser Origin (remote access) | the author's Tailscale URL |
| `SHOT01_HOST` / `SHOT01_PORT` | bind address | `127.0.0.1` / `5191` |
| `SCENE_RENDERS_DIR` | optional folder of 4K scene renders served at `/scene-renders/<name>.mp4` | `<work>/../Scene_Renders_4K` |

Expected inside the work dir:

```
shot01_settings.json                     start from shot01_settings.example.json
QC/composite/shot01_plate_1080.png       the Shot 1 plate, scaled to 1920x1080
composite/shot01_animated_background_25s.mp4   seamless fire loop (see below)
editor_media/<TAKE>_proxy.mp4            browser preview proxies
composite/full/                          renders, logs, queue state
```

## Setting up

```bash
export SHOT01_WORK_DIR=/path/to/work SHOT01_FOOTAGE_DIR=/path/to/footage
cp shot01_settings.example.json "$SHOT01_WORK_DIR/shot01_settings.json"

python3 render_animated_background_loop.py   # 25 s fire-loop plate (needs captured rig frames, below)
python3 build_editor_previews.py             # 8 s green-screen proxies for the browser
python3 shot01_editor_server.py              # http://127.0.0.1:5191/
```

Bind to loopback and share it with `tailscale serve --bg --http=5191 http://127.0.0.1:5191`, not a LAN bind.
`shot01-editor.service.example` is a systemd user unit that keeps it running across reboots.

The fire loop needs 624 sequential PNG frames of `buildFireplace()` in `QC/composite/fire_rig_long/`, captured
from this app in a browser: render `rig.update(t)` at `t = i / 23.976` into a 384x384 transparent canvas, in
order, after a ~2 s warm-up (the particles integrate state, so frames captured out of order will not match).
The script crossfades the seam so the loop has no jump and no black frame.

## Using the editor

- **Move German** — drag; wheel scales; Shift+wheel rotates. Sliders for X / Y / Scale / Rotate, buttons for
  ±90° and flip H/V.
- **Color match** — exposure, contrast, saturation, hue, warmth, tint, R/G/B gains. *Match room* samples the
  plate around the subject and nudges his balance toward it (press again to push further).
- **Back matte** — his own alpha, grown by Spread, filled with a solid colour at an opacity and offset. It
  follows every move, scale, rotation and flip.
- **Front arm mask** — drag the polygon over the camera-near chair arm; that part of the plate is laid back
  over him for the seat occlusion.
- **Camera** — zoom 1–4x and pan over the finished composite. The pass name goes into the output filename, so
  `wide` and `close` passes of one take sit side by side. Above ~1.6x gets soft: the plate is 1080p.
- **Apply to all takes** — copies the current take's position/scale, rotate/flip and/or colour to every take.
- **Render queue** — queue one take or several. Each job freezes a snapshot of the settings at queue time, so
  later edits never change a job already in line. Jobs run one at a time with progress, cancel, retry and
  download; the queue survives a restart.

## CLI

```bash
python3 shot01_edit.py preview <TAKE>|all          # single PNG frame
python3 shot01_edit.py render  <TAKE>|all          # full-length MP4 with the take's audio
python3 shot01_edit.py render  <TAKE> --config snapshot.json
```

A render that comes out more than 0.5 s short of its source fails and keeps the file as `*.truncated.mp4`
instead of reporting success.

## Safety rails

- The allowed takes are fixed in `ALLOWED` in `shot01_edit.py`. `KO6A8422` is a pre-rotation test take and is
  rejected everywhere.
- Originals and ProRes masters are read-only inputs; nothing here writes to them.
- The HTTP API never serves the originals, validates every value it accepts, and refuses to let a browser
  change file paths, the key/crop settings or preview times — those are file-only.
- A failed FFmpeg run leaves no finished-looking MP4; the partial file is discarded.

`shot01_settings.example.json` carries the real per-take placements and look from the shoot, with the camera
reset to the wide pass. Copy it into the work dir as `shot01_settings.json` and keep editing from there; the
editor writes that file, not this one.
