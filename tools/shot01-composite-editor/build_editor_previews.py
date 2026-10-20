#!/usr/bin/env python3
"""Make 8 s H.264 *un-keyed* proxies for the Shot 1 web editor (excludes 8422).

The browser keys, grades, rotates and builds the silhouette matte live in WebGL, so the
proxies stay plain green-screen video that every browser (incl. Safari/iPad) can decode.
Orientation fix and crop match shot01_edit.py; output width is 540 px.
"""
import json, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from shot01_edit import SOURCE_FIX, ALLOWED, KEYED, ROOT as FOOTAGE

cfg = json.loads((KEYED / 'shot01_settings.json').read_text())
cw, ch, cx, cy = cfg['person']['crop']
W = 540; H = int(round(W * ch / cw / 2)) * 2
out_dir = KEYED / 'editor_media'; out_dir.mkdir(exist_ok=True)
force = '--force' in sys.argv
for stem, options in cfg['clips'].items():
    if stem not in ALLOWED: raise SystemExit(f'{stem} is not a production take')
    out = out_dir / f'{stem}_proxy.mp4'
    if out.exists() and not force: continue
    seek = max(0, options['preview_at'] - 2)
    vf = f'{SOURCE_FIX},crop={cw}:{ch}:{cx}:{cy},scale={W}:{H}:flags=lanczos'
    subprocess.check_call(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(seek), '-t', '8',
        '-i', str(FOOTAGE / f'{stem}.MOV'), '-an', '-vf', vf, '-c:v', 'libx264', '-preset', 'slow',
        '-crf', '16', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709',
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', str(out)])
    print(stem, out.stat().st_size, flush=True)
