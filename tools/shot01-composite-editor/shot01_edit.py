#!/usr/bin/env python3
"""Editable Shot 1 sandwich. preview makes a PNG; render makes a full-length MP4.

Layers: animated plate -> silhouette back matte -> keyed German -> front chair-arm holdout.
Only KO6A8423–KO6A8429 are allowed. Original footage and keyed masters are never written.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

from shot01_look import grade, grade_filters, matte as matte_settings

# Code lives in the repo; the working set (settings, plates, proxies, renders) and the camera originals live
# wherever the footage is. Override with SHOT01_WORK_DIR / SHOT01_FOOTAGE_DIR.
CODE = Path(__file__).resolve().parent
KEYED = Path(os.environ.get("SHOT01_WORK_DIR") or CODE)
ROOT = Path(os.environ.get("SHOT01_FOOTAGE_DIR") or KEYED.parent)
CONFIG = KEYED / "shot01_settings.json"
ALLOWED = {f"KO6A84{i}" for i in range(23, 30)}
FPS = "24000/1001"
SOURCE_FIX = "transpose=1,hflip"  # camera was rotated; this makes German upright. Fixed, not a user flip.


def settings(config: Path = CONFIG):
    data = json.loads(Path(config).read_text())
    assert set(data["clips"]) == ALLOWED, "settings must list 8423–8429 only"
    plate = KEYED / data["plate"]
    assert plate.is_file(), f"missing {plate}"
    out = KEYED / data["output_dir"]
    out.mkdir(parents=True, exist_ok=True)
    return data, plate, out


def probe_duration(src: Path) -> float:
    r = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(src)
    ], text=True)
    return float(r.strip())


def front_arm(plate: Path, out: Path, points: list[list[int]], name: str = "shot01_front_arm.png") -> Path:
    image = Image.open(plate).convert("RGBA")
    if any(not (0 <= x < image.width and 0 <= y < image.height) for x, y in points):
        raise ValueError("front_arm_polygon contains points outside plate")
    mask = Image.new("L", image.size)
    ImageDraw.Draw(mask).polygon([tuple(p) for p in points], fill=255)
    holdout = image.copy()
    holdout.putalpha(mask)
    path = out / name
    holdout.save(path)
    return path


def geometry(p: dict) -> tuple[int, int]:
    cw, ch, _, _ = p["crop"]
    w = int(round(float(p["width"]) / 2)) * 2
    h = int(round(w * ch / cw / 2)) * 2
    return w, h


def validate_person(p: dict) -> None:
    w, h, x, y = p["crop"]
    if min(w, h) <= 0 or min(x, y) < 0:
        raise ValueError("crop dimensions must be positive; offsets nonnegative")
    if not 60 <= float(p["width"]) <= 1600:
        raise ValueError("width must be 60–1600 px")
    if not -180 <= float(p.get("angle", 0)) <= 180:
        raise ValueError("rotation angle outside -180–180")
    if not 0.01 <= p["key_similarity"] <= 1 or not 0 <= p["key_blend"] <= 1:
        raise ValueError("invalid chromakey similarity/blend")
    for k in ("flip_h", "flip_v"):
        if not isinstance(p.get(k, False), bool):
            raise ValueError(f"{k} must be true/false")
    grade(p)


def graph(p: dict, m: dict) -> str:
    validate_person(p)
    cw, ch, cx0, cy0 = p["crop"]
    w, h = geometry(p)
    angle = float(p.get("angle", 0))
    pad = math.ceil(3 * m["spread"]) + 4 if m["opacity"] > 0 else 2
    actor = ",".join(filter(None, [
        "setpts=PTS-STARTPTS", SOURCE_FIX, "format=yuva444p",
        f"chromakey={p['key_color']}:{p['key_similarity']}:{p['key_blend']}",
        "format=rgba", f"despill=green:mix={p['despill']}",
        f"crop={cw}:{ch}:{cx0}:{cy0}", f"scale={w}:{h}",
        f"colorbalance={p['colorbalance']}", *grade_filters(grade(p)),
        "hflip" if p.get("flip_h") else "", "vflip" if p.get("flip_v") else "",
        f"pad={w + 2 * pad}:{h + 2 * pad}:{pad}:{pad}:color=black@0",
    ]))
    rot = ""
    if angle:
        t = f"{angle:g}*PI/180"
        rot = f",rotate={t}:ow=rotw({t}):oh=roth({t}):c=none"
    cx, cy = float(p["x"]) + w / 2, float(p["y"]) + h / 2
    place = lambda dx, dy: f"x='{cx + dx:.1f}-overlay_w/2':y='{cy + dy:.1f}-overlay_h/2'"
    if m["opacity"] <= 0:
        return (f"[1:v]{actor}{rot}[a];[0:v][a]overlay={place(0, 0)}:shortest=1[mid];"
                f"[mid][2:v]overlay=0:0:shortest=1[v]")
    r, g, b = (int(m["color"][i:i + 2], 16) for i in (1, 3, 5))
    blur = f",gblur=sigma={m['spread']:g}" if m["spread"] > 0 else ""
    return (f"[1:v]{actor},split=2[a0][m0];"
            f"[m0]lutrgb=r={r}:g={g}:b={b}{blur},format=rgba,"
            f"lutrgb=a='(1-pow(1-val/255,3))*255*{m['opacity']:.3f}'{rot}[m];"
            f"[a0]null{rot}[a];"
            f"[0:v][m]overlay={place(m['offset_x'], m['offset_y'])}:shortest=1[bg];"
            f"[bg][a]overlay={place(0, 0)}:shortest=1[mid];"
            f"[mid][2:v]overlay=0:0:shortest=1[v]")


def camera_settings(c: dict | None) -> dict:
    c = {"name": "wide", "zoom": 1.0, "center_x": 960.0, "center_y": 540.0, **(c or {})}
    z = float(c["zoom"])
    if not 1 <= z <= 4: raise ValueError("camera zoom 1–4")
    name = str(c["name"])
    if not (1 <= len(name) <= 24 and all(ch.isalnum() or ch in "-_" for ch in name)):
        raise ValueError("camera pass name: letters, numbers, - or _ (max 24)")
    w = int(round(1920 / z / 2)) * 2; h = int(round(1080 / z / 2)) * 2
    x = int(round(min(max(float(c["center_x"]) - w / 2, 0), 1920 - w)))
    y = int(round(min(max(float(c["center_y"]) - h / 2, 0), 1080 - h)))
    return {"name": name, "zoom": z, "center_x": float(c["center_x"]), "center_y": float(c["center_y"]), "crop": (w, h, x, y)}


def camera_filter(cam: dict) -> str:
    w, h, x, y = cam["crop"]
    return "null" if (w, h) == (1920, 1080) else f"crop={w}:{h}:{x}:{y},scale=1920:1080:flags=lanczos"


def command(plate: Path, arm: Path, src: Path, p: dict, m: dict, seek: float, mode: str, dst: Path, duration: float, cam: dict | None = None):
    fg = graph(p, m).replace("[mid][2:v]overlay=0:0:shortest=1[v]", "[mid][2:v]overlay=0:0:shortest=1[comp];[comp]" + camera_filter(cam or camera_settings(None)) + "[v]")
    if mode == "preview":
        return [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-stream_loop", "-1", "-i", str(plate),
            "-ss", str(seek), "-i", str(src),
            "-loop", "1", "-framerate", FPS, "-i", str(arm),
            "-filter_complex", fg, "-map", "[v]", "-frames:v", "1", str(dst),
        ]
    return [
        "ffmpeg", "-hide_banner", "-y", "-filter_complex_threads", "1", "-filter_threads", "1",
        "-stream_loop", "-1", "-i", str(plate),
        "-i", str(src),
        "-loop", "1", "-framerate", FPS, "-i", str(arm),
        "-filter_complex", fg,
        "-map", "[v]", "-map", "1:a?", "-t", f"{duration:.3f}",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-x264-params", "threads=2:lookahead_threads=1:rc-lookahead=5",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", str(dst),
    ]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("mode", choices=("preview", "render"))
    ap.add_argument("clip", choices=sorted(ALLOWED) + ["all"])
    ap.add_argument("--config", type=Path, default=CONFIG, help="settings JSON (render queue passes a frozen snapshot)")
    args = ap.parse_args()
    data, plate_still, out = settings(args.config)
    plate = KEYED / data.get("animated_plate", data["plate"])
    if not plate.is_file(): raise SystemExit(f"missing animated plate {plate}")
    arm = front_arm(plate_still, out, data["front_arm_polygon"],
                    "shot01_front_arm.png" if args.config == CONFIG else f"shot01_front_arm_{Path(args.config).stem}.png")
    m = matte_settings(data["back_matte"])
    cam = camera_settings(data.get("camera"))
    clips = sorted(ALLOWED) if args.clip == "all" else [args.clip]
    for stem in clips:
        src = ROOT / f"{stem}.MOV"
        if not src.is_file():
            raise SystemExit(f"missing source {src}")
        duration = probe_duration(src)
        clip_cfg = data["clips"][stem]
        seek = float(clip_cfg["preview_at"])
        person = {**data["person"], **clip_cfg.get("person", {})}
        if seek < 0 or seek >= duration:
            raise ValueError(f"preview_at outside {stem}: 0–{duration:.2f}")
        ext = "png" if args.mode == "preview" else "mp4"
        suffix = args.mode if cam["name"] == "wide" else f"{args.mode}_{cam['name']}"
        dest = out / f"{stem}_shot01_{suffix}.{ext}"
        tmp = dest.with_name(dest.stem + ".partial" + dest.suffix)
        log = out / f"{stem}_shot01_{suffix}.log"
        cmd = command(plate, arm, src, person, m, seek, args.mode, tmp, duration, cam)
        print(f"{args.mode} {stem} -> {dest} (source {duration:.2f}s)", flush=True)
        with log.open("w") as fp:
            result = subprocess.run(cmd, stdout=fp, stderr=subprocess.STDOUT)
        if result.returncode:
            tmp.unlink(missing_ok=True)
            raise SystemExit(f"ffmpeg failed ({result.returncode}); see {log}")
        if args.mode == "render":
            got = probe_duration(tmp)
            if got < duration - 0.5:
                bad = tmp.with_name(dest.stem + ".truncated.mp4"); os.replace(tmp, bad)
                raise SystemExit(f"render truncated: {got:.2f}s of {duration:.2f}s; kept as {bad.name}, see {log}")
        os.replace(tmp, dest)
        print(f"Verified {dest} ({dest.stat().st_size} bytes)", flush=True)


if __name__ == "__main__":
    main()
