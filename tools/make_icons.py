"""PWA 아이콘 생성 (PIL). 실행: python tools/make_icons.py"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "icons")
os.makedirs(OUT, exist_ok=True)
BG = (31, 111, 95)
FG = (246, 247, 245)
ACC = (255, 196, 87)

def draw(size, maskable=False):
    img = Image.new("RGBA", (size, size), BG if maskable else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if not maskable:
        r = size * 0.22
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BG)
    pad = size * (0.26 if maskable else 0.18)
    # 접시(원) + 체크(선)
    d.ellipse([pad, pad, size - pad, size - pad], outline=FG, width=max(2, size // 22))
    cx, cy = size / 2, size / 2
    w = max(3, size // 14)
    pts = [(cx - size * 0.16, cy + size * 0.01), (cx - size * 0.04, cy + size * 0.13), (cx + size * 0.18, cy - size * 0.12)]
    d.line(pts, fill=ACC, width=w, joint="curve")
    return img

for s in (192, 512, 180):
    draw(s).save(os.path.join(OUT, f"icon-{s}.png"))
draw(512, maskable=True).save(os.path.join(OUT, "icon-512-maskable.png"))
print("icons written to", OUT)
