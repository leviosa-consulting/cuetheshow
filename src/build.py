#!/usr/bin/env python3
"""Build CueTheShow from the template.
Edit app_template.html, then run:  python3 build.py

Variants:
  full — pdf.js inlined, fully self-contained (offline artifact)
  slim — no inline pdf.js; over http(s) it fetches pdf.min.js on demand,
         from disk it behaves as the lite build

Outputs:
  ../subtitle-console.html        full (local dev / offline)
  ../subtitle-console-lite.html   slim (local lite)
  ../docs/index.html              slim (hosted — ~100 KB page)
  ../docs/lite.html               slim (kept for old links)
  ../docs/cuetheshow-offline.html full (the downloadable offline copy)
  ../docs/pdf.min.js, pdf.worker.min.js  fetched on demand by the slim build
"""
import os, shutil
d = os.path.dirname(os.path.abspath(__file__))
tpl = open(os.path.join(d, 'app_template.html')).read()

full = (tpl.replace('<!--PDFWORKER-->', open(os.path.join(d, 'pdf.worker.min.js')).read())
           .replace('<!--PDFJS-->', open(os.path.join(d, 'pdf.min.js')).read()))
slim = tpl.replace('<!--PDFWORKER-->', '').replace('<!--PDFJS-->', '')

targets = [
    ('subtitle-console.html', full),
    ('subtitle-console-lite.html', slim),
    (os.path.join('docs', 'index.html'), slim),
    (os.path.join('docs', 'lite.html'), slim),
    (os.path.join('docs', 'cuetheshow-offline.html'), full),
]
for name, out in targets:
    target = os.path.join(d, '..', name)
    open(target, 'w').write(out)
    print('built', os.path.normpath(target), f'({len(out):,} bytes)')
for f in ('pdf.min.js', 'pdf.worker.min.js'):
    shutil.copy(os.path.join(d, f), os.path.join(d, '..', 'docs', f))
    print('copied docs/' + f)
