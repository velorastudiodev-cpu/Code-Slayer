# Ikon pixel art Code Slayer (16×16): pedang nichirin di atas pola kotak-kotak haori. Menulis favicon.svg + PNG PWA/Android.
from PIL import Image
P = {'.': None, 'k': (30, 27, 24), 'g': (47, 143, 91), 'G': (32, 102, 64), 'w': (232, 224, 207), 's': (180, 190, 200), 'r': (192, 57, 43), 'y': (230, 180, 60)}
ART = [
    "kkkkkkkkkkkkkkkk",
    "kgGgGgGgGgGgGsGk",
    "kGgGgGgGgGgGsgGk",
    "kgGgGgGgGgGsGgGk",
    "kGgGgGgGgGsgGgGk",
    "kgGgGgGgGsGgGgGk",
    "kGgGgGgGsgGgGgGk",
    "kgGgGgGsGgGgGgGk",
    "kGgGgGsgGgGgGgGk",
    "kgGgGsGgGgGgGgGk",
    "kGgGyyyGgGgGgGgk",
    "kgGgGyGgGgGgGgGk",
    "kGgGrgGgGgGgGgGk",
    "kgGrGgGgGgGgGgGk",
    "kGrGgGgGgGgGgGgk",
    "kkkkkkkkkkkkkkkk",
]
def img(size, pad=0):
    im = Image.new('RGBA', (16 + 2 * pad, 16 + 2 * pad), P['k'] + (255,))
    for y, row in enumerate(ART):
        for x, c in enumerate(row):
            if P[c]: im.putpixel((x + pad, y + pad), P[c] + (255,))
    return im.resize((size, size), Image.NEAREST)
img(192).save('public/icon-192.png'); img(512).save('public/icon-512.png')
img(512, pad=3).save('public/icon-maskable-512.png')  # zona aman maskable (≈ 80%)
img(180).save('public/apple-touch-icon.png')
rects = ''.join(f'<rect x="{x}" y="{y}" width="1" height="1" fill="#{"%02x%02x%02x" % P[c]}"/>' for y, row in enumerate(ART) for x, c in enumerate(row) if c != 'k')
open('public/favicon.svg', 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="#1e1b18"/>{rects}</svg>\n')
print('ok')

# Ikon launcher Android (Capacitor): mipmap legacy + adaptive foreground (zona aman 66/108).
import os
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
if os.path.isdir('android/app/src/main/res'):
    for d, k in DENS.items():
        base = f'android/app/src/main/res/mipmap-{d}'
        img(int(48 * k)).save(f'{base}/ic_launcher.png'); img(int(48 * k)).save(f'{base}/ic_launcher_round.png')
        fg = Image.new('RGBA', (int(108 * k),) * 2, (0, 0, 0, 0)); s = int(72 * k); fg.paste(img(s), ((fg.width - s) // 2,) * 2)
        fg.save(f'{base}/ic_launcher_foreground.png')
    p = 'android/app/src/main/res/values/ic_launcher_background.xml'
    open(p, 'w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1E1B18</color>\n</resources>\n')
    print('android icons ok')

# Splash Capacitor: ikon pixel di tengah latar kertas.
import glob
for f in glob.glob('android/app/src/main/res/drawable*/splash.png'):
    w, h = Image.open(f).size
    bg = Image.new('RGB', (w, h), (244, 238, 226)); s = (min(w, h) // 3) // 16 * 16
    bg.paste(img(s).convert('RGB'), ((w - s) // 2, (h - s) // 2)); bg.save(f)
