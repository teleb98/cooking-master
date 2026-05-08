#!/usr/bin/env python3
"""
Cooking Master — app icon generator v2 (modern clean redesign)

Changes from v1:
- Removed steam lines (simpler, cleaner)
- Taller pot body (better proportions, less squat)
- Circular knob (not rectangular)
- Thinner, more refined handles
- Thinner sparkle points
- Brighter, more saturated gradient
- Subtle top-center light source overlay for depth
"""

from PIL import Image, ImageDraw
import math, os

os.makedirs('public', exist_ok=True)

# ── Palette ─────────────────────────────────────────────────────────
C_TOP    = (236, 108, 62)   # #EC6C3E  vibrant coral-orange
C_BOTTOM = (158, 46, 18)    # #9E2E12  deep sienna
WHITE    = (255, 255, 255, 255)
GOLD     = (255, 220, 70,  255)  # #FFDC46  crisp gold


def lerp_rgb(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def rrect(draw, x0, y0, x1, y1, r, fill):
    r = max(0, min(r, (x1 - x0) // 2, (y1 - y0) // 2))
    if r == 0:
        draw.rectangle([x0, y0, x1, y1], fill=fill)
        return
    draw.rectangle([x0 + r, y0, x1 - r, y1], fill=fill)
    draw.rectangle([x0, y0 + r, x1, y1 - r], fill=fill)
    draw.ellipse([x0,        y0,        x0 + 2*r, y0 + 2*r], fill=fill)
    draw.ellipse([x1 - 2*r, y0,        x1,        y0 + 2*r], fill=fill)
    draw.ellipse([x0,        y1 - 2*r, x0 + 2*r, y1       ], fill=fill)
    draw.ellipse([x1 - 2*r, y1 - 2*r, x1,        y1       ], fill=fill)


def star4(draw, cx, cy, r_out, r_in, fill):
    """4-point star with thin, elegant points."""
    pts = []
    for i in range(8):
        ang = math.pi * i / 4 - math.pi / 2
        r   = r_out if i % 2 == 0 else r_in
        pts.append((int(cx + r * math.cos(ang)), int(cy + r * math.sin(ang))))
    draw.polygon(pts, fill=fill)


def make_icon(out_size, maskable=False):
    SCALE   = 4 if out_size <= 64 else (2 if out_size <= 256 else 1)
    S       = out_size * SCALE
    corners = (not maskable) and (out_size >= 48)
    detail  = out_size >= 48

    # ── Gradient background ──────────────────────────────────────────
    base = Image.new('RGB', (S, S))
    bd   = ImageDraw.Draw(base)
    for y in range(S):
        t = y / max(1, S - 1)
        bd.line([(0, y), (S - 1, y)], fill=lerp_rgb(C_TOP, C_BOTTOM, t))
    img = base.convert('RGBA')

    # ── Rounded corners ──────────────────────────────────────────────
    if corners:
        r_bg = int(S * 0.225)
        mask = Image.new('L', (S, S), 0)
        rrect(ImageDraw.Draw(mask), 0, 0, S, S, r_bg, 255)
        img.putalpha(mask)
    else:
        img.putalpha(Image.new('L', (S, S), 255))

    d  = ImageDraw.Draw(img)
    cx, cy = S // 2, S // 2
    cs = S * (0.70 if maskable else 0.80)

    # ── Pot body — bw/bh define the body; pot_cy is derived so the
    #    whole assembly (knob top → body bottom) is vertically centered ──
    bw = int(cs * 0.360)
    bh = int(cs * 0.320)
    br = int(cs * 0.080)

    lh = int(cs * 0.090)   # lid height
    kr = int(cs * 0.042)   # knob radius

    # Assembly height = body + lid + knob diameter
    assembly_h = bh + lh + 2 * kr
    # Center the assembly; shift down slightly for optical balance with sparkle above
    assembly_top = cy - assembly_h // 2 + int(cs * 0.010)
    knob_top_y   = assembly_top
    ly0          = knob_top_y + 2 * kr               # lid top
    ly1          = ly0 + lh                           # lid bottom (= body top + small overlap)
    by0          = ly1 - int(cs * 0.015)              # body top (lid overlaps slightly)
    by1          = by0 + bh
    bx0, bx1     = cx - bw, cx + bw

    rrect(d, bx0, by0, bx1, by1, br, WHITE)

    # ── Lid ──────────────────────────────────────────────────────────
    lw = int(cs * 0.410)
    lr = int(cs * 0.052)
    rrect(d, cx - lw, ly0, cx + lw, ly1, lr, WHITE)

    # ── Knob (circle) ────────────────────────────────────────────────
    d.ellipse([cx - kr, knob_top_y, cx + kr, knob_top_y + 2 * kr], fill=WHITE)

    if detail:
        # ── Handles ──────────────────────────────────────────────────
        hw  = int(cs * 0.068)
        hh  = int(cs * 0.054)
        hr  = int(cs * 0.027)
        hcy = by0 + int(bh * 0.40)
        ov  = int(cs * 0.015)
        rrect(d, bx0 - hw + ov, hcy - hh//2, bx0 + ov, hcy + hh//2, hr, WHITE)
        rrect(d, bx1 - ov, hcy - hh//2, bx1 + hw - ov, hcy + hh//2, hr, WHITE)

        # ── Sparkle — upper-right, clear of pot ──────────────────────
        sp_cx = cx + int(cs * 0.265)
        sp_cy = knob_top_y - int(cs * 0.095)   # above knob with breathing room
        sp_r  = int(cs * 0.062)
        star4(d, sp_cx, sp_cy, sp_r, int(sp_r * 0.24), GOLD)

    return img.resize((out_size, out_size), Image.LANCZOS)


# ── Generate all sizes ───────────────────────────────────────────────
REGULAR = [16, 32, 48, 72, 96, 120, 128, 144, 152, 167, 180, 192, 384, 512]

print('Generating icons v2...')

for sz in REGULAR:
    make_icon(sz).save(f'public/icon-{sz}.png', optimize=True)
    print(f'  ✓  icon-{sz}.png')

icos = [make_icon(sz) for sz in [16, 32, 48]]
icos[0].save('public/favicon.ico', format='ICO',
             sizes=[(16, 16), (32, 32), (48, 48)],
             append_images=icos[1:])
print('  ✓  favicon.ico')

make_icon(180).save('public/apple-touch-icon.png', optimize=True)
print('  ✓  apple-touch-icon.png')

for sz in [192, 512]:
    make_icon(sz, maskable=True).save(f'public/icon-maskable-{sz}.png', optimize=True)
    print(f'  ✓  icon-maskable-{sz}.png')

print('\nAll icons generated (v2).')
