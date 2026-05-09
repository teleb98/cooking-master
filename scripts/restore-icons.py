"""
cm icon.jpg → 모든 앱 아이콘 사이즈 복원
- 청록(teal) 배경 제거 → 테라코타로 대체
- 하단 "쿠킹마스터" 텍스트 영역 제거
- favicon.ico / apple-touch-icon / maskable 포함 전 사이즈 생성
"""
from PIL import Image, ImageDraw
import os

SRC = '/Users/chiwon/Downloads/cm icon.jpg'
OUT = '/Users/chiwon/workspace/cooking-master/public'

img = Image.open(SRC).convert('RGBA')
w, h = img.size
pixels = img.load()

# 배경색(teal) 샘플링 — 좌상단 모서리
bg = img.getpixel((3, 3))[:3]
print(f"Background (teal): {bg}")

def is_bg(pix, tol=40):
    return all(abs(int(pix[i]) - int(bg[i])) < tol for i in range(3))

# ── 아이콘 상단/하단 경계 탐색 ─────────────────────────────
top = 0
for y in range(h):
    if sum(not is_bg(pixels[x, y]) for x in range(w)) > w * 0.05:
        top = y
        break

icon_bottom = h
prev_icon = False
for y in range(top, h):
    is_icon = sum(not is_bg(pixels[x, y]) for x in range(w)) > w * 0.05
    if prev_icon and not is_icon:
        icon_bottom = y
        break
    prev_icon = is_icon

print(f"Icon row range: {top} → {icon_bottom}")
icon_crop = img.crop((0, top, w, icon_bottom))

# 정사각형으로 패딩
iw, ih = icon_crop.size
side = max(iw, ih)
sq = Image.new('RGBA', (side, side), bg + (255,))
sq.paste(icon_crop, ((side - iw) // 2, (side - ih) // 2))

# ── 테라코타 색 샘플링 (아이콘 중앙) ──────────────────────
sq_px = sq.load()
accent = sq_px[side // 2, side // 3][:3]
print(f"Accent (terracotta): {accent}")

# ── teal 배경 → 테라코타로 교체 ───────────────────────────
for y in range(side):
    for x in range(side):
        r, g, b, a = sq_px[x, y]
        if is_bg((r, g, b)):
            sq_px[x, y] = accent + (255,)

# ── 아이콘 생성 헬퍼 ──────────────────────────────────────
def make_icon(size, maskable=False):
    img_r = sq.resize((size, size), Image.LANCZOS)
    if maskable:
        # 전체 테라코타 캔버스에 아이콘을 75% 크기로 중앙 배치
        canvas = Image.new('RGB', (size, size), accent)
        inner = int(size * 0.75)
        resized = sq.resize((inner, inner), Image.LANCZOS).convert('RGB')
        off = (size - inner) // 2
        canvas.paste(resized, (off, off))
        return canvas
    return img_r.convert('RGB')

# ── 일반 아이콘 ───────────────────────────────────────────
SIZES = [16, 32, 48, 72, 96, 120, 128, 144, 152, 167, 180, 192, 384, 512]
for s in SIZES:
    make_icon(s).save(f'{OUT}/icon-{s}.png', 'PNG')
    print(f"  icon-{s}.png")

# apple-touch-icon
make_icon(180).save(f'{OUT}/apple-touch-icon.png', 'PNG')
print("  apple-touch-icon.png")

# logo.png
make_icon(512).save(f'{OUT}/logo.png', 'PNG')
print("  logo.png")

# maskable
for s in [192, 512]:
    make_icon(s, maskable=True).save(f'{OUT}/icon-maskable-{s}.png', 'PNG')
    print(f"  icon-maskable-{s}.png")

# favicon.ico (16 + 32 + 48 multi-size)
ico_imgs = [sq.resize((s, s), Image.LANCZOS).convert('RGBA') for s in [48, 32, 16]]
ico_imgs[0].save(f'{OUT}/favicon.ico', format='ICO',
                 sizes=[(48, 48), (32, 32), (16, 16)],
                 append_images=ico_imgs[1:])
print("  favicon.ico")

print("\nDone! 모든 아이콘 복원 완료.")
