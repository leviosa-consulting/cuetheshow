#!/usr/bin/env python3
"""Generate ticket.html (the CueTheShow donate page) with an inline SVG UPI QR.
Usage: python3 gen_ticket.py <vpa> <payee name> <output path>
"""
import sys, html, urllib.parse
import qrcode

vpa, name, out = sys.argv[1], sys.argv[2], sys.argv[3]
upi_url = 'upi://pay?pa=%s&pn=%s&cu=INR' % (
    urllib.parse.quote(vpa, safe='@.'), urllib.parse.quote(name))

q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=2)
q.add_data(upi_url)
q.make()
m = q.get_matrix()
n = len(m)
cells = []
for y, row in enumerate(m):
    x = 0
    while x < n:
        if row[x]:
            x0 = x
            while x < n and row[x]:
                x += 1
            cells.append('<rect x="%d" y="%d" width="%d" height="1"/>' % (x0, y, x - x0))
        else:
            x += 1
qr_svg = ('<svg viewBox="0 0 %d %d" role="img" aria-label="QR code for UPI payment" '
          'shape-rendering="crispEdges" fill="#16181d">%s</svg>') % (n, n, ''.join(cells))

page = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Send me a ticket to your show · CueTheShow</title>
<meta name="robots" content="noindex">
<style>
  :root {
    --bg: #16181d; --panel: #1e2128; --panel2: #262a33; --border: #333845;
    --text: #e8eaf0; --muted: #9aa1af; --accent: #5b9dd9; --accent-soft: #2c4258;
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    background: var(--bg); color: var(--text);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    min-height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; padding: 28px 16px; gap: 22px;
  }
  a { color: var(--accent); }
  .brand { display: flex; align-items: center; gap: 9px; text-decoration: none; }
  .brand img { width: 28px; height: 28px; border-radius: 6px; }
  .brand span { font-size: 17px; font-weight: 700; color: var(--muted); letter-spacing: .3px; }
  .card {
    background: var(--panel); border: 1px solid var(--border); border-radius: 14px;
    padding: 26px 26px 22px; max-width: 420px; width: 100%; text-align: center;
  }
  h1 { font-size: 21px; margin-bottom: 10px; }
  .card > p { color: var(--muted); font-size: 14px; }
  .ask {
    background: var(--panel2); border: 1px solid var(--border); border-radius: 10px;
    padding: 14px 16px; margin: 18px 0;
  }
  .ask p { font-size: 14px; color: var(--text); }
  .idRow {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    background: var(--panel2); border: 1px solid var(--border); border-radius: 8px;
    padding: 9px 10px; margin: 8px 0 4px;
  }
  .idRow code { font-size: 14px; color: var(--text); overflow-wrap: anywhere; }
  .idRow button {
    font: inherit; font-size: 13px; color: var(--text); cursor: pointer;
    background: var(--accent-soft); border: 1px solid var(--accent);
    border-radius: 6px; padding: 4px 12px; flex-shrink: 0;
  }
  .fine { font-size: 12px; color: var(--muted); margin-top: 10px; }
  details { margin-top: 14px; }
  summary {
    font-size: 12px; color: var(--muted); cursor: pointer;
    text-decoration: underline; text-underline-offset: 2px; list-style: none;
  }
  summary::-webkit-details-marker { display: none; }
  .qrWrap {
    background: #fff; border-radius: 8px; padding: 8px;
    width: 164px; margin: 12px auto 4px;
  }
  .qrWrap svg { display: block; width: 100%; height: auto; }
  .scanHint { font-size: 12px; color: var(--muted); margin-top: 6px; }
  .back { font-size: 13px; }
</style>
</head>
<body>
<a class="brand" href="./"><img src="icon-192.png" alt=""><span>CueTheShow</span></a>
<div class="card">
  <h1>Send me a ticket to your show</h1>
  <p>CueTheShow is free and always will be. If it earned its place backstage, you can send me something back. This is absolutely optional. There is no pressure, not even implied.</p>
  <div class="ask">
    <p>The nicest thing you can send me is not money: email me a photo of your ticket and one from the curtain call.<br>
    <a href="mailto:abhilash.purohit@gmail.com?subject=Tickets%20from%20our%20show">abhilash.purohit@gmail.com</a></p>
  </div>
  <p>Or send me what one ticket to your show costs. My UPI ID:</p>
  <div class="idRow"><code id="vpa">__VPA__</code><button id="copyBtn">Copy</button></div>
  <p class="fine">UPI is India's bank transfer system. It works with Indian bank accounts only, so there is no way to pay from other countries yet.</p>
  <details>
    <summary>Prefer to scan a QR code?</summary>
    <div class="qrWrap">__QR__</div>
    <p class="scanHint">Scan with any UPI payment app, such as Google&nbsp;Pay, PhonePe or Paytm.</p>
  </details>
</div>
<a class="back" href="./">&#8592; Back to CueTheShow</a>
<script>
  document.getElementById('copyBtn').addEventListener('click', function () {
    var b = this;
    navigator.clipboard.writeText(document.getElementById('vpa').textContent).then(function () {
      b.textContent = 'Copied';
      setTimeout(function () { b.textContent = 'Copy'; }, 1600);
    });
  });
</script>
</body>
</html>
"""

page = page.replace('__QR__', qr_svg).replace('__VPA__', html.escape(vpa))
open(out, 'w').write(page)
print('wrote', out, '· QR encodes:', upi_url, '· matrix %dx%d' % (n, n))
