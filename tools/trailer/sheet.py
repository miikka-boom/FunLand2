"""Tile frames into a labelled contact sheet: python3 -I sheet.py <out.jpg> <cols> <width> <frame> [frame ...]"""
import sys
from PIL import Image, ImageDraw

out, cols, width = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
paths = sys.argv[4:]
ims = [Image.open(p).convert('RGB') for p in paths]
w = width
h = round(ims[0].height * w / ims[0].width)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w + (cols - 1) * 6, rows * h + (rows - 1) * 6), (255, 255, 255))
d = ImageDraw.Draw(sheet)
for k, (im, p) in enumerate(zip(ims, paths)):
    x, y = (k % cols) * (w + 6), (k // cols) * (h + 6)
    sheet.paste(im.resize((w, h), Image.LANCZOS), (x, y))
    label = p.split('/')[-2] + '/' + p.split('/')[-1]
    d.rectangle([x, y, x + 8 * len(label) + 8, y + 18], fill=(0, 0, 0))
    d.text((x + 4, y + 3), label, fill=(255, 255, 0))
sheet.save(out, quality=88)
print(out, sheet.size)
