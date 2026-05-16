"""
iOS PWA 스플래시 스크린 생성 스크립트
각 기기 해상도에 맞는 launch image를 public/splash/ 에 저장
"""
from PIL import Image, ImageDraw, ImageFont
import os

FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
ICON = os.path.join(os.path.dirname(__file__), '../public/apple-touch-icon.png')
OUT  = os.path.join(os.path.dirname(__file__), '../public/splash')
os.makedirs(OUT, exist_ok=True)

BG      = (250, 247, 242)   # #FAF7F2
ACCENT  = (200, 101,  74)   # #C8654A
TEXT    = ( 60,  48,  40)   # --ink

# (width_px, height_px, label)
SIZES = [
    (750,  1334, 'iphone-se'),          # iPhone SE 3rd / 8
    (1170, 2532, 'iphone-14'),          # iPhone 12-14
    (1284, 2778, 'iphone-14-plus'),     # iPhone 12-14 Pro Max
    (1179, 2556, 'iphone-14-pro'),      # iPhone 14/15 Pro
    (1290, 2796, 'iphone-15-pro-max'),  # iPhone 15 Pro Max
    (1536, 2048, 'ipad-mini'),          # iPad mini (2x)
    (1668, 2388, 'ipad-air'),           # iPad Air 11"
    (2048, 2732, 'ipad-pro-13'),        # iPad Pro 13"
]

icon_src = Image.open(ICON).convert('RGBA')

for (w, h, name) in SIZES:
    img  = Image.new('RGB', (w, h), BG)
    draw = ImageDraw.Draw(img)

    # 아이콘 크기: 화면 폭의 25%, 최대 300px
    icon_size = min(int(w * 0.25), 300)
    icon = icon_src.resize((icon_size, icon_size), Image.LANCZOS)

    # 아이콘 배치 (중앙보다 약간 위)
    ix = (w - icon_size) // 2
    iy = int(h * 0.38)
    img.paste(icon, (ix, iy), icon)

    # 앱 이름
    try:
        font_title = ImageFont.truetype(FONT, size=int(w * 0.055))
        font_sub   = ImageFont.truetype(FONT, size=int(w * 0.032))
    except Exception:
        font_title = ImageFont.load_default()
        font_sub   = font_title

    title = 'Cooking Master'
    sub   = '스마트 가족 식단 관리'

    ty = iy + icon_size + int(h * 0.04)
    draw.text((w // 2, ty),          title, font=font_title, fill=ACCENT, anchor='mt')
    draw.text((w // 2, ty + int(h * 0.065)), sub, font=font_sub, fill=TEXT, anchor='mt')

    out_path = os.path.join(OUT, f'splash-{name}.png')
    img.save(out_path, 'PNG', optimize=True)
    print(f'  {name}: {w}x{h} → {out_path}')

print('Done.')
