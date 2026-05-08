#!/usr/bin/env python3
"""
Cooking Master — app icon generator
Outputs: PWA icons, favicon.ico, apple-touch-icon, Android maskable icons
Design:  vertical gradient bg (#D07050 → #8C361E) + white pot silhouette + gold sparkle
"""

from PIL import Image, ImageDraw
import math, os

os.makedirs('public', exist_ok=True)

# ── Brand palette ─────────────────────────────────────────────────────
C_TOP    = (215, 112, 76)    # #D7704C  warm terracotta highlight
C_BOTTOM = (140, 54, 30)     # #8C361E  deep shadow
C_MID    = (182, 78, 50)     # midpoint for 3-stop gradient richness
WHITE    = (255, 255, 255, 255)
GOLD     = (255, 213, 96,  255)  # #FFD560  sparkle


# ── Drawing primitives ────────────────────────────────────────────────
def lerp3(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))

def lerp3_stops(y, H):
    """3-stop gradient: top → mid (40%) → bottom."""
    if y < H * 0.40:
        t = y / (H * 0.40)
        return lerp3(C_TOP, C_MID, t)
    else:
        t = (y - H * 0.40) / (H * 0.60)
        return lerp3(C_MID, C_BOTTOM, t)

def rrect(draw, x0, y0, x1, y1, r, fill):
    r = max(0, min(r, (x1 - x0) // 2, (y1 - y0) // 2))
    if r == 0:
        draw.rectangle([x0, y0, x1, y1], fill=fill)
        return
    draw.rectangle([x0 + r, y0, x1 - r, y1], fill=fill)
    draw.rectangle([x0,     y0 + r, x1, y1 - r], fill=fill)
    draw.ellipse([x0,         y0,         x0 + 2*r, y0 + 2*r], fill=fill)
    draw.ellipse([x1 - 2*r,  y0,         x1,        y0 + 2*r], fill=fill)
    draw.ellipse([x0,         y1 - 2*r,  x0 + 2*r,  y1      ], fill=fill)
    draw.ellipse([x1 - 2*r,  y1 - 2*r,  x1,         y1      ], fill=fill)

def star4(draw, cx, cy, r_out, r_in, fill):
    pts = []
    for i in range(8):
        ang = math.pi * i / 4 - math.pi / 2
        r   = r_out if i % 2 == 0 else r_in
        pts.append((int(cx + r * math.cos(ang)), int(cy + r * math.sin(ang))))
    draw.polygon(pts, fill=fill)


# ── Core icon renderer ────────────────────────────────────────────────
def make_icon(out_size, maskable=False):
    """
    out_size  : final pixel size (e.g. 512)
    maskable  : if True, no rounded corners + content in safe zone (Android adaptive)
    """
    SCALE   = 4 if out_size <= 64 else (2 if out_size <= 256 else 1)
    S       = out_size * SCALE
    corners = (not maskable) and (out_size >= 48)
    detail  = out_size >= 48    # handles + sparkle
    fine    = out_size >= 128   # steam above knob

    # — gradient background —
    base = Image.new('RGB', (S, S))
    bd   = ImageDraw.Draw(base)
    for y in range(S):
        c = lerp3_stops(y, S)
        bd.line([(0, y), (S - 1, y)], fill=c)
    img = base.convert('RGBA')

    if corners:
        r_bg = int(S * 0.225)        # iOS-style ~22% radius
        mask = Image.new('L', (S, S), 0)
        rrect(ImageDraw.Draw(mask), 0, 0, S, S, r_bg, 255)
        img.putalpha(mask)
    elif not maskable:
        img.putalpha(Image.new('L', (S, S), 255))
    else:
        img.putalpha(Image.new('L', (S, S), 255))

    d = ImageDraw.Draw(img)

    cx, cy = S // 2, S // 2
    # content scale: maskable uses 74% (safe zone), regular 80%
    cs = S * (0.74 if maskable else 0.80)

    # pot assembly center: 3% below icon center
    pot_cy = cy + int(cs * 0.028)

    # ── Pot body ──────────────────────────────────────────────────
    bw = int(cs * 0.395)
    bh = int(cs * 0.265)
    br = int(cs * 0.072)
    bx0, bx1 = cx - bw, cx + bw
    by0, by1 = pot_cy - bh // 2, pot_cy + bh // 2
    rrect(d, bx0, by0, bx1, by1, br, WHITE)

    # ── Lid ───────────────────────────────────────────────────────
    lw = int(cs * 0.425)
    lh = int(cs * 0.085)
    lr = int(cs * 0.038)
    ly1 = by0 + int(cs * 0.018)   # overlaps body top slightly
    ly0 = ly1 - lh
    rrect(d, cx - lw, ly0, cx + lw, ly1, lr, WHITE)

    # ── Knob on lid ───────────────────────────────────────────────
    kw = int(cs * 0.038)
    kh = int(cs * 0.060)
    kr = int(cs * 0.020)
    rrect(d, cx - kw, ly0 - kh, cx + kw, ly0 + kr, kr, WHITE)

    if fine:
        # ── Steam (3 softened lines above knob) ───────────────────
        sw  = int(cs * 0.013)
        sh  = int(cs * 0.042)
        sr  = int(cs * 0.008)
        sy1 = ly0 - kh - int(cs * 0.018)
        sy0 = sy1 - sh
        for ox in (-int(cs * 0.052), 0, int(cs * 0.052)):
            steam_col = (255, 255, 255, 140)
            rrect(d, cx + ox - sw, sy0, cx + ox + sw, sy1, sr, steam_col)

    if detail:
        # ── Handles ───────────────────────────────────────────────
        hw  = int(cs * 0.078)
        hh  = int(cs * 0.086)
        hr  = int(cs * 0.030)
        hcy = by0 + int(bh * 0.38)
        ov  = int(cs * 0.020)   # overlap into body edge
        rrect(d, bx0 - hw + ov, hcy - hh//2, bx0 + ov, hcy + hh//2, hr, WHITE)
        rrect(d, bx1 - ov, hcy - hh//2, bx1 + hw - ov, hcy + hh//2, hr, WHITE)

        # ── Gold sparkle (upper-right quadrant) ───────────────────
        sp_cx = cx + int(cs * 0.285)
        sp_cy = cy - int(cs * 0.300)
        sp_r  = int(cs * 0.063)
        star4(d, sp_cx, sp_cy, sp_r, int(sp_r * 0.34), GOLD)

    # ── Downscale with LANCZOS ────────────────────────────────────
    return img.resize((out_size, out_size), Image.LANCZOS)


# ── Output all sizes ──────────────────────────────────────────────────
REGULAR = [16, 32, 48, 72, 96, 120, 128, 144, 152, 167, 180, 192, 384, 512]

print('Generating icons...')

for sz in REGULAR:
    path = f'public/icon-{sz}.png'
    make_icon(sz).save(path, optimize=True)
    print(f'  ✓  {path}')

# favicon.ico — multi-size (16 / 32 / 48)
icos = [make_icon(sz) for sz in [16, 32, 48]]
icos[0].save('public/favicon.ico', format='ICO',
             sizes=[(16, 16), (32, 32), (48, 48)],
             append_images=icos[1:])
print('  ✓  public/favicon.ico')

# Apple touch icon (iOS home screen)
make_icon(180).save('public/apple-touch-icon.png', optimize=True)
print('  ✓  public/apple-touch-icon.png')

# Maskable icons — Android adaptive icon (no rounded corners, safe-zone content)
for sz in [192, 512]:
    path = f'public/icon-maskable-{sz}.png'
    make_icon(sz, maskable=True).save(path, optimize=True)
    print(f'  ✓  {path}')

print('\nAll icons generated successfully.')
