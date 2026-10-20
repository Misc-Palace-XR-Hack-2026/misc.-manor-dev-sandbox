"""Shared Shot 1 look math. The browser editor implements the same formulas in WebGL.

Order (both preview and render):
  source -> transpose=1,hflip (fixed camera fix) -> chromakey -> despill -> crop -> scale to width
  -> base colorbalance -> grade matrix (hue, saturation, warmth/tint, RGB gains) -> contrast/exposure
  -> user flips -> rotate about the subject's centre.
The back matte is the subject's own alpha, grown by `spread` (Gaussian sigma, comp px),
coloured, faded by `opacity`, and offset in screen space. It always follows the footage.
"""
from __future__ import annotations

import math

GRADE_DEFAULTS = {
    "exposure": 0.0, "contrast": 1.0, "saturation": 1.0, "hue": 0.0,
    "warmth": 0.0, "tint": 0.0, "gain_r": 1.0, "gain_g": 1.0, "gain_b": 1.0,
}
GRADE_BOUNDS = {
    "exposure": (-0.5, 0.5), "contrast": (0.25, 2.0), "saturation": (0.0, 2.0), "hue": (-180.0, 180.0),
    "warmth": (-1.0, 1.0), "tint": (-1.0, 1.0), "gain_r": (0.5, 1.5), "gain_g": (0.5, 1.5), "gain_b": (0.5, 1.5),
}
MATTE_DEFAULTS = {"color": "#481b16", "opacity": 0.0, "spread": 12.0, "offset_x": 0, "offset_y": 0}
LUM = (0.2126, 0.7152, 0.0722)


def grade(p: dict) -> dict:
    g = {k: float(p.get(k, v)) for k, v in GRADE_DEFAULTS.items()}
    for k, (lo, hi) in GRADE_BOUNDS.items():
        if not lo <= g[k] <= hi:
            raise ValueError(f"{k} must be between {lo} and {hi}")
    return g


def _mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def grade_matrix(g: dict) -> list[list[float]]:
    th = math.radians(g["hue"])
    c, s = math.cos(th), math.sin(th)
    hue = [
        [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
        [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283],
        [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
    ]
    sv = g["saturation"]
    sat = [[(1 - sv) * LUM[j] + (sv if i == j else 0) for j in range(3)] for i in range(3)]
    gains = [
        g["gain_r"] * (1 + 0.25 * g["warmth"]),
        g["gain_g"] * (1 - 0.20 * g["tint"]),
        g["gain_b"] * (1 - 0.25 * g["warmth"]),
    ]
    diag = [[gains[i] if i == j else 0 for j in range(3)] for i in range(3)]
    return _mul(diag, _mul(sat, hue))


def grade_filters(g: dict) -> list[str]:
    m = grade_matrix(g)
    names = ("r", "g", "b")
    mix = ":".join(f"{names[i]}{names[j]}={m[i][j]:.5f}" for i in range(3) for j in range(3))
    out = [f"colorchannelmixer={mix}:aa=1"]
    if g["contrast"] != 1 or g["exposure"]:
        e = f"clip((val/255-0.5)*{g['contrast']:.4f}+0.5+{g['exposure']:.4f},0,1)*255"
        out.append(f"lutrgb=r='{e}':g='{e}':b='{e}'")
    return out


def matte(m: dict) -> dict:
    out = {**MATTE_DEFAULTS, **{k: m[k] for k in MATTE_DEFAULTS if k in m}}
    out["opacity"] = float(out["opacity"]); out["spread"] = float(out["spread"])
    out["offset_x"] = int(out["offset_x"]); out["offset_y"] = int(out["offset_y"])
    if not 0 <= out["opacity"] <= 1: raise ValueError("matte opacity 0–1")
    if not 0 <= out["spread"] <= 60: raise ValueError("matte spread 0–60")
    if not (-300 <= out["offset_x"] <= 300 and -300 <= out["offset_y"] <= 300): raise ValueError("matte offset ±300")
    c = out["color"]
    if not (isinstance(c, str) and len(c) == 7 and c[0] == "#" and all(ch in "0123456789abcdefABCDEF" for ch in c[1:])):
        raise ValueError("matte color must be #RRGGBB")
    return out
