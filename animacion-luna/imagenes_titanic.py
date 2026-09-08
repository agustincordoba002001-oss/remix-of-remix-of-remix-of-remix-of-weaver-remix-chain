"""Dibujos del video del Titanic: uno propio por escena, gratis e ilimitados.

Cada escena genera /mnt/documents/ref_tt/<key>.png con fondo transparente,
listo para el render estilo pizarra. Si el proceso se corta, al volver a
ejecutarlo continúa donde quedó.
"""
import os
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image, ImageEnhance, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guion_titanic import GUION  # noqa: E402

DEST = '/mnt/documents/ref_tt'
CRUDO = '/mnt/documents/ref_tt_crudo'
os.makedirs(DEST, exist_ok=True)
os.makedirs(CRUDO, exist_ok=True)

ESTILO = ('minimalist black and white line art sketch, marker pen outlines, '
          'single subject centered on pure white background, flat, no gradients, '
          'no text, no words, no letters, no watermark, no frame')

# El fondo del dibujo siempre es blanco: se sacan las palabras que oscurecen la escena.
OSCURAS = (('at night', ''), ('night sky', 'sky'), (' at dusk', ''), ('night', ''),
           ('dark water', 'water'), ('darkness', 'the horizon'), ('dark', ''))


def limpiar(prompt):
    for a, b in OSCURAS:
        prompt = prompt.replace(a, b)
    return ' '.join(prompt.split())


def descargar(prompt, destino, semilla):
    url = ('https://image.pollinations.ai/prompt/'
           + urllib.parse.quote(f'{limpiar(prompt)}, {ESTILO}')
           + f'?width=1024&height=1024&nologo=true&seed={semilla}&model=turbo')
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=240) as r:
        datos = r.read()
    if len(datos) < 5000:
        raise RuntimeError('respuesta demasiado chica')
    with open(destino, 'wb') as f:
        f.write(datos)


def a_dibujo(origen, destino):
    """Deja el dibujo con fondo transparente y trazo bien marcado."""
    im = Image.open(origen).convert('RGB')
    im = ImageOps.autocontrast(im, cutoff=1)
    im = ImageEnhance.Color(im).enhance(1.12)
    im = ImageEnhance.Contrast(im).enhance(1.18)
    gris = ImageOps.grayscale(im)
    # Todo lo casi blanco se vuelve transparente; el resto queda opaco.
    alfa = gris.point(lambda v: 0 if v > 238 else (255 if v < 214 else int((238 - v) * 255 / 24)))
    out = im.convert('RGBA')
    out.putalpha(alfa)
    bb = out.getbbox()
    if bb:
        out = out.crop(bb)
    out.thumbnail((900, 900), Image.Resampling.LANCZOS)
    out.save(destino)


def main():
    faltan = [s for s in GUION if not os.path.exists(f'{DEST}/{s["key"]}.png')]
    print('faltan', len(faltan), 'dibujos', flush=True)
    for n, s in enumerate(faltan):
        crudo = f'{CRUDO}/{s["key"]}.jpg'
        for intento in range(4):
            try:
                if not os.path.exists(crudo):
                    descargar(s['prompt'], crudo, 1000 + int(s['key'][1:]))
                a_dibujo(crudo, f'{DEST}/{s["key"]}.png')
                break
            except Exception as err:  # noqa: BLE001
                print('reintento', s['key'], err, flush=True)
                if os.path.exists(crudo):
                    os.remove(crudo)
                time.sleep(5 + intento * 10)
        if n % 5 == 0:
            print('dibujo', n, 'de', len(faltan), flush=True)
    print('LISTO dibujos')


if __name__ == '__main__':
    main()
