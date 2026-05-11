"""
OG Image 생성 — 1200×630 소셜 공유 미리보기
출력: public/og.png
"""
from PIL import Image, ImageDraw, ImageFont

OUT  = '/Users/chiwon/workspace/cooking-master/public/og.png'
LOGO = '/Users/chiwon/workspace/cooking-master/public/logo.png'
FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc'

W, H = 1200, 630

# ── 색상 ─────────────────────────────────────────────────
TERRACOTTA = (200, 101, 74)   # #C8654A
DARK       = (160,  76, 52)   # 어두운 테라코타
CREAM      = (255, 248, 242)  # 크림 화이트
WHITE      = (255, 255, 255)
SEMI       = (255, 255, 255, 180)

# ── 캔버스 ───────────────────────────────────────────────
canvas = Image.new('RGB', (W, H), TERRACOTTA)
draw   = ImageDraw.Draw(canvas, 'RGBA')

# ── 배경 그라디언트 (좌→우, 점점 어둡게) ──────────────────
grad = Image.new('RGBA', (W, H), (0, 0, 0, 0))
gd   = ImageDraw.Draw(grad)
for x in range(W):
    alpha = int(60 * (x / W))
    gd.line([(x, 0), (x, H)], fill=(0, 0, 0, alpha))
canvas.paste(Image.new('RGB', (W, H), DARK),
             mask=grad.split()[3])

# ── 우상단 장식 원 ────────────────────────────────────────
draw.ellipse([900, -120, 1350, 330], fill=(255, 255, 255, 12))
draw.ellipse([1000, -60, 1380, 320], fill=(255, 255, 255, 8))

# ── 좌하단 장식 원 ────────────────────────────────────────
draw.ellipse([-80, 380, 220, 700], fill=(0, 0, 0, 15))

# ── 로고 ─────────────────────────────────────────────────
LOGO_SIZE = 200
logo = Image.open(LOGO).convert('RGBA')
logo = logo.resize((LOGO_SIZE, LOGO_SIZE), Image.LANCZOS)

# 로고 배경 원
logo_cx, logo_cy = 180, 280
r = LOGO_SIZE // 2 + 20
draw.ellipse([logo_cx - r, logo_cy - r, logo_cx + r, logo_cy + r],
             fill=(255, 255, 255, 30))

logo_x = logo_cx - LOGO_SIZE // 2
logo_y = logo_cy - LOGO_SIZE // 2
canvas.paste(logo, (logo_x, logo_y), logo)

# ── 폰트 로드 ─────────────────────────────────────────────
def font(size, weight_idx=3):  # AppleSDGothicNeo: 0=UltraLight…6=Bold
    try:
        return ImageFont.truetype(FONT, size, index=weight_idx)
    except Exception:
        return ImageFont.load_default()

font_title    = font(72, 5)   # Bold에 가까운 굵기
font_subtitle = font(42, 4)
font_tag      = font(30, 2)
font_url      = font(22, 1)

# ── 텍스트 영역 시작 X ────────────────────────────────────
TX = 420

# ── "Cooking Master" ──────────────────────────────────────
draw.text((TX, 140), 'Cooking Master', font=font_title, fill=WHITE)

# ── "쿠킹마스터" ──────────────────────────────────────────
draw.text((TX, 230), '쿠킹마스터', font=font_subtitle, fill=(255, 248, 242))

# ── 구분선 ────────────────────────────────────────────────
draw.rectangle([TX, 290, TX + 480, 293], fill=(255, 255, 255, 120))

# ── 태그라인 ──────────────────────────────────────────────
tags = [
    '→  AI가 2주 식단을 자동으로 만들어줘요',
    '→  이유식 단계별 자동 분기',
    '→  장보는 날 맞춰 장바구니 자동 생성',
]
for i, t in enumerate(tags):
    draw.text((TX, 315 + i * 52), t, font=font_tag, fill=(255, 248, 242))

# ── URL 배지 ──────────────────────────────────────────────
badge_y = 520
badge_text = 'cooking-master-tau.vercel.app'
bbox = draw.textbbox((0, 0), badge_text, font=font_url)
bw = bbox[2] - bbox[0] + 40
bh = bbox[3] - bbox[1] + 16
draw.rounded_rectangle([TX, badge_y, TX + bw, badge_y + bh],
                        radius=8, fill=(255, 255, 255, 40))
draw.text((TX + 20, badge_y + 8), badge_text, font=font_url,
          fill=(255, 248, 242))

# ── 저장 ─────────────────────────────────────────────────
canvas.convert('RGB').save(OUT, 'PNG', optimize=True)
print(f'✅  OG image saved → {OUT}')
print(f'    Size: {W}×{H}px')
