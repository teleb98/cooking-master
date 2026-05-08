#!/usr/bin/env python3
"""
Cooking Master — app icon generator
소스 PNG에서 크림 배경을 제거하고 PWA/iOS/Android 전 사이즈 아이콘을 생성합니다.
"""

from PIL import Image, ImageDraw
import os

SRC = '/Users/chiwon/.gemini/antigravity/brain/91493147-a3de-495f-ae19-d6e597811bca/cooking_master_app_icon_1778250857246.png'
os.makedirs('public', exist_ok=True)

# ── 소스 이미지 로드 및 배경 감지 ────────────────────────────────────
src = Image.open(SRC).convert('RGBA')
W, H = src.size
print(f'Source: {W}×{H}')

# 모서리에서 배경색(크림색) 샘플링
def sample_bg(img, r=20):
    samples = [img.getpixel((x, y))[:3]
               for x in range(3, r, 4) for y in range(3, r, 4)]
    return tuple(sum(s[i] for s in samples) // len(samples) for i in range(3))

bg = sample_bg(src)
print(f'BG color: RGB{bg}')

def is_bg(px, tol=25):
    return all(abs(int(px[i]) - bg[i]) < tol for i in range(3))

# 콘텐츠 경계 탐지 (4px 단위로 스캔)
step = 4

top = 0
for y in range(0, H, step):
    if any(not is_bg(src.getpixel((x, y))) for x in range(0, W, step)):
        top = max(0, y - step)
        break

bottom = H
for y in range(H - 1, H // 2, -step):
    if any(not is_bg(src.getpixel((x, y))) for x in range(0, W, step)):
        bottom = min(H, y + step)
        break

left = 0
for x in range(0, W, step):
    if any(not is_bg(src.getpixel((x, y))) for y in range(0, H, step)):
        left = max(0, x - step)
        break

right = W
for x in range(W - 1, W // 2, -step):
    if any(not is_bg(src.getpixel((x, y))) for y in range(0, H, step)):
        right = min(W, x + step)
        break

print(f'Content box: ({left},{top}) → ({right},{bottom})')
icon_raw = src.crop((left, top, right, bottom))

# 정방형으로 보정
cw, ch = icon_raw.size
if cw != ch:
    s = min(cw, ch)
    icon_raw = icon_raw.crop(((cw - s)//2, (ch - s)//2,
                               (cw + s)//2, (ch + s)//2))
print(f'Cropped: {icon_raw.size}')


# ── 헬퍼 ─────────────────────────────────────────────────────────────
def rrect_mask(S, r_pct=0.225):
    """둥근 모서리 마스크 생성 (iOS 스타일 ~22%)"""
    r = int(S * r_pct)
    mask = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(mask)
    d.rectangle([r, 0, S - r, S], fill=255)
    d.rectangle([0, r, S, S - r], fill=255)
    d.ellipse([0,         0,         2*r, 2*r], fill=255)
    d.ellipse([S - 2*r,   0,         S,   2*r], fill=255)
    d.ellipse([0,         S - 2*r,   2*r, S  ], fill=255)
    d.ellipse([S - 2*r,   S - 2*r,   S,   S  ], fill=255)
    return mask

def make_icon(target, maskable=False):
    img = icon_raw.resize((target, target), Image.LANCZOS)
    if not maskable and target >= 48:
        # 투명 배경 위에 라운드 마스크 적용
        out = Image.new('RGBA', (target, target), (0, 0, 0, 0))
        out.paste(img, mask=rrect_mask(target))
        return out
    # maskable: 그대로 (Android가 자체 마스크 적용)
    return img


# ── 전 사이즈 생성 ────────────────────────────────────────────────────
SIZES = [16, 32, 48, 72, 96, 120, 128, 144, 152, 167, 180, 192, 384, 512]

print('\nGenerating icons...')
for sz in SIZES:
    make_icon(sz).save(f'public/icon-{sz}.png', optimize=True)
    print(f'  ✓  icon-{sz}.png')

# favicon.ico (16/32/48 통합)
icos = [make_icon(sz) for sz in [16, 32, 48]]
icos[0].save('public/favicon.ico', format='ICO',
             sizes=[(16, 16), (32, 32), (48, 48)],
             append_images=icos[1:])
print('  ✓  favicon.ico')

# Apple touch icon
make_icon(180).save('public/apple-touch-icon.png', optimize=True)
print('  ✓  apple-touch-icon.png')

# Android maskable (safe-zone: 소스 디자인 여백이 충분함)
for sz in [192, 512]:
    make_icon(sz, maskable=True).save(f'public/icon-maskable-{sz}.png', optimize=True)
    print(f'  ✓  icon-maskable-{sz}.png')

print('\nAll icons generated from custom logo.')
