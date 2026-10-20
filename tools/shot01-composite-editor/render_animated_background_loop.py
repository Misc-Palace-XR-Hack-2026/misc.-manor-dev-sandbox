#!/usr/bin/env python3
"""Seamless 25 s animated-fire Shot 1 plate from the repo's buildFireplace rig.

624 sequential rig frames are captured to QC/composite/fire_rig_long. The loop is L=600 frames
(25.025 s @ 23.976). The first F=24 frames crossfade from frames L..L+F-1 so the last loop frame
flows straight into the first: no jump and no black frame at the seam.
"""
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw, ImageFilter

KEYED = Path(__file__).resolve().parent
QC = KEYED / 'QC/composite'
frames = QC / 'fire_rig_long'
plate = Image.open(QC / 'shot01_plate_1080.png').convert('RGB')
out = KEYED / 'composite/shot01_animated_background_25s.mp4'
L, F = 600, 24
box = (910, 535, 1215, 868)
mask = Image.new('L', plate.size, 0)
ImageDraw.Draw(mask).rectangle(box, fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(3))


def rig(i):
    return Image.open(frames / f'{i:04d}.png').convert('RGB')


cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'rgb24',
       '-video_size', '1920x1080', '-framerate', '24000/1001', '-i', 'pipe:0', '-frames:v', str(L),
       '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-bf', '0', '-g', '48',
       '-x264-params', 'threads=4:open-gop=0', '-movflags', '+faststart', '-an', str(out)]
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
try:
    for i in range(L):
        fire = rig(i)
        if i < F:
            fire = Image.blend(rig(L + i), fire, i / F)
        patch = fire.crop((129, 148, 260, 301)).resize((box[2] - box[0] + 1, box[3] - box[1] + 1), Image.Resampling.LANCZOS)
        scene = plate.copy()
        scene.paste(patch, box[:2])
        scene = Image.composite(scene, plate, mask)
        proc.stdin.write(scene.tobytes())
    proc.stdin.close()
except Exception:
    proc.kill(); raise
if proc.wait(): raise SystemExit('ffmpeg failed')
print(out, out.stat().st_size)
