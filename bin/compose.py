#!/usr/bin/env python3
"""Stitch before/after crops (from bin/shot.mjs) side-by-side → ONE PNG.

Produces the image to review after a GUI change: FÖRE | EFTER (BEFORE | AFTER),
cropped to the changed element, with labels + a caption line burned into the image.

Dependency: Pillow (PIL). Install with `pip install Pillow` (or run it with a
Python that already has Pillow available).

Usage:
  python bin/compose.py <before.png> <after.png> "<caption>" <out.png>
"""
import sys

# ⚠️ Samma princip som bin/krav-puppeteer.mjs: ett saknat beroende får aldrig möta
# användaren som en rå stacktrace. Uppmätt i en granskning 2026-08-18 — det här skriptet
# var det enda som fortfarande dog med `ImportError: No module named 'PIL'`, hos precis den
# användare som lovats att aldrig behöva förstå en sådan.
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit(
        "[webapp-kit] Före/efter-bilden kunde inte byggas.\n"
        "\n"
        'Det som saknas: python-paketet "Pillow" finns inte på den här datorn.\n'
        "Vad det är: biblioteket som klistrar ihop två skärmdumpar till en jämförelsebild.\n"
        "\n"
        "TILL CLAUDE — gör detta åt användaren, be aldrig hen köra det:\n"
        "  1. `python3 -m pip install --user Pillow`\n"
        "  2. Kör om kommandot.\n"
        'Berätta i klartext vad du gjorde ("jag installerade det som bygger jämförelsebilder").\n'
        "\n"
        "Går det inte: fortsätt utan sammansatt före/efter-bild — de enskilda skärmdumparna\n"
        "fungerar ändå — och skriv i rapporten VARFÖR jämförelsebilden saknas.\n"
    )

if len(sys.argv) != 5:
    sys.exit("Usage: compose.py <before.png> <after.png> <caption> <out.png>")
before_p, after_p, caption, out_p = sys.argv[1:5]

BG = (241, 245, 249)     # light frame
FRAME = (203, 213, 225)  # edge around each image
TXT = (15, 23, 42)       # dark text
CAP_BG = (226, 232, 240)


def font(size, bold=False):
    for path in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold
        else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


f_label = font(30, bold=True)
f_cap = font(28, bold=True)

b = Image.open(before_p).convert("RGB")
a = Image.open(after_p).convert("RGB")

# Normalize width so the pair looks balanced.
W = max(b.width, a.width)


def norm(im):
    if im.width != W:
        im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
    return im


b, a = norm(b), norm(a)

PAD, GAP, LABEL_H, CAP_H, FW = 28, 28, 46, 64, 2
col_h = max(b.height, a.height)
total_w = PAD * 2 + W * 2 + GAP
total_h = PAD + LABEL_H + col_h + 16 + CAP_H + PAD

canvas = Image.new("RGB", (total_w, total_h), BG)
d = ImageDraw.Draw(canvas)


def col(x0, im, label):
    d.text((x0, PAD + 4), label, font=f_label, fill=TXT)
    iy = PAD + LABEL_H
    d.rectangle([x0 - FW, iy - FW, x0 + W + FW, iy + im.height + FW], outline=FRAME, width=FW)
    canvas.paste(im, (x0, iy))


col(PAD, b, "FÖRE")
col(PAD + W + GAP, a, "EFTER")

cy = PAD + LABEL_H + col_h + 16
d.rectangle([PAD, cy, total_w - PAD, cy + CAP_H], fill=CAP_BG)
tb = d.textbbox((0, 0), caption, font=f_cap)
d.text((PAD + 18, cy + (CAP_H - (tb[3] - tb[1])) // 2 - tb[1]), caption, font=f_cap, fill=TXT)

canvas.save(out_p)
print(f"OK {canvas.width}x{canvas.height} -> {out_p}")
