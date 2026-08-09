#!/usr/bin/env python3
"""Build CueTheShow from the template.
Edit app_template.html, then run:  python3 build.py

Outputs:
  ../subtitle-console.html        local full build (PDF + paste + json)
  ../subtitle-console-lite.html   local lite build (no pdf.js)
  ../docs/index.html              hosted full build
  ../docs/lite.html               hosted lite build
  ../docs/cuetheshow-offline.html downloadable offline copy (= full build)
"""
import os
d = os.path.dirname(os.path.abspath(__file__))
tpl = open(os.path.join(d, 'app_template.html')).read()

full = (tpl.replace('<!--PDFWORKER-->', open(os.path.join(d, 'pdf.worker.min.js')).read())
           .replace('<!--PDFJS-->', open(os.path.join(d, 'pdf.min.js')).read()))
lite = tpl.replace('<!--PDFWORKER-->', '').replace('<!--PDFJS-->', '')

targets = [
    ('subtitle-console.html', full),
    ('subtitle-console-lite.html', lite),
    (os.path.join('docs', 'index.html'), full),
    (os.path.join('docs', 'lite.html'), lite),
    (os.path.join('docs', 'cuetheshow-offline.html'), full),
]
for name, out in targets:
    target = os.path.join(d, '..', name)
    open(target, 'w').write(out)
    print('built', os.path.normpath(target), f'({len(out):,} bytes)')
