# -*- coding: utf-8 -*-
"""Genererar repots sociala förhandsbild (docs/bilder/social-preview.png).

    python3 docs/bilder/social-preview.gen.py "webapp-kit" ut.html 368.19 26.5

Skriver en HTML-fil med en SVG i; rendera den i en webbläsare på 1280×640 och spara
som PNG. Ligger här för att bilden ska gå att göra om när texten ändras — annars är
en genererad bild omöjlig att justera i efterhand.

⚠️ De två sista argumenten är UPPMÄTTA värden för ordmärket: textens bredd och
avståndet från baslinjen till glyf-lådans mitt (getBBox() i Chrome). Ändras texten
eller teckenstorleken måste de mätas om — en gissad bredd gav en ruta vars mitt låg
10 px från textens, vilket syns som en skev logotyp.
"""
import random, sys, math

SANS = "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif"
MONO = "ui-monospace,Menlo,monospace"
FLW = [("#f6f1e4","#eab53a",11), ("#ec6f9e","#f7d24b",8), ("#9d78dd","#f2c94c",10),
       ("#f2895a","#5a3016",7), ("#f4c534","#8a5a12",8), ("#7aa6e6","#f5e79a",6),
       ("#e05a5a","#2c1410",6), ("#f3c7dc","#e07aa6",9)]

W, H = 1280, 640
ORD = sys.argv[1] if len(sys.argv) > 1 else "webapp-kit"
UT = sys.argv[2] if len(sys.argv) > 2 else "/dev/stdout"
TAG = "Batchjobb, live dashboard, designverktyg och projektminne för Claude Code-sessioner"

# ── ordmärket: rutan räknas ur texten ─────────────────────────────────────────
STORLEK = 68
PAD = STORLEK * 0.55
# ⚠️ MÄTT bredd, inte gissad. En uppskattning per tecken gav en ruta vars mitt låg 10 px
# från textens mitt — synligt som en skev logotyp. Värdet kommer från getBBox() i Chrome
# (se matt.mjs); ändras texten eller storleken måste det mätas om.
TEXT_B = float(sys.argv[3]) if len(sys.argv) > 3 else 390.19
# avstånd från baslinjen till glyf-lådans mitt, också uppmätt
BAS_OFFSET = float(sys.argv[4]) if len(sys.argv) > 4 else 26.5
OM_B = TEXT_B + 2 * PAD
OM_H = STORLEK * 1.52
OM_X = (W - OM_B) / 2
OM_Y = 196

TAG_Y = 392
TAG_SIZE = 23
TAG_B = len(TAG) * TAG_SIZE * 0.505
BAR_X, BAR_Y, BAR_B = 377, 444, 526
MONO_Y = 508

FORBJUDNA = [
 (OM_X-30, OM_Y-30, OM_X+OM_B+30, OM_Y+OM_H+30),
 ((W-TAG_B)/2-26, TAG_Y-32, (W+TAG_B)/2+26, TAG_Y+16),
 (BAR_X-32, BAR_Y-24, BAR_X+BAR_B+32, BAR_Y+30),
 (W/2-190, MONO_Y-24, W/2+190, MONO_Y+14),
]

def krockar(x, y, r):
    return any(x+r > x1 and x-r < x2 and y+r > y1 and y-r < y2 for x1,y1,x2,y2 in FORBJUDNA)

HALVDIAG = math.hypot(W/2, H/2)

def blomma(i, cx, cy, size, rot, op, blur):
    pc, ctr, n = FLW[i % len(FLW)]
    f = f' filter="url(#b{blur})"' if blur else ""
    s = (f'<g transform="translate({cx:.1f} {cy:.1f}) rotate({rot}) scale({size/44:.4f}) '
         f'translate(-22 -22)" opacity="{op:.2f}"{f}>')
    for k in range(n):
        s += f'<ellipse cx="22" cy="11" rx="5" ry="9.5" fill="{pc}" transform="rotate({k*360/n:.1f} 22 22)"/>'
    return s + f'<circle cx="22" cy="22" r="5.6" fill="{ctr}"/></g>'

def falt(frö=23, antal=230):
    """Djupfält: storleken växer BRANT med avståndet från mitten, så de yttersta
    blommorna är enorma och skärs av i kanten — som att flyga genom ett moln."""
    r = random.Random(frö)
    satta, sma, stora = [], [], []
    försök = 0
    while len(satta) < antal and försök < antal * 70:
        försök += 1
        x = r.uniform(-140, W + 140)
        y = r.uniform(-140, H + 140)
        d = min(math.hypot(x - W/2, y - H/2) / HALVDIAG, 1.35)
        size = (6 + 128 * (d ** 2.6)) * r.uniform(0.72, 1.28)
        rad = size * 0.5
        if krockar(x, y, rad):
            continue
        if any((x-px)**2 + (y-py)**2 < (rad + pr)**2 * 0.55 for px, py, pr in satta):
            continue
        satta.append((x, y, rad))
        # de största ligger "närmast kameran" → mjukas upp och tonas ned något
        blur = 0
        if size > 96:  blur = 3
        elif size > 62: blur = 2
        elif size > 40: blur = 1
        op = r.uniform(0.80, 1.0) if size < 40 else r.uniform(0.5, 0.78)
        b = blomma(len(satta), x, y, size, r.randint(0,359), op, blur)
        (stora if size >= 40 else sma).append(b)
    # små bakom, stora framför → djupkänslan
    return "".join(sma) + "".join(stora), len(satta)

blommor, n = falt()
print(f"<!-- {n} blommor -->", file=sys.stderr)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
 <defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#0d1a14"/><stop offset="1" stop-color="#070f0b"/></linearGradient>
  <linearGradient id="klar" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#1f7a5b"/><stop offset="1" stop-color="#2fd39a" stop-opacity=".9"/></linearGradient>
  <radialGradient id="dis" cx="50%" cy="47%" r="54%">
    <stop offset="0" stop-color="#070f0b" stop-opacity=".82"/>
    <stop offset="0.55" stop-color="#070f0b" stop-opacity=".34"/>
    <stop offset="1" stop-color="#070f0b" stop-opacity="0"/></radialGradient>
  <filter id="b1" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.1"/></filter>
  <filter id="b2" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.6"/></filter>
  <filter id="b3" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
 </defs>
 <rect width="{W}" height="{H}" fill="url(#bg)"/>
 {blommor}
 <rect width="{W}" height="{H}" fill="url(#dis)"/>

 <rect x="{OM_X:.0f}" y="{OM_Y}" width="{OM_B:.0f}" height="{OM_H:.0f}" rx="16" fill="none"
       stroke="#f4f7f5" stroke-width="5.2"/>
 <text x="{W/2}" y="{OM_Y + OM_H/2 + BAS_OFFSET:.1f}" id="ordmarke" text-anchor="middle"
       font-size="{STORLEK}" font-weight="800" fill="#f4f7f5" font-family="{SANS}">{ORD}</text>

 <text x="{W/2}" y="{TAG_Y}" font-size="{TAG_SIZE}" fill="#cfe6da" text-anchor="middle"
       font-family="{SANS}">{TAG}</text>

 <rect x="{BAR_X}" y="{BAR_Y}" width="{BAR_B}" height="9" rx="5" fill="#16241d"/>
 <rect x="{BAR_X}" y="{BAR_Y}" width="{BAR_B*0.75:.0f}" height="9" rx="5" fill="url(#klar)"/>

 <text x="{W/2}" y="{MONO_Y}" font-size="15" fill="#8fb3a3" text-anchor="middle"
       font-family="{MONO}" letter-spacing="2.4">EN CLAUDE CODE-PLUGIN</text>
</svg>'''
open(UT, "w", encoding="utf-8").write(
  f'<!doctype html><meta charset="utf-8"><style>html,body{{margin:0;background:#070f0b}}</style>{svg}')
